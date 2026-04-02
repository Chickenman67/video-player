/* ==========================================================================
   Keyboard Module
   Handles keyboard shortcuts for video player
   ========================================================================== */

const Keyboard = {
  // Configurable seek duration (seconds)
  seekDuration: 5,
  
  // Cleanup functions
  cleanupFns: [],

  // Visual feedback element
  feedbackElement: null,
  feedbackTimeout: null,

  /**
   * Initialize keyboard shortcuts
   */
  init() {
    this.bindEvents();
    this.loadSettings();
    this.createFeedbackElement();
    console.log('[Keyboard] Initialized');
  },

  /**
   * Create feedback element for keyboard actions
   */
  createFeedbackElement() {
    this.feedbackElement = document.createElement('div');
    this.feedbackElement.id = 'keyboardFeedback';
    this.feedbackElement.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(59, 130, 246, 0.2);
      border: 1px solid rgba(59, 130, 246, 0.4);
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      z-index: 1000;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
      backdrop-filter: blur(10px);
    `;
    document.body.appendChild(this.feedbackElement);
  },

  /**
   * Show keyboard feedback
   */
  showFeedback(message) {
    if (this.feedbackElement) {
      this.feedbackElement.textContent = message;
      this.feedbackElement.style.opacity = '1';
      
      clearTimeout(this.feedbackTimeout);
      this.feedbackTimeout = setTimeout(() => {
        this.feedbackElement.style.opacity = '0';
      }, 1500);
    }
  },

  /**
   * Load settings from localStorage
   * Note: seekDuration is hardcoded to 5 seconds - ignores localStorage
   */
  loadSettings() {
    // Hardcode seek duration to 5 seconds - ignore any saved settings
    this.seekDuration = 5;
    // Clear any saved seek duration from localStorage
    localStorage.removeItem('videoPlayer_seekDuration');
  },

  /**
   * Set seek duration
   * Note: Seek duration is hardcoded to 5 seconds - changes are ignored
   * @param {number} seconds - seek duration in seconds (ignored)
   */
  setSeekDuration(seconds) {
    // Always force 5 seconds - ignore any attempt to change
    this.seekDuration = 5;
    localStorage.removeItem('videoPlayer_seekDuration');
    console.log('[Keyboard] Seek duration hardcoded to 5 seconds');
    this.showFeedback(`Seek duration: 5s (hardcoded)`);
  },

  /**
   * Bind keyboard events
   */
  bindEvents() {
    this.cleanupFns.push(
      Utils.on(document, 'keydown', (e) => this.handleKeyDown(e))
    );
  },

  /**
   * Handle keydown events
   * @param {KeyboardEvent} e
   */
  handleKeyDown(e) {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    // Ignore if modifier keys are pressed (except for specific combos)
    if (e.ctrlKey || e.altKey || e.metaKey) {
      return;
    }

    const key = e.key.toLowerCase();

    // Handle Shift+Arrow for 10-second jumps
    const isShift = e.shiftKey;

    switch (key) {
      // Play/Pause
      case ' ':
      case 'k':
        e.preventDefault();
        Player.togglePlay();
        break;

      // Mute/Unmute
      case 'm':
        e.preventDefault();
        Player.toggleMute();
        break;

      // Fullscreen
      case 'f':
        e.preventDefault();
        Player.toggleFullscreen();
        break;

      // Seek backward (5s or 10s with Shift)
      case 'arrowleft':
      case 'j':
        e.preventDefault();
        if (isShift) {
          Seeking.seekBackward(10);
          this.showFeedback('⏪ -10s');
        } else {
          Seeking.seekBackward(this.seekDuration);
          this.showFeedback(`⏪ -${this.seekDuration}s`);
        }
        break;

      // Seek forward (5s or 10s with Shift)
      case 'arrowright':
      case 'l':
        e.preventDefault();
        if (isShift) {
          Seeking.seekForward(10);
          this.showFeedback('⏩ +10s');
        } else {
          Seeking.seekForward(this.seekDuration);
          this.showFeedback(`⏩ +${this.seekDuration}s`);
        }
        break;

      // Volume up
      case 'arrowup':
        e.preventDefault();
        Player.setVolume(Player.video.volume + 0.1);
        break;

      // Volume down
      case 'arrowdown':
        e.preventDefault();
        Player.setVolume(Player.video.volume - 0.1);
        break;

      // Decrease speed
      case ',':
      case '<':
        e.preventDefault();
        this.decreaseSpeed();
        break;

      // Increase speed
      case '.':
      case '>':
        e.preventDefault();
        this.increaseSpeed();
        break;

      // Show shortcuts
      case '?':
        e.preventDefault();
        Controls.toggleShortcuts();
        break;

      // Toggle stats overlay
      case 's':
        e.preventDefault();
        Controls.toggleStats();
        break;

      // Toggle Picture-in-Picture
      case 'p':
        e.preventDefault();
        Player.togglePiP();
        break;

      // Frame step backward (when paused)
      case ',':
        if (Player.state.isPaused) {
          e.preventDefault();
          this.frameStep(-1);
        }
        break;

      // Frame step forward (when paused)
      case '.':
        if (Player.state.isPaused) {
          e.preventDefault();
          this.frameStep(1);
        }
        break;

      // Jump to time (G key)
      case 'g':
        e.preventDefault();
        this.promptJumpToTime();
        break;

      // Number keys 0-9 for seeking
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        e.preventDefault();
        Seeking.seekToPercent(parseInt(key) * 10);
        this.showFeedback(`${key}0%`);
        break;

      // Escape - close overlays
      case 'escape':
        e.preventDefault();
        Controls.hideShortcuts();
        Controls.closeSpeedMenu();
        break;

      default:
        break;
    }
  },

  /**
   * Decrease playback speed
   */
  decreaseSpeed() {
    const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const currentIndex = speeds.indexOf(Player.video.playbackRate);
    if (currentIndex > 0) {
      Player.setPlaybackRate(speeds[currentIndex - 1]);
    }
  },

  /**
   * Increase playback speed
   */
  increaseSpeed() {
    const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const currentIndex = speeds.indexOf(Player.video.playbackRate);
    if (currentIndex < speeds.length - 1) {
      Player.setPlaybackRate(speeds[currentIndex + 1]);
    }
  },

  /**
   * Frame step (when paused)
   * @param {number} direction - -1 for backward, 1 for forward
   */
  frameStep(direction) {
    const video = Player.video;
    if (!video || !video.duration) return;

    // Approximate frame duration at 30fps
    const frameDuration = 1 / 30;
    const newTime = Utils.clamp(video.currentTime + (direction * frameDuration), 0, video.duration);

    video.currentTime = newTime;
    this.showFeedback(direction > 0 ? '▶ Next frame' : '◀ Previous frame');
    console.log('[Keyboard] Frame step:', direction > 0 ? 'forward' : 'backward');
  },

  /**
   * Prompt user to jump to specific time
   */
  promptJumpToTime() {
    const video = Player.video;
    if (!video || !video.duration) return;

    const currentTime = Utils.formatTime(video.currentTime);
    const duration = Utils.formatTime(video.duration);

    const input = prompt(`Jump to time (current: ${currentTime} / ${duration})\nEnter time in seconds or MM:SS format:`);

    if (!input) return;

    let targetSeconds;

    // Parse input
    if (input.includes(':')) {
      const parts = input.split(':').map(Number);
      if (parts.length === 2) {
        targetSeconds = parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        targetSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    } else {
      targetSeconds = parseFloat(input);
    }

    if (isNaN(targetSeconds) || targetSeconds < 0) {
      this.showFeedback('❌ Invalid time');
      return;
    }

    targetSeconds = Utils.clamp(targetSeconds, 0, video.duration);
    Seeking.jumpToTime(targetSeconds);
    this.showFeedback(`⏩ Jumped to ${Utils.formatTime(targetSeconds)}`);
  },

  /**
   * Clean up event listeners
   */
  destroy() {
    this.cleanupFns.forEach(fn => fn());
    this.cleanupFns = [];
  }
};
