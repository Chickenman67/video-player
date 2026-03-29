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
  }
};