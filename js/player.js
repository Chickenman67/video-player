/* ==========================================================================
   Core Player Module
   Handles video element, state management, and core playback
   ========================================================================== */

const Player = {
  // DOM Elements
  video: null,
  container: null,
  loadScreen: null,
  loadingSpinner: null,
  errorOverlay: null,
  errorMessage: null,
  videoInput: null,
  loadNewBtn: null,

  // Current file reference for codec detection
  currentFile: null,

  // State
  state: {
    isPlaying: false,
    isPaused: true,
    isSeeking: false,
    isMuted: false,
    volume: 1,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    playbackRate: 1,
    isFullscreen: false,
    isControlsHidden: false,
    controlsTimeout: null,
    controlsHideTimeout: null,
    hasError: false,
    isLoadingNewVideo: false,
    loadingProgress: 0,
    // Quality metadata
    qualityInfo: {
      videoCodec: 'Unknown',
      audioCodec: 'Unknown',
      width: 0,
      height: 0,
      resolution: 'Unknown',
      bitrate: 0,
      framerate: 0,
      supportedVideoCodecs: [],
      supportedAudioCodecs: []
    },
    // Buffering settings
    buffering: {
      bufferAheadTarget: 10, // seconds
      bufferBehindTarget: 5, // seconds
      autoQuality: true,
      maxBitrate: null, // unlimited
      lastNetworkSpeed: 0, // kbps
      bufferHealth: 'good', // 'good', 'warning', 'critical'
      consecutiveUnderruns: 0
    }
  },

  // Cleanup functions
  cleanupFns: [],

  /**
   * Initialize the player
   */
  init() {
    this.cacheElements();
    this.bindEvents();
    console.log('[Player] Initialized');
  },

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.container = Utils.$('#playerContainer');
    this.controlsContainer = Utils.$('.controls-container');
    this.loadScreen = Utils.$('#loadScreen');
    this.video = Utils.$('#videoPlayer');
    this.loadingSpinner = Utils.$('#loadingSpinner');
    this.errorOverlay = Utils.$('#errorOverlay');
    this.errorMessage = Utils.$('#errorMessage');
    this.videoInput = Utils.$('#videoInput');
    this.loadNewBtn = Utils.$('#loadNewBtn');
  },

  /**
   * Show controls briefly on mouse move
   */
  showControlsBriefly() {
    if (this.state.isPaused) return; // Always show when paused
    
    // Show controls
    this.container.classList.remove('controls-hidden');
    
    // Clear existing timeout
    if (this.state.controlsHideTimeout) {
      clearTimeout(this.state.controlsHideTimeout);
    }
    
    // Hide after 3 seconds of inactivity
    this.state.controlsHideTimeout = setTimeout(() => {
      if (!this.state.isPaused) {
        this.container.classList.add('controls-hidden');
      }
    }, 3000);
  },

  /**
   * Bind core events
   */
  bindEvents() {
    // Double-click detection for fullscreen
    let clickTimeout = null;
    let clickCount = 0;
    
    const handleVideoClick = (e) => {
      clickCount++;
      
      if (clickCount === 1) {
        clickTimeout = setTimeout(() => {
          // Single click - toggle play/pause
          if (clickCount === 1) {
            this.togglePlay();
          }
          clickCount = 0;
        }, 300); // 300ms delay to detect double-click
      } else if (clickCount === 2) {
        // Double click - toggle fullscreen
        clearTimeout(clickTimeout);
        clickCount = 0;
        this.toggleFullscreen();
      }
    };
    
    // Video events
    this.cleanupFns.push(
      Utils.on(this.video, 'loadstart', () => this.onLoadStart()),
      Utils.on(this.video, 'loadedmetadata', () => this.onMetadataLoaded()),
      Utils.on(this.video, 'canplay', () => this.onCanPlay()),
      Utils.on(this.video, 'waiting', () => this.showLoading()),
      Utils.on(this.video, 'playing', () => this.onPlaying()),
      Utils.on(this.video, 'pause', () => this.onPause()),
      Utils.on(this.video, 'timeupdate', Utils.throttle(() => this.onTimeUpdate(), 100)),
      Utils.on(this.video, 'progress', () => this.onProgress()),
      Utils.on(this.video, 'volumechange', () => this.onVolumeChange()),
      Utils.on(this.video, 'ratechange', () => this.onRateChange()),
      Utils.on(this.video, 'ended', () => this.onEnded()),
      Utils.on(this.video, 'error', (e) => this.onError(e)),
      Utils.on(this.container, 'mousemove', () => this.showControlsBriefly()),
      Utils.on(this.video, 'click', handleVideoClick),
      Utils.on(this.video, 'dblclick', (e) => {
        e.preventDefault();
        this.toggleFullscreen();
      })
    );

    // File input
    this.cleanupFns.push(
      Utils.on(this.videoInput, 'change', (e) => this.loadFile(e))
    );

    // Drag and drop handlers
    this.setupDragAndDrop();

    // Load new button
    this.cleanupFns.push(
      Utils.on(this.loadNewBtn, 'click', () => this.showLoadScreen())
    );

    // Controls visibility
    this.cleanupFns.push(
      Utils.on(this.container, 'mousemove', () => this.showControls()),
      Utils.on(this.container, 'mouseleave', () => this.startHideControls())
    );
  },

  /**
   * Load video from file input
   */
  loadFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate it's a video file
    const fileName = file.name.toLowerCase();
    const fileType = file.type.toLowerCase();
    const isVideoFile = fileType.startsWith('video/') || 
                       fileName.match(/\.(mp4|mkv|webm|avi|mov|flv|wmv|m4v|ts|mts|m2ts|vob|ogv|3gp|3g2)$/i);
    
    if (!isVideoFile) {
      this.showError('Please select a valid video file (MP4, MKV, WebM, AVI, MOV, etc.)');
      console.error('[Player] Invalid file type:', file.type, 'name:', file.name);
      return;
    }

    // Check audio codec compatibility (especially for ChromeOS)
    const audioInfo = Utils.getAudioCodecInfo(file);
    if (!audioInfo.supported && audioInfo.codec !== 'Unknown') {
      const os = Utils.detectOS();
      let warningMsg = `Warning: Audio codec ${audioInfo.codec} may not be supported`;
      
      if (Utils.isChromeOS()) {
        warningMsg = `Audio codec ${audioInfo.codec} is not supported on ChromeOS. Video will play but audio may be silent. Try converting to AAC or MP3.`;
      } else if (os === 'ios') {
        warningMsg = `Audio codec ${audioInfo.codec} has limited support on iOS. Video may play without audio.`;
      }
      
      console.warn('[Player]', warningMsg);
      // Show warning but continue loading - video might still work
      this.showWarning(warningMsg);
    }

    // Prevent multiple simultaneous loads
    if (this.state.isLoadingNewVideo) {
      console.warn('[Player] Already loading a video, please wait');
      return;
    }

    this.state.isLoadingNewVideo = true;
    this.currentFile = file; // Store file reference for codec detection
    
    // Create new video URL with revocation timeout for safety
    const newUrl = URL.createObjectURL(file);
    const oldSrc = this.video.src;
    const oldBlob = oldSrc && oldSrc.startsWith('blob:') ? oldSrc : null;
    
    console.log('[Player] Starting to load file:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)}MB)`);
    
    // Create a temporary video element to test if video can load
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.crossOrigin = 'anonymous';
    
    let canPlayFired = false;
    let metadataLoaded = false;
    let loadTimeout = null;
    
    // Cleanup function
    const cleanup = () => {
      canPlayFired = true; // Prevent duplicate loads
      clearTimeout(loadTimeout);
      tempVideo.removeEventListener('canplay', onCanPlay);
      tempVideo.removeEventListener('loadedmetadata', onMetadata);
      tempVideo.removeEventListener('error', onError);
      tempVideo.removeEventListener('progress', onProgress);
      tempVideo.src = '';
      tempVideo.load();
    };
    
    // Track loading progress
    const onProgress = () => {
      if (tempVideo.buffered.length > 0) {
        const bufferedEnd = tempVideo.buffered.end(tempVideo.buffered.length - 1);
        const duration = tempVideo.duration || 1;
        this.state.loadingProgress = Math.round((bufferedEnd / duration) * 100);
      }
    };
    
    // When metadata is loaded
    const onMetadata = () => {
      metadataLoaded = true;
      console.log('[Player] Video metadata loaded:', {
        duration: tempVideo.duration,
        videoWidth: tempVideo.videoWidth,
        videoHeight: tempVideo.videoHeight
      });
    };
    
    // When video can start playing
    const onCanPlay = () => {
      if (canPlayFired) return;
      
      // Verify we have valid metadata
      if (!metadataLoaded || tempVideo.duration === 0 || isNaN(tempVideo.duration)) {
        console.warn('[Player] Invalid video metadata, retrying...');
        return;
      }
      
      cleanup();
      
      // Now swap the video source to the actual video element
      console.log('[Player] Video is ready, swapping sources...');
      this.video.src = newUrl;
      
      // Update UI state
      this.hideError();
      this.loadScreen.classList.add('hidden');
      this.container.classList.remove('hidden');
      
      // Auto-play the new video
      setTimeout(() => {
        if (!this.state.hasError) {
          this.play();
        }
      }, 100);
      
      // Cleanup old blob URL after a delay (give browser time to finalize)
      setTimeout(() => {
        if (oldBlob && oldSrc !== newUrl) {
          try {
            URL.revokeObjectURL(oldBlob);
            console.log('[Player] Cleaned up old video blob');
          } catch (err) {
            console.warn('[Player] Could not revoke old blob:', err.message);
          }
        }
      }, 1000);
      
      this.state.isLoadingNewVideo = false;
      console.log('[Player] File loaded successfully:', file.name);
    };
    
    // Handle errors
    const onError = () => {
      if (canPlayFired) return;
      cleanup();
      
      const errorCode = tempVideo.error?.code;
      let errorMsg = 'Error loading video file';
      
      if (errorCode === MediaError.MEDIA_ERR_ABORTED) {
        errorMsg = 'Video loading was aborted';
      } else if (errorCode === MediaError.MEDIA_ERR_NETWORK) {
        errorMsg = 'Network error occurred. Check your file is valid';
      } else if (errorCode === MediaError.MEDIA_ERR_DECODE) {
        errorMsg = 'Video format not supported or file is corrupted. Try another file';
      } else if (errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        errorMsg = 'Video format not supported. Try MP4, WebM, or MKV';
      }
      
      console.error('[Player] Video load error:', errorMsg, 'code:', errorCode);
      URL.revokeObjectURL(newUrl);
      this.state.isLoadingNewVideo = false;
      this.showError(errorMsg);
    };
    
    // Set a timeout in case the video never fires events (corrupted or unsupported)
    loadTimeout = setTimeout(() => {
      if (!canPlayFired) {
        console.warn('[Player] Video loading timeout (10s), file may be corrupted or format unsupported');
        onError();
      }
    }, 10000);
    
    // Bind events to temporary video
    tempVideo.addEventListener('progress', onProgress);
    tempVideo.addEventListener('loadedmetadata', onMetadata);
    tempVideo.addEventListener('canplay', onCanPlay);
    tempVideo.addEventListener('error', onError);
    
    // Start loading
    tempVideo.src = newUrl;
    tempVideo.load();
    
    this.showLoading();
  },

  /**
   * Setup drag and drop functionality
   */
  setupDragAndDrop() {
    const dropZone = Utils.$('#dropZone');
    if (!dropZone) return;

    // Prevent default drag behaviors
    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    this.cleanupFns.push(
      Utils.on(dropZone, 'dragenter', preventDefaults),
      Utils.on(dropZone, 'dragover', preventDefaults),
      Utils.on(dropZone, 'dragleave', preventDefaults),
      Utils.on(dropZone, 'drop', preventDefaults)
    );

    // Highlight drop zone on drag
    const highlight = () => dropZone.classList.add('drag-over');
    const unhighlight = () => dropZone.classList.remove('drag-over');

    this.cleanupFns.push(
      Utils.on(dropZone, 'dragenter', highlight),
      Utils.on(dropZone, 'dragover', highlight),
      Utils.on(dropZone, 'dragleave', unhighlight),
      Utils.on(dropZone, 'drop', unhighlight)
    );

    // Handle dropped files
    const handleDrop = (e) => {
      const files = e.dataTransfer.files;
      if (!files.length) return;

      const file = files[0];
      
      // Check if it's a video file
      if (file.type.startsWith('video/') || file.name.match(/\.(mp4|mkv|webm|avi|mov|flv|wmv|m4v)$/i)) {
        // Simulate file input change
        this.loadFile({
          target: { files: [file] }
        });
      } else {
        this.showError('Please drop a video file (MP4, MKV, WebM, etc.)');
      }
    };

    this.cleanupFns.push(
      Utils.on(dropZone, 'drop', handleDrop)
    );

    // Click to open file picker
    this.cleanupFns.push(
      Utils.on(dropZone, 'click', () => {
        this.videoInput.click();
      })
    );
  },

  /**
   * Show load screen (prepare for new video, don't clear current)
   */
  showLoadScreen() {
    // Check if we already have a video loaded
    const hasVideo = this.video.src && !this.state.hasError;
    
    if (!hasVideo) {
      // No video currently playing, show the load screen
      this.pause();
      this.loadScreen.classList.remove('hidden');
      this.container.classList.add('hidden');
      console.log('[Player] Showing load screen');
    } else {
      // Video already playing, keep it visible but trigger file picker
      console.log('[Player] Keeping current video, opening file picker for new video');
      this.state.loadingProgress = 0;
    }
    
    // Reset and trigger file input
    this.videoInput.value = '';
    this.videoInput.click();
  },

  // =========================================================================
  // Playback Controls
  // =========================================================================

  /**
   * Play the video
   */
  play() {
    if (!this.video.src || this.state.hasError) return;
    
    const promise = this.video.play();
    if (promise !== undefined) {
      promise.catch(err => {
        if (err.name !== 'AbortError') {
          console.error('[Player] Play error:', err);
        }
      });
    }
  },

  /**
   * Pause the video
   */
  pause() {
    this.video.pause();
  },

  /**
   * Toggle play/pause
   */
  togglePlay() {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  },

  /**
   * Seek to a specific time
   * @param {number} time - seconds
   */
  seek(time) {
    if (!this.video.duration) return;
    this.video.currentTime = Utils.clamp(time, 0, this.video.duration);
  },

  /**
   * Seek by a relative amount
   * @param {number} delta - seconds to add/subtract
   */
  seekBy(delta) {
    this.seek(this.video.currentTime + delta);
  },

  /**
   * Seek to percentage of duration
   * @param {number} percent - 0-100
   */
  seekToPercent(percent) {
    if (!this.video.duration) return;
    this.seek((percent / 100) * this.video.duration);
  },

  // =========================================================================
  // Volume Controls
  // =========================================================================

  /**
   * Set volume level
   * @param {number} level - 0 to 1
   */
  setVolume(level) {
    const clampedLevel = Utils.clamp(level, 0, 1);
    this.video.volume = clampedLevel;
    this.state.volume = clampedLevel;
    
    if (level > 0 && this.state.isMuted) {
      this.video.muted = false;
      this.state.isMuted = false;
    }
  },

  /**
   * Toggle mute
   */
  toggleMute() {
    this.video.muted = !this.video.muted;
    this.state.isMuted = this.video.muted;
  },

  // =========================================================================
  // Playback Speed
  // =========================================================================

  /**
   * Set playback rate
   * @param {number} rate - 0.25 to 2
   */
  setPlaybackRate(rate) {
    this.video.playbackRate = Utils.clamp(rate, 0.25, 2);
    this.state.playbackRate = this.video.playbackRate;
  },

  // =========================================================================
  // Mode Controls
  // =========================================================================

  /**
   * Toggle fullscreen mode
   */
  toggleFullscreen() {
    if (this.state.isFullscreen) {
      Utils.exitFullscreen();
    } else {
      Utils.requestFullscreen(this.container);
    }
  },

  /**
   * Toggle Picture-in-Picture mode
   */
  async togglePiP() {
    if (!Utils.isPiPSupported()) {
      this.showWarning('Picture-in-Picture is not supported in this browser');
      return;
    }

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        console.log('[Player] Exited PiP mode');
      } else if (this.video.src) {
        await this.video.requestPictureInPicture();
        console.log('[Player] Entered PiP mode');
      }
    } catch (err) {
      console.error('[Player] PiP error:', err);
      this.showWarning('Could not toggle Picture-in-Picture');
    }
  },

  /**
   * Update audio tracks menu
   */
  updateAudioTracks() {
    const audioTrackMenu = Utils.$('#audioTrackMenu');
    if (!audioTrackMenu) return;

    // Get audio tracks from video
    const video = this.video;
    let tracks = [];

    // Try to get tracks from video element
    if (video.audioTracks) {
      tracks = Array.from(video.audioTracks);
    }

    // Clear menu
    audioTrackMenu.innerHTML = '';

    if (tracks.length === 0) {
      audioTrackMenu.innerHTML = '<div style="padding: 8px 16px; color: var(--text-muted); font-size: 11px;">No audio tracks available</div>';
      return;
    }

    // Add each track
    tracks.forEach((track, index) => {
      const item = document.createElement('button');
      item.className = 'audio-track-item' + (track.enabled ? ' active' : '');
      item.innerHTML = `
        <div class="track-info">
          <span class="track-name">${track.label || `Track ${index + 1}`}</span>
          <span class="track-codec">${track.language || 'Unknown'}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        // Disable all tracks, enable selected
        tracks.forEach(t => t.enabled = false);
        track.enabled = true;
        
        // Update UI
        audioTrackMenu.querySelectorAll('.audio-track-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        
        console.log('[Player] Audio track changed:', track.label);
      });
      audioTrackMenu.appendChild(item);
    });
  },

  /**
   * Set audio delay in milliseconds
   * @param {number} delayMs - Delay in milliseconds (positive = audio ahead, negative = audio behind)
   */
  setAudioDelay(delayMs) {
    // HTML5 video doesn't natively support audio delay
    // This is a placeholder for future Web Audio API implementation
    console.log('[Player] Audio delay set to:', delayMs, 'ms');
    this.state.audioDelay = delayMs;
  },

  // =========================================================================
  // Controls Visibility
  // =========================================================================

  /**
   * Show controls
   */
  showControls() {
    clearTimeout(this.state.controlsTimeout);
    this.state.isControlsHidden = false;
    this.container.classList.remove('controls-hidden');
    
    if (this.state.isPlaying) {
      this.startHideControls();
    }
  },

  /**
   * Start timer to hide controls
   */
  startHideControls() {
    if (!this.state.isPlaying) return;
    
    clearTimeout(this.state.controlsTimeout);
    this.state.controlsTimeout = setTimeout(() => {
      this.state.isControlsHidden = true;
      this.container.classList.add('controls-hidden');
    }, 2000);
  },

  // =========================================================================
  // Loading & Error States
  // =========================================================================

  /**
   * Show loading spinner
   */
  showLoading() {
    this.loadingSpinner.classList.add('visible');
  },

  /**
   * Hide loading spinner
   */
  hideLoading() {
    this.loadingSpinner.classList.remove('visible');
  },

  /**
   * Show error message
   * @param {string} message
   */
  showError(message) {
    this.state.hasError = true;
    this.errorMessage.textContent = message;
    this.errorOverlay.classList.add('visible');
    this.hideLoading();
  },

  /**
   * Show warning message (non-blocking)
   * @param {string} message
   */
  showWarning(message) {
    // Create or get warning element
    let warningEl = Utils.$('#warningOverlay');
    if (!warningEl) {
      warningEl = document.createElement('div');
      warningEl.id = 'warningOverlay';
      warningEl.className = 'warning-overlay';
      warningEl.innerHTML = `
        <div class="warning-content">
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
          </svg>
          <span id="warningMessage"></span>
        </div>
      `;
      this.container.appendChild(warningEl);
    }
    
    const warningMsg = Utils.$('#warningMessage');
    if (warningMsg) warningMsg.textContent = message;
    
    warningEl.classList.add('visible');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      warningEl.classList.remove('visible');
    }, 5000);
  },

  /**
   * Hide error overlay
   */
  hideError() {
    this.state.hasError = false;
    this.errorOverlay.classList.remove('visible');
  },

  // =========================================================================
  // Video Event Handlers
  // =========================================================================

  onLoadStart() {
    console.log('[Player] Video loading started');
    this.showLoading();
    this.hideError();
  },

  onMetadataLoaded() {
    console.log('[Player] Metadata loaded, duration:', this.video.duration);
    this.state.duration = this.video.duration;
    Controls.updateDuration();
    this.extractQualityMetadata();
  },

  /**
   * Extract quality metadata from loaded video
   */
  extractQualityMetadata() {
    const codecInfo = Utils.getVideoCodecInfo(this.video, this.currentFile);
    
    this.state.qualityInfo = {
      ...this.state.qualityInfo,
      videoCodec: codecInfo.videoCodec,
      audioCodec: codecInfo.audioCodec,
      width: this.video.videoWidth || 0,
      height: this.video.videoHeight || 0,
      resolution: Utils.formatResolution(this.video.videoWidth, this.video.videoHeight),
      bitrate: codecInfo.bitrate,
      framerate: codecInfo.framerate,
      supportedVideoCodecs: Utils.detectVideoCodecs(),
      supportedAudioCodecs: Utils.detectAudioCodecs()
    };

    // Auto-configure buffering based on video properties
    this.autoConfigureBuffering(codecInfo);

    console.log('[Player] Quality info:', this.state.qualityInfo);
    
    // Update quality display in controls
    if (Controls.updateQualityDisplay) {
      Controls.updateQualityDisplay();
    }
  },

  /**
   * Automatically configure buffering based on video properties
   * @param {Object} codecInfo - Codec information
   */
  autoConfigureBuffering(codecInfo) {
    const buffering = this.state.buffering;
    const duration = this.video.duration;
    const bitrate = codecInfo.bitrate;
    
    // Auto-adjust buffer ahead based on video duration
    if (duration > 3600) { // > 1 hour
      buffering.bufferAheadTarget = 15; // Longer buffer for long videos
    } else if (duration > 1800) { // > 30 minutes
      buffering.bufferAheadTarget = 12;
    } else {
      buffering.bufferAheadTarget = 10; // Default
    }
    
    // Auto-adjust based on bitrate (higher bitrate = more buffering)
    if (bitrate > 10000) { // > 10 Mbps
      buffering.bufferAheadTarget = Math.max(buffering.bufferAheadTarget, 15);
      buffering.bufferBehindTarget = 8;
    } else if (bitrate > 5000) { // > 5 Mbps
      buffering.bufferAheadTarget = Math.max(buffering.bufferAheadTarget, 12);
      buffering.bufferBehindTarget = 6;
    } else {
      buffering.bufferBehindTarget = 5; // Default
    }
    
    // Detect if codec might need more buffering (e.g., HEVC on unsupported browsers)
    if (codecInfo.videoCodec.includes('H.265') || codecInfo.videoCodec.includes('HEVC')) {
      const hevcSupport = Utils.canPlayCodec('video/mp4; codecs="hev1.1.6.L93.B0"');
      if (hevcSupport !== 'probably') {
        // HEVC might need software decoding, increase buffer
        buffering.bufferAheadTarget = Math.max(buffering.bufferAheadTarget, 18);
        buffering.bufferBehindTarget = 10;
        console.log('[Player] HEVC detected with limited support, increasing buffer');
      }
    }
    
    console.log('[Player] Auto-configured buffering:', {
      ahead: buffering.bufferAheadTarget,
      behind: buffering.bufferBehindTarget,
      bitrate: bitrate,
      duration: duration
    });
  },

  onCanPlay() {
    console.log('[Player] Video can play');
    this.hideLoading();
    // Auto-play is now handled in loadFile() after source is swapped
  },

  onPlaying() {
    this.state.isPlaying = true;
    this.state.isPaused = false;
    this.hideLoading();
    Controls.updatePlayState(true);
    this.startHideControls();
  },

  onPause() {
    this.state.isPlaying = false;
    this.state.isPaused = true;
    this.showControls();
    Controls.updatePlayState(false);
  },

  onTimeUpdate() {
    if (this.state.isSeeking) return;
    
    this.state.currentTime = this.video.currentTime;
    Controls.updateProgress();
  },

  onProgress() {
    Controls.updateBuffered();
    this.monitorBufferHealth();
  },

  /**
   * Monitor buffer health and adjust quality if needed
   */
  monitorBufferHealth() {
    const video = this.video;
    const buffering = this.state.buffering;
    
    if (!video.buffered.length || !video.duration) return;

    const currentTime = video.currentTime;
    const buffered = video.buffered;
    
    // Calculate buffer ahead
    let bufferAhead = 0;
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= currentTime && buffered.end(i) >= currentTime) {
        bufferAhead = buffered.end(i) - currentTime;
        break;
      }
    }

    // Calculate buffer behind
    let bufferBehind = 0;
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.end(i) >= currentTime && buffered.start(i) <= currentTime) {
        bufferBehind = currentTime - buffered.start(i);
        break;
      }
    }

    // Determine buffer health
    const previousHealth = buffering.bufferHealth;
    if (bufferAhead < 2) {
      buffering.bufferHealth = 'critical';
      buffering.consecutiveUnderruns++;
    } else if (bufferAhead < buffering.bufferAheadTarget * 0.5) {
      buffering.bufferHealth = 'warning';
    } else {
      buffering.bufferHealth = 'good';
      buffering.consecutiveUnderruns = 0;
    }

    // Log buffer status changes
    if (previousHealth !== buffering.bufferHealth) {
      console.log(`[Player] Buffer health: ${buffering.bufferHealth} (ahead: ${bufferAhead.toFixed(1)}s, behind: ${bufferBehind.toFixed(1)}s)`);
    }

    // Auto quality adjustment
    if (buffering.autoQuality && buffering.consecutiveUnderruns > 3) {
      this.adjustQualityForBandwidth();
      buffering.consecutiveUnderruns = 0;
    }

    // Store network speed estimate
    if (bufferAhead > 0 && video.webkitVideoDecodedByteCount) {
      const estimatedSpeed = (video.webkitVideoDecodedByteCount * 8) / (currentTime + bufferAhead) / 1000;
      buffering.lastNetworkSpeed = Math.round(estimatedSpeed);
    }
  },

  /**
   * Adjust quality based on bandwidth constraints
   */
  adjustQualityForBandwidth() {
    const buffering = this.state.buffering;
    
    if (!buffering.maxBitrate) {
      console.log('[Player] Auto quality: Consider reducing video quality for smoother playback');
      // In a multi-bitrate scenario, this would switch to a lower quality stream
      // For now, we just log the recommendation
    }
  },

  /**
   * Set buffer ahead target
   * @param {number} seconds - Target buffer ahead time
   */
  setBufferAheadTarget(seconds) {
    this.state.buffering.bufferAheadTarget = Utils.clamp(seconds, 1, 30);
    console.log('[Player] Buffer ahead target:', this.state.buffering.bufferAheadTarget, 'seconds');
  },

  /**
   * Set buffer behind target
   * @param {number} seconds - Target buffer behind time
   */
  setBufferBehindTarget(seconds) {
    this.state.buffering.bufferBehindTarget = Utils.clamp(seconds, 1, 20);
    console.log('[Player] Buffer behind target:', this.state.buffering.bufferBehindTarget, 'seconds');
  },

  /**
   * Toggle auto quality adjustment
   * @param {boolean} enabled
   */
  setAutoQuality(enabled) {
    this.state.buffering.autoQuality = enabled;
    console.log('[Player] Auto quality:', enabled ? 'enabled' : 'disabled');
  },

  /**
   * Set max bitrate limit
   * @param {number|null} kbps - Max bitrate in kbps, or null for unlimited
   */
  setMaxBitrate(kbps) {
    this.state.buffering.maxBitrate = kbps;
    console.log('[Player] Max bitrate:', kbps ? `${kbps} kbps` : 'unlimited');
  },

  /**
   * Get current buffer stats
   * @returns {Object} Buffer statistics
   */
  getBufferStats() {
    const video = this.video;
    const buffering = this.state.buffering;
    
    if (!video.buffered.length) {
      return {
        bufferAhead: 0,
        bufferBehind: 0,
        health: buffering.bufferHealth,
        networkSpeed: buffering.lastNetworkSpeed
      };
    }

    const currentTime = video.currentTime;
    let bufferAhead = 0;
    let bufferBehind = 0;

    for (let i = 0; i < video.buffered.length; i++) {
      const start = video.buffered.start(i);
      const end = video.buffered.end(i);
      
      if (start <= currentTime && end >= currentTime) {
        bufferAhead = end - currentTime;
        bufferBehind = currentTime - start;
        break;
      }
    }

    return {
      bufferAhead: Math.round(bufferAhead * 10) / 10,
      bufferBehind: Math.round(bufferBehind * 10) / 10,
      health: buffering.bufferHealth,
      networkSpeed: buffering.lastNetworkSpeed
    };
  },

  onVolumeChange() {
    this.state.isMuted = this.video.muted;
    this.state.volume = this.video.volume;
    Controls.updateVolume();
  },

  onRateChange() {
    this.state.playbackRate = this.video.playbackRate;
    Controls.updateSpeed();
  },

  onEnded() {
    this.state.isPlaying = false;
    this.state.isPaused = true;
    this.showControls();
    Controls.updatePlayState(false);
  },

  onError(e) {
    const error = this.video.error;
    let message = 'An error occurred loading the video';
    
    if (error) {
      switch (error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          message = 'Video loading was aborted';
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          message = 'Network error occurred';
          break;
        case MediaError.MEDIA_ERR_DECODE:
          message = 'Video format not supported or corrupted';
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          message = 'Video format not supported';
          break;
      }
    }
    
    this.showError(message);
  },

  /**
   * Clean up all event listeners
   */
  destroy() {
    this.cleanupFns.forEach(fn => fn());
    this.cleanupFns = [];
    
    if (this.video.src && this.video.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.video.src);
    }
  }
};