/* ==========================================================================
   Utility Functions
   Helper functions for the video player
   ========================================================================== */

const Utils = {
  /**
   * Format seconds into MM:SS or HH:MM:SS string
   * @param {number} seconds
   * @returns {string}
   */
  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  /**
   * Throttle function execution
   * @param {Function} fn
   * @param {number} delay - milliseconds
   * @returns {Function}
   */
  throttle(fn, delay) {
    let lastCall = 0;
    return function(...args) {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        fn.apply(this, args);
      }
    };
  },

  /**
   * Debounce function execution
   * @param {Function} fn
   * @param {number} delay - milliseconds
   * @returns {Function}
   */
  debounce(fn, delay) {
    let timer = null;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * Clamp a value between min and max
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  },

  /**
   * Get element's position relative to viewport
   * @param {HTMLElement} el
   * @returns {DOMRect}
   */
  getRect(el) {
    return el.getBoundingClientRect();
  },

  /**
   * Calculate percentage position from mouse event on element
   * @param {MouseEvent} e
   * @param {HTMLElement} el
   * @returns {number} 0-1
   */
  getEventPercent(e, el) {
    const rect = this.getRect(el);
    return this.clamp((e.clientX - rect.left) / rect.width, 0, 1);
  },

  /**
   * Add event listener with cleanup tracking
   * @param {HTMLElement} el
   * @param {string} event
   * @param {Function} handler
   * @param {Object} options
   * @returns {Function} cleanup function
   */
  on(el, event, handler, options = {}) {
    el.addEventListener(event, handler, options);
    return () => el.removeEventListener(event, handler, options);
  },

  /**
   * Query selector shorthand
   * @param {string} selector
   * @param {HTMLElement} parent
   * @returns {HTMLElement}
   */
  $(selector, parent = document) {
    return parent.querySelector(selector);
  },

  /**
   * Query selector all shorthand
   * @param {string} selector
   * @param {HTMLElement} parent
   * @returns {NodeList}
   */
  $$(selector, parent = document) {
    return parent.querySelectorAll(selector);
  },

  /**
   * Check if PiP is supported
   * @returns {boolean}
   */
  isPiPSupported() {
    return document.pictureInPictureEnabled;
  },

  /**
   * Check if fullscreen is supported
   * @returns {boolean}
   */
  isFullscreenSupported() {
    return !!(
      document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      document.mozFullScreenEnabled ||
      document.msFullscreenEnabled
    );
  },

  /**
   * Request fullscreen on element
   * @param {HTMLElement} el
   */
  requestFullscreen(el) {
    if (el.requestFullscreen) {
      el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.mozRequestFullScreen) {
      el.mozRequestFullScreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    }
  },

  /**
   * Exit fullscreen
   */
  exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  },

  /**
   * Get current fullscreen element
   * @returns {HTMLElement|null}
   */
  getFullscreenElement() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  },

  /**
   * Request animation frame with fallback
   * @param {Function} callback
   * @returns {number}
   */
  raf(callback) {
    return requestAnimationFrame(callback);
  },

  /**
   * Cancel animation frame
   * @param {number} id
   */
  cancelRaf(id) {
    return cancelAnimationFrame(id);
  },

  /**
   * Create a performance mark for monitoring
   * @param {string} name
   */
  perfMark(name) {
    if (performance && performance.mark) {
      try {
        performance.mark(name);
      } catch (err) {
        console.warn('[Utils] Performance mark failed:', err.message);
      }
    }
  },

  /**
   * Measure performance between two marks
   * @param {string} name
   * @param {string} startMark
   * @param {string} endMark
   */
  perfMeasure(name, startMark, endMark) {
    if (performance && performance.measure) {
      try {
        performance.measure(name, startMark, endMark);
        const measures = performance.getEntriesByName(name);
        if (measures.length > 0) {
          const duration = measures[measures.length - 1].duration;
          console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
          return duration;
        }
      } catch (err) {
        console.warn('[Utils] Performance measure failed:', err.message);
      }
    }
    return null;
  },

  /**
   * Check if device is in dark mode
   * @returns {boolean}
   */
  isDarkMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  },

  /**
   * Request idle callback for non-urgent tasks
   * @param {Function} callback
   * @param {Object} options
   */
  requestIdle(callback, options = {}) {
    if ('requestIdleCallback' in window) {
      return requestIdleCallback(callback, options);
    }
    // Fallback: use setTimeout
    return setTimeout(callback, 100);
  },

  /**
   * Cancel idle callback
   * @param {number} id
   */
  cancelIdle(id) {
    if ('cancelIdleCallback' in window) {
      return cancelIdleCallback(id);
    }
    return clearTimeout(id);
  },

  /**
   * Detect supported video codecs
   * @returns {Array} Array of supported video codecs
   */
  detectVideoCodecs() {
    const video = document.createElement('video');
    const codecs = [
      { name: 'H.264 (AVC)', mimeType: 'video/mp4; codecs="avc1.42E01E"' },
      { name: 'H.264 High', mimeType: 'video/mp4; codecs="avc1.640028"' },
      { name: 'VP9', mimeType: 'video/webm; codecs="vp9"' },
      { name: 'VP8', mimeType: 'video/webm; codecs="vp8"' },
      { name: 'AV1', mimeType: 'video/mp4; codecs="av01.0.01M.08"' },
      { name: 'HEVC (H.265)', mimeType: 'video/mp4; codecs="hev1.1.6.L93.B0"' },
      { name: 'HEVC Main', mimeType: 'video/mp4; codecs="hvc1.1.6.L93.B0"' }
    ];

    return codecs.filter(codec => {
      const support = video.canPlayType(codec.mimeType);
      return support === 'probably' || support === 'maybe';
    }).map(codec => codec.name);
  },

  /**
   * Detect supported audio codecs
   * @returns {Array} Array of supported audio codecs
   */
  detectAudioCodecs() {
    const audio = document.createElement('audio');
    const codecs = [
      { name: 'AAC', mimeType: 'audio/mp4; codecs="mp4a.40.2"' },
      { name: 'AAC-LC', mimeType: 'audio/mp4; codecs="mp4a.40.5"' },
      { name: 'Opus', mimeType: 'audio/webm; codecs="opus"' },
      { name: 'Vorbis', mimeType: 'audio/webm; codecs="vorbis"' },
      { name: 'MP3', mimeType: 'audio/mpeg' },
      { name: 'FLAC', mimeType: 'audio/flac' },
      { name: 'PCM', mimeType: 'audio/wav' }
    ];

    return codecs.filter(codec => {
      const support = audio.canPlayType(codec.mimeType);
      return support === 'probably' || support === 'maybe';
    }).map(codec => codec.name);
  },

  /**
   * Check if a specific codec can be played
   * @param {string} mimeType - The MIME type with codec
   * @returns {string} 'probably', 'maybe', or '' (not supported)
   */
  canPlayCodec(mimeType) {
    const video = document.createElement('video');
    return video.canPlayType(mimeType);
  },

  /**
   * Get codec info from video element and file
   * @param {HTMLVideoElement} video - The video element
   * @param {File} file - The video file (optional)
   * @returns {Object} Codec information
   */
  getVideoCodecInfo(video, file = null) {
    const info = {
      videoCodec: 'Unknown',
      audioCodec: 'Unknown',
      width: 0,
      height: 0,
      bitrate: 0,
      framerate: 0,
      fileSize: file ? file.size : 0
    };

    if (video.videoWidth) info.width = video.videoWidth;
    if (video.videoHeight) info.height = video.videoHeight;

    // Detect codec from file name and type
    if (file) {
      const fileName = file.name.toLowerCase();
      const fileType = file.type.toLowerCase();

      // Check for HEVC/H.265 indicators - more comprehensive patterns
      if (fileName.includes('x265') || fileName.includes('h265') || fileName.includes('hevc') || 
          fileName.includes('265') || fileName.includes('hev') ||
          fileType.includes('hev1') || fileType.includes('hvc1') ||
          fileType.includes('hevc')) {
        info.videoCodec = 'H.265 (HEVC)';
      }
      // Check for AV1
      else if (fileName.includes('av1') || fileName.includes('av01') || fileType.includes('av01')) {
        info.videoCodec = 'AV1';
      }
      // Check for VP9
      else if (fileName.includes('vp9') || fileName.includes('vp09') || fileType.includes('vp09')) {
        info.videoCodec = 'VP9';
      }
      // Check for VP8
      else if (fileName.includes('vp8') || fileName.includes('vp08') || fileType.includes('vp08')) {
        info.videoCodec = 'VP8';
      }
      // Check for H.264/x264
      else if (fileName.includes('x264') || fileName.includes('h264') || fileName.includes('avc') ||
               fileName.includes('264') || fileType.includes('avc1')) {
        info.videoCodec = 'H.264 (AVC)';
      }
      // Check file extension for codec inference
      else if (fileType.includes('mp4') || fileType.includes('m4v')) {
        info.videoCodec = 'H.264 (MP4)';
      }
      else if (fileType.includes('webm')) {
        info.videoCodec = 'VP9 (WebM)';
      }
      else if (fileType.includes('mkv') || fileType.includes('x-matroska')) {
        // MKV can contain various codecs, check filename first
        if (fileName.includes('hevc') || fileName.includes('x265') || fileName.includes('h265') || fileName.includes('265')) {
          info.videoCodec = 'H.265 (MKV)';
        } else if (fileName.includes('av1')) {
          info.videoCodec = 'AV1 (MKV)';
        } else if (fileName.includes('vp9')) {
          info.videoCodec = 'VP9 (MKV)';
        } else {
          info.videoCodec = 'H.264 (MKV)';
        }
      }
      else if (fileType.includes('avi')) {
        info.videoCodec = 'H.264 (AVI)';
      }
      else if (fileType.includes('mov')) {
        info.videoCodec = 'H.264 (MOV)';
      }
    }

    // Try to detect codec from media source
    if (video.captureStream || video.mozCaptureStream) {
      try {
        const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          const settings = videoTracks[0].getSettings();
          if (settings.codec) {
            info.videoCodec = settings.codec;
          }
        }
      } catch (e) {
        // Stream capture not supported or failed
      }
    }

    // Estimate bitrate from duration and file size
    if (file && video.duration && video.duration > 0) {
      const bytesPerSecond = file.size / video.duration;
      info.bitrate = Math.round(bytesPerSecond * 8 / 1000); // kbps
    }
    // Fallback: estimate from buffered data
    else if (video.buffered.length > 0 && video.duration) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      const bytesPerSecond = (video.webkitVideoDecodedByteCount || 0) / bufferedEnd;
      info.bitrate = Math.round(bytesPerSecond * 8 / 1000); // kbps
    }

    return info;
  },

  /**
   * Format resolution string
   * @param {number} width
   * @param {number} height
   * @returns {string} Resolution label (e.g., "1080p", "720p")
   */
  formatResolution(width, height) {
    if (height >= 2160) return '4K';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    return `${height}p`;
  },

  /**
   * Format bitrate for display
   * @param {number} kbps - Kilobits per second
   * @returns {string} Formatted bitrate string
   */
  formatBitrate(kbps) {
    if (kbps >= 10000) {
      return `${(kbps / 1000).toFixed(1)} Mbps`;
    }
    return `${kbps} kbps`;
  }
};
