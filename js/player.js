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
    activeSubtitleTrack: -1,
    hasError: false,
    isLoadingNewVideo: false,
    loadingProgress: 0
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
      Utils.on(this.video, 'click', () => this.togglePlay())
    );

    // File input
    this.cleanupFns.push(
      Utils.on(this.videoInput, 'change', (e) => this.loadFile(e))
    );

    // Drag and drop handlers
    this.setupDragAndDrop();

    // Subtitle file input
    const subtitleInput = Utils.$('#subtitleInput');
    if (subtitleInput) {
      this.cleanupFns.push(
        Utils.on(subtitleInput, 'change', (e) => this.loadSubtitleFile(e))
      );
    }

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
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mkv|webm|avi|mov|flv|wmv|m4v)$/i)) {
      this.showError('Please select a valid video file (MP4, MKV, WebM, etc.)');
      console.error('[Player] Invalid file type:', file.type, 'name:', file.name);
      return;
    }

    // Prevent multiple simultaneous loads
    if (this.state.isLoadingNewVideo) {
      console.warn('[Player] Already loading a video, please wait');
      return;
    }

    this.state.isLoadingNewVideo = true;
    
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
      
      // Reset subtitle detection for new video
      if (Subtitles) {
        Subtitles.detectTracks();
      }
      
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
      } else if (file.name.match(/\.(srt|vtt)$/i)) {
        // It's a subtitle file
        this.loadSubtitleFile({
          target: { files: [file] }
        });
      } else {
        this.showError('Please drop a video file (MP4, MKV, WebM) or subtitle file (.srt, .vtt)');
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
   * Load subtitle file from input
   */
  loadSubtitleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate subtitle file
    if (!file.name.match(/\.(srt|vtt)$/i)) {
      this.showError('Please select a valid subtitle file (.srt or .vtt)');
      return;
    }

    // Check if video is loaded
    if (!this.video.src) {
      this.showError('Please load a video first before loading subtitles');
      return;
    }

    console.log('[Player] Loading subtitle file:', file.name);

    // Use SubtitleExtractor to parse and load
    if (!SubtitleExtractor) {
      this.showError('Subtitle support not available');
      return;
    }

    SubtitleExtractor.loadSubtitleFile(file, this.video)
      .then(() => {
        console.log('[Player] Subtitles loaded successfully');
        // Find and show the most recently added track (the one we just added)
        for (let i = this.video.textTracks.length - 1; i >= 0; i--) {
          if (this.video.textTracks[i].mode === 'showing') {
            this.state.activeSubtitleTrack = i;
            break;
          }
        }
      })
      .catch(error => {
        console.error('[Player] Failed to load subtitles:', error);
        this.showError(`Failed to load subtitles: ${error.message}`);
      });

    // Reset file input so same file can be loaded again
    e.target.value = '';
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
    if (Subtitles) {
      Subtitles.detectTracks();
    }
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
    Subtitles.update();
  },

  onProgress() {
    Controls.updateBuffered();
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