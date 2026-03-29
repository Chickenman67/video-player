/* ==========================================================================
   Captions Module
   Handles caption track detection, selection, and rendering
   ========================================================================== */

const Subtitles = {
  // DOM Elements
  overlay: null,
  menu: null,

  // State
  tracks: [],
  activeTrack: -1,
  activeCues: [],
  extractedSubtitles: [],
  createdTextTracks: [],

  // Cleanup functions
  cleanupFns: [],

  /**
   * Initialize captions module
   */
  init() {
    this.cacheElements();
    this.bindTrackEvents();
    console.log('[Captions] Initialized');
  },

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.overlay = Utils.$('#subtitleOverlay');
    this.menu = Utils.$('#subtitleMenu');
  },

  /**
   * Bind track change events to handle dynamically added tracks
   */
  bindTrackEvents() {
    const textTracks = Player.video.textTracks;
    
    // Listen for track changes (addtrack, removetrack)
    this.cleanupFns.push(
      Utils.on(textTracks, 'addtrack', () => {
        console.log('[Captions] Track added, re-detecting...');
        this.detectTracks();
      }),
      Utils.on(textTracks, 'removetrack', () => {
        console.log('[Captions] Track removed, re-detecting...');
        this.detectTracks();
      })
    );

    // Listen for track mode changes and cue changes
    for (let i = 0; i < textTracks.length; i++) {
      const track = textTracks[i];
      this.cleanupFns.push(
        Utils.on(track, 'cuechange', () => this.update())
      );
    }
  },

  /**
   * Detect available text tracks from video element and extract embedded subtitles
   */
  detectTracks() {
    this.tracks = [];
    this.extractedSubtitles = [];
    const textTracks = Player.video.textTracks;

    console.log('[Captions] Total text tracks found:', textTracks.length);

    // Build track list from native HTML5 tracks
    for (let i = 0; i < textTracks.length; i++) {
      const track = textTracks[i];
      
      console.log(`[Captions] Track ${i}: kind="${track.kind}", label="${track.label}", language="${track.language}", mode="${track.mode}"`);
      
      if (track.kind === 'subtitles' || track.kind === 'captions') {
        this.tracks.push({
          index: i,
          label: track.label || `Track ${i + 1}`,
          language: track.language || 'unknown',
          kind: track.kind,
          isExtracted: false
        });

        // Bind cuechange event for this track
        this.cleanupFns.push(
          Utils.on(track, 'cuechange', () => this.update())
        );
        
        console.log(`[Captions] Added track ${i}: ${track.label || 'Track ' + (i + 1)} (${track.language})`);
      }
    }

    // Try to extract embedded subtitles from video file if no tracks found
    if (this.tracks.length === 0 && SubtitleExtractor) {
      console.log('[Captions] No native tracks found, attempting to extract embedded subtitles...');
      this.extractEmbeddedSubtitles();
    } else if (this.tracks.length === 0) {
      console.log('[Captions] No subtitle tracks detected. This may be because:');
      console.log('[Captions] - The video file does not contain embedded subtitles');
      console.log('[Captions] - The subtitle format is not supported by the browser');
      console.log('[Captions] - MKV files may have subtitle tracks that browsers cannot read');
      console.log('[Captions] - The subtitles may be in a format like ASS/SSA that browsers do not support');
    }

    this.buildMenu();
    
    // Set default: auto-enable first track if available
    if (this.tracks.length > 0 && this.activeTrack === -1) {
      this.setTrack(this.tracks[0].index);
    }

    console.log('[Captions] Detected tracks:', this.tracks.length);
  },

  /**
   * Extract embedded subtitles from video file
   */
  async extractEmbeddedSubtitles() {
    try {
      // Get the current video file from the blob URL
      const videoSrc = Player.video.src;
      if (!videoSrc || !videoSrc.startsWith('blob:')) {
        console.log('[Captions] Cannot extract - no blob URL available');
        return;
      }

      // Show loading indicator
      const originalText = Utils.$('#subtitleBtn')?.querySelector('span')?.textContent || '▾';
      const subtitleBtn = Utils.$('#subtitleBtn');
      if (subtitleBtn) {
        subtitleBtn.setAttribute('data-loading', 'true');
        subtitleBtn.style.opacity = '0.6';
      }

      // Fetch the blob and convert to File
      const response = await fetch(videoSrc);
      const blob = await response.blob();
      const videoFile = new File([blob], 'video', { type: blob.type });

      console.log('[Captions] Starting subtitle extraction...');
      const extracted = await SubtitleExtractor.extractSubtitles(videoFile);

      if (extracted && extracted.length > 0) {
        console.log('[Captions] Successfully extracted', extracted.length, 'subtitle streams');
        
        // Add extracted subtitles to tracks
        for (let i = 0; i < extracted.length; i++) {
          const sub = extracted[i];
          
          // Create a text track from the extracted subtitle
          const track = SubtitleExtractor.createTextTrack(
            Player.video,
            sub.content,
            sub.label,
            sub.language
          );

          if (track) {
            this.extractedSubtitles.push({
              ...sub,
              trackIndex: Player.video.textTracks.length - 1,
              track: track
            });

            // Add to tracks list
            this.tracks.push({
              index: Player.video.textTracks.length - 1,
              label: sub.label,
              language: sub.language,
              kind: 'subtitles',
              isExtracted: true
            });

            console.log('[Captions] Added extracted subtitle:', sub.label, `(${sub.language})`);
          }
        }

        // Rebuild menu with extracted subtitles
        this.buildMenu();

        // Auto-enable first track
        if (this.tracks.length > 0 && this.activeTrack === -1) {
          this.setTrack(this.tracks[0].index);
        }
      } else {
        console.log('[Captions] No embedded subtitles found');
      }

      // Restore button state
      if (subtitleBtn) {
        subtitleBtn.removeAttribute('data-loading');
        subtitleBtn.style.opacity = '1';
      }

    } catch (err) {
      console.error('[Captions] Error extracting embedded subtitles:', err);
    }
  },

  /**
   * Build caption menu from detected tracks
   */
  buildMenu() {
    // Build menu with None and detected tracks
    let html = '<button class="dropdown-item" data-track="-1">None</button>';
    
    this.tracks.forEach(track => {
      const label = track.language !== 'unknown' 
        ? `${track.label} (${track.language})` 
        : track.label;
      html += `<button class="dropdown-item" data-track="${track.index}">${label}</button>`;
    });

    this.menu.innerHTML = html;

    // Update active state
    this.updateMenuActiveState();
  },

  /**
   * Set active caption track
   * @param {number} trackIndex - track index, -1 for off
   */
  setTrack(trackIndex) {
    const textTracks = Player.video.textTracks;

    // Disable all tracks first
    for (let i = 0; i < textTracks.length; i++) {
      textTracks[i].mode = 'disabled';
    }

    this.activeTrack = trackIndex;

    if (trackIndex >= 0 && trackIndex < textTracks.length) {
      // Enable selected track
      textTracks[trackIndex].mode = 'showing';
      console.log('[Captions] Enabled track:', trackIndex);
    } else {
      console.log('[Captions] Captions disabled');
    }

    this.updateMenuActiveState();
    this.clearOverlay();
    
    // Update player state
    Player.state.activeSubtitleTrack = this.activeTrack;

    console.log('[Captions] Active track:', this.activeTrack);
  },

  /**
   * Toggle captions on/off
   */
  toggle() {
    if (this.activeTrack >= 0) {
      // Turn off
      this.setTrack(-1);
    } else if (this.tracks.length > 0) {
      // Turn on first available track
      this.setTrack(this.tracks[0].index);
    }
  },

  /**
   * Update active state in menu
   */
  updateMenuActiveState() {
    Utils.$$('.dropdown-item', this.menu).forEach(option => {
      const trackIndex = parseInt(option.dataset.track);
      option.classList.toggle('active', trackIndex === this.activeTrack);
    });
  },

  /**
   * Update caption display
   */
  update() {
    if (this.activeTrack < 0) {
      this.clearOverlay();
      return;
    }

    const textTracks = Player.video.textTracks;
    const textTrack = textTracks[this.activeTrack];
    
    if (!textTrack || textTrack.mode !== 'showing') {
      this.clearOverlay();
      return;
    }

    const activeCues = textTrack.activeCues;
    
    if (!activeCues || activeCues.length === 0) {
      this.clearOverlay();
      return;
    }

    let html = '';
    for (let i = 0; i < activeCues.length; i++) {
      const cue = activeCues[i];
      let text = '';
      
      if (cue.getCueAsHTML) {
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(cue.getCueAsHTML());
        text = tempDiv.innerHTML;
      } else if (cue.text) {
        text = cue.text;
      }
      
      if (text) {
        text = text.replace(/<script[^>]*>.*?<\/script>/gi, '');
        html += `<span class="cue">${text}</span>`;
      }
    }

    this.overlay.innerHTML = html;
  },

  /**
   * Clear caption overlay
   */
  clearOverlay() {
    this.overlay.innerHTML = '';
  },

  /**
   * Clean up
   */
  destroy() {
    // Remove created text tracks
    for (let track of this.createdTextTracks) {
      try {
        if (track.src && track.src.startsWith('blob:')) {
          URL.revokeObjectURL(track.src);
        }
        track.parentNode?.removeChild(track);
      } catch (err) {
        console.warn('[Captions] Error cleaning up track:', err);
      }
    }
    this.createdTextTracks = [];

    this.cleanupFns.forEach(fn => fn());
    this.cleanupFns = [];
    this.clearOverlay();
  }
};
