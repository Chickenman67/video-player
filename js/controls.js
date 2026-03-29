/* ==========================================================================
   Controls Module
   Handles UI control interactions and updates
   ========================================================================== */

const Controls = {
  // DOM Elements
  playPauseBtn: null,
  muteBtn: null,
  volumeSlider: null,
  currentTimeEl: null,
  durationEl: null,
  progressContainer: null,
  progressPlayed: null,
  progressBuffered: null,
  progressHandle: null,
  progressTooltip: null,
  speedBtn: null,
  speedMenu: null,
  speedLabel: null,
  subtitleBtn: null,
  subtitleMenu: null,
  loadSubtitlesBtn: null,
  subtitleFileInput: null,
  refreshCaptionsBtn: null,
  settingsBtn: null,
  settingsModal: null,
  settingsClose: null,
  fullscreenBtn: null,
  shortcutsOverlay: null,
  shortcutsClose: null,

  // Cleanup functions
  cleanupFns: [],

  /**
   * Initialize controls
   */
  init() {
    this.cacheElements();
    this.bindEvents();
    console.log('[Controls] Initialized');
  },

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.playPauseBtn = Utils.$('#playPauseBtn');
    this.muteBtn = Utils.$('#muteBtn');
    this.volumeSlider = Utils.$('#volumeSlider');
    this.currentTimeEl = Utils.$('#currentTime');
    this.durationEl = Utils.$('#duration');
    this.progressContainer = Utils.$('#progressContainer');
    this.progressPlayed = Utils.$('#progressPlayed');
    this.progressBuffered = Utils.$('#progressBuffered');
    this.progressHandle = Utils.$('#progressHandle');
    this.progressTooltip = Utils.$('#progressTooltip');
    this.speedBtn = Utils.$('#speedBtn');
    this.speedMenu = Utils.$('#speedMenu');
    this.speedLabel = Utils.$('#speedLabel');
    this.subtitleBtn = Utils.$('#subtitleBtn');
    this.subtitleMenu = Utils.$('#subtitleMenu');
    this.settingsBtn = Utils.$('#settingsBtn');
    this.settingsModal = Utils.$('#settingsModal');
    this.settingsClose = Utils.$('#settingsClose');
    this.fullscreenBtn = Utils.$('#fullscreenBtn');
    this.shortcutsOverlay = Utils.$('#shortcutsOverlay');
    this.shortcutsClose = Utils.$('#shortcutsClose');
  },

  /**
   * Bind control events
   */
  bindEvents() {
    // Play/Pause
    this.cleanupFns.push(
      Utils.on(this.playPauseBtn, 'click', () => Player.togglePlay())
    );

    // Volume
    this.cleanupFns.push(
      Utils.on(this.muteBtn, 'click', () => Player.toggleMute()),
      Utils.on(this.volumeSlider, 'input', (e) => Player.setVolume(parseFloat(e.target.value)))
    );

    // Progress bar
    this.cleanupFns.push(
      Utils.on(this.progressContainer, 'mousedown', (e) => this.startSeek(e)),
      Utils.on(this.progressContainer, 'mousemove', (e) => this.showProgressTooltip(e)),
      Utils.on(this.progressContainer, 'mouseleave', () => this.hideProgressTooltip())
    );

    // Global mouse events for seeking
    this.cleanupFns.push(
      Utils.on(document, 'mousemove', (e) => this.onSeekMove(e)),
      Utils.on(document, 'mouseup', () => this.endSeek())
    );

    // Speed control
    this.cleanupFns.push(
      Utils.on(this.speedBtn, 'click', (e) => {
        e.stopPropagation();
        this.toggleSpeedMenu();
      }),
      Utils.on(this.speedMenu, 'click', (e) => {
        const option = e.target.closest('.dropdown-item');
        if (option) {
          const speed = parseFloat(option.dataset.speed);
          Player.setPlaybackRate(speed);
          this.closeSpeedMenu();
        }
      })
    );

    // Custom speed input
    const customSpeedInput = Utils.$('#customSpeedInput');
    const customSpeedBtn = Utils.$('#customSpeedBtn');
    
    if (customSpeedInput && customSpeedBtn) {
      this.cleanupFns.push(
        Utils.on(customSpeedBtn, 'click', (e) => {
          e.stopPropagation();
          const speed = parseFloat(customSpeedInput.value);
          if (!isNaN(speed) && speed >= 0.1 && speed <= 4) {
            Player.setPlaybackRate(speed);
            this.closeSpeedMenu();
            customSpeedInput.value = '';
          }
        }),
        Utils.on(customSpeedInput, 'keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const speed = parseFloat(customSpeedInput.value);
            if (!isNaN(speed) && speed >= 0.1 && speed <= 4) {
              Player.setPlaybackRate(speed);
              this.closeSpeedMenu();
              customSpeedInput.value = '';
            }
          }
          e.stopPropagation();
        }),
        Utils.on(customSpeedInput, 'click', (e) => {
          e.stopPropagation();
        })
      );
    }

    // Subtitle control
    this.cleanupFns.push(
      Utils.on(this.subtitleBtn, 'click', (e) => {
        e.stopPropagation();
        this.toggleSubtitleMenu();
      }),
      Utils.on(this.subtitleMenu, 'click', (e) => {
        const option = e.target.closest('.dropdown-item');
        if (option) {
          const trackIndex = parseInt(option.dataset.track);
          Subtitles.setTrack(trackIndex);
          this.closeSubtitleMenu();
        }
      })
    );

    // Settings modal
    this.cleanupFns.push(
      Utils.on(this.settingsBtn, 'click', () => this.showSettings()),
      Utils.on(this.settingsClose, 'click', () => this.hideSettings()),
      Utils.on(this.settingsModal, 'click', (e) => {
        if (e.target === this.settingsModal) this.hideSettings();
      })
    );

    // Settings toggle buttons
    this.cleanupFns.push(
      Utils.on(document, 'click', (e) => {
        // Hardware acceleration toggle
        const hwToggle = e.target.closest('[data-hw]');
        if (hwToggle) {
          const hwValue = hwToggle.dataset.hw;
          this.updateHardwareAccelUI(hwValue);
        }

        // Seek duration toggle
        const seekToggle = e.target.closest('[data-seek]');
        if (seekToggle) {
          const seekValue = parseInt(seekToggle.dataset.seek);
          Keyboard.setSeekDuration(seekValue);
          this.updateSeekDurationUI(seekValue);
        }
      })
    );

    // Fullscreen
    this.cleanupFns.push(
      Utils.on(this.fullscreenBtn, 'click', () => Player.toggleFullscreen()),
      Utils.on(document, 'fullscreenchange', () => this.onFullscreenChange()),
      Utils.on(document, 'webkitfullscreenchange', () => this.onFullscreenChange())
    );

    // Close menus on outside click
    this.cleanupFns.push(
      Utils.on(document, 'click', (e) => {
        if (!this.speedBtn.contains(e.target)) this.closeSpeedMenu();
        if (!this.subtitleBtn.contains(e.target)) this.closeSubtitleMenu();
      })
    );

    // Shortcuts overlay
    this.cleanupFns.push(
      Utils.on(this.shortcutsClose, 'click', () => this.hideShortcuts()),
      Utils.on(this.shortcutsOverlay, 'click', (e) => {
        if (e.target === this.shortcutsOverlay) this.hideShortcuts();
      })
    );

    // Load external subtitles
    const loadSubtitlesBtn = Utils.$('#loadSubtitlesBtn');
    const subtitleFileInput = Utils.$('#subtitleFileInput');
    
    if (loadSubtitlesBtn && subtitleFileInput) {
      this.cleanupFns.push(
        Utils.on(loadSubtitlesBtn, 'click', () => {
          subtitleFileInput.click();
        }),
        Utils.on(subtitleFileInput, 'change', (e) => {
          const file = e.target.files[0];
          if (file) {
            Subtitles.loadExternalFile(file);
            subtitleFileInput.value = ''; // Reset input
          }
        })
      );
    }

    // Refresh captions
    const refreshCaptionsBtn = Utils.$('#refreshCaptionsBtn');
    
    if (refreshCaptionsBtn) {
      this.cleanupFns.push(
        Utils.on(refreshCaptionsBtn, 'click', () => {
          Subtitles.detectTracks();
        })
      );
    }
  },

  // =========================================================================
  // Progress/Seeking
  // =========================================================================

  /**
   * Start seeking (mouse down on progress bar)
   */
  startSeek(e) {
    Player.state.isSeeking = true;
    this.updateSeekPosition(e);
  },

  /**
   * Update seek position during drag
   */
  onSeekMove(e) {
    if (!Player.state.isSeeking) return;
    this.updateSeekPosition(e);
  },

  /**
   * End seeking (mouse up)
   */
  endSeek() {
    if (!Player.state.isSeeking) return;
    Player.state.isSeeking = false;
  },

  /**
   * Update video time based on mouse position
   */
  updateSeekPosition(e) {
    const percent = Utils.getEventPercent(e, this.progressContainer);
    const time = percent * Player.video.duration;
    
    if (!isNaN(time)) {
      Player.seek(time);
      this.updateProgressBar(percent);
    }
  },

  /**
   * Show tooltip on progress bar hover
   */
  showProgressTooltip(e) {
    const percent = Utils.getEventPercent(e, this.progressContainer);
    const time = percent * Player.video.duration;
    
    if (!isNaN(time)) {
      this.progressTooltip.textContent = Utils.formatTime(time);
      this.progressTooltip.style.left = `${percent * 100}%`;
      this.progressTooltip.style.opacity = '1';
    }
  },

  /**
   * Hide progress tooltip
   */
  hideProgressTooltip() {
    this.progressTooltip.style.opacity = '0';
  },

  // =========================================================================
  // Update Methods (called from Player)
  // =========================================================================

  /**
   * Update play/pause button state
   * @param {boolean} isPlaying
   */
  updatePlayState(isPlaying) {
    const playIcon = Utils.$('.icon-play', this.playPauseBtn);
    const pauseIcon = Utils.$('.icon-pause', this.playPauseBtn);

    if (isPlaying) {
      playIcon.classList.add('hidden');
      pauseIcon.classList.remove('hidden');
      this.playPauseBtn.setAttribute('aria-label', 'Pause');
    } else {
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
      this.playPauseBtn.setAttribute('aria-label', 'Play');
    }
  },

  /**
   * Update progress bar and time display
   */
  updateProgress() {
    const { currentTime, duration } = Player.video;
    if (!duration) return;

    const percent = currentTime / duration;
    this.updateProgressBar(percent);
    this.currentTimeEl.textContent = Utils.formatTime(currentTime);
  },

  /**
   * Update progress bar visual
   * @param {number} percent - 0 to 1
   */
  updateProgressBar(percent) {
    const percentStr = `${percent * 100}%`;
    this.progressPlayed.style.width = percentStr;
  },

  /**
   * Update buffered progress
   */
  updateBuffered() {
    const buffered = Player.video.buffered;
    if (buffered.length > 0) {
      const end = buffered.end(buffered.length - 1);
      const percent = (end / Player.video.duration) * 100;
      this.progressBuffered.style.width = `${percent}%`;
    }
  },

  /**
   * Update duration display
   */
  updateDuration() {
    this.durationEl.textContent = Utils.formatTime(Player.video.duration);
  },

  /**
   * Update volume UI
   */
  updateVolume() {
    const { volume, muted } = Player.video;
    
    this.volumeSlider.value = muted ? 0 : volume;

    const highIcon = Utils.$('.icon-volume-high', this.muteBtn);
    const lowIcon = Utils.$('.icon-volume-low', this.muteBtn);
    const mutedIcon = Utils.$('.icon-volume-muted', this.muteBtn);

    // Hide all icons first
    highIcon.classList.add('hidden');
    lowIcon.classList.add('hidden');
    mutedIcon.classList.add('hidden');

    if (muted || volume === 0) {
      mutedIcon.classList.remove('hidden');
      this.muteBtn.setAttribute('aria-label', 'Unmute');
    } else if (volume < 0.5) {
      lowIcon.classList.remove('hidden');
      this.muteBtn.setAttribute('aria-label', 'Mute');
    } else {
      highIcon.classList.remove('hidden');
      this.muteBtn.setAttribute('aria-label', 'Mute');
    }
  },

  /**
   * Update speed display
   */
  updateSpeed() {
    const rate = Player.video.playbackRate;
    this.speedLabel.textContent = rate;

    // Update active state in menu
    Utils.$$('.dropdown-item', this.speedMenu).forEach(option => {
      option.classList.toggle('active', parseFloat(option.dataset.speed) === rate);
    });
  },

  // =========================================================================
  // Menu Controls
  // =========================================================================

  /**
   * Toggle speed menu
   */
  toggleSpeedMenu() {
    this.closeSubtitleMenu();
    this.speedMenu.classList.toggle('visible');
  },

  /**
   * Close speed menu
   */
  closeSpeedMenu() {
    this.speedMenu.classList.remove('visible');
  },

  /**
   * Toggle subtitle menu
   */
  toggleSubtitleMenu() {
    this.closeSpeedMenu();
    this.subtitleMenu.classList.toggle('visible');
  },

  /**
   * Close subtitle menu
   */
  closeSubtitleMenu() {
    this.subtitleMenu.classList.remove('visible');
  },

  // =========================================================================
  // Fullscreen
  // =========================================================================

  /**
   * Handle fullscreen state change
   */
  onFullscreenChange() {
    const isFullscreen = !!Utils.getFullscreenElement();
    Player.state.isFullscreen = isFullscreen;
    Player.container.classList.toggle('fullscreen', isFullscreen);

    const enterIcon = Utils.$('.icon-fullscreen-enter', this.fullscreenBtn);
    const exitIcon = Utils.$('.icon-fullscreen-exit', this.fullscreenBtn);

    if (isFullscreen) {
      enterIcon.classList.add('hidden');
      exitIcon.classList.remove('hidden');
      this.fullscreenBtn.setAttribute('aria-label', 'Exit fullscreen');
    } else {
      enterIcon.classList.remove('hidden');
      exitIcon.classList.add('hidden');
      this.fullscreenBtn.setAttribute('aria-label', 'Fullscreen');
    }
  },

  // =========================================================================
  // Shortcuts Overlay
  // =========================================================================

  /**
   * Show keyboard shortcuts overlay
   */
  showShortcuts() {
    this.shortcutsOverlay.classList.remove('hidden');
    // Trigger reflow then add visible class for animation
    this.shortcutsOverlay.offsetHeight;
    this.shortcutsOverlay.classList.add('visible');
  },

  /**
   * Hide keyboard shortcuts overlay
   */
  hideShortcuts() {
    this.shortcutsOverlay.classList.remove('visible');
    setTimeout(() => {
      this.shortcutsOverlay.classList.add('hidden');
    }, 250);
  },

  /**
   * Toggle shortcuts overlay
   */
  toggleShortcuts() {
    if (this.shortcutsOverlay.classList.contains('visible')) {
      this.hideShortcuts();
    } else {
      this.showShortcuts();
    }
  },

  // =========================================================================
  // Settings Modal
  // =========================================================================

  /**
   * Show settings modal
   */
  showSettings() {
    this.settingsModal.classList.remove('hidden');
    this.settingsModal.offsetHeight;
    this.settingsModal.classList.add('visible');
  },

  /**
   * Hide settings modal
   */
  hideSettings() {
    this.settingsModal.classList.remove('visible');
    setTimeout(() => {
      this.settingsModal.classList.add('hidden');
    }, 200);
  },

  /**
   * Update hardware acceleration UI
   * @param {string} value - 'on' or 'off'
   */
  updateHardwareAccelUI(value) {
    Utils.$$('[data-hw]', this.settingsModal).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.hw === value);
    });
  },

  /**
   * Update seek duration UI
   * @param {number} value - seek duration in seconds
   */
  updateSeekDurationUI(value) {
    Utils.$$('[data-seek]', this.settingsModal).forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.seek) === value);
    });
  },

  /**
   * Clean up event listeners
   */
  destroy() {
    this.cleanupFns.forEach(fn => fn());
    this.cleanupFns = [];
  }
};