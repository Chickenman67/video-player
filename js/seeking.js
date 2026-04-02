/* ==========================================================================
   Seeking Module
   Handles keyframe-based seeking for instant skips anywhere in video
   ========================================================================== */

const Seeking = {
  // Configuration
  config: {
    enableKeyframeSeeking: true,
    keyframeCacheSize: 1000,
    preBufferSeconds: 3,
    seekDebounceMs: 50
  },

  // State
  state: {
    keyframeIndex: [],
    keyframeTimes: [],
    allKeyframes: false,
    duration: 0,
    timescale: 0,
    isIndexed: false,
    isIndexing: false,
    seekCache: new Map(),
    lastSeekTime: 0,
    pendingSeek: null
  },

  // Cleanup functions
  cleanupFns: [],

  /**
   * Initialize seeking module
   */
  init() {
    console.log('[Seeking] Module initialized');
  },

  /**
   * Build keyframe index from file
   * @param {File} file - The video file
   * @returns {Promise<boolean>} Success status
   */
  async buildIndex(file) {
    if (this.state.isIndexed || this.state.isIndexing) {
      return this.state.isIndexed;
    }

    this.state.isIndexing = true;
    console.log('[Seeking] Building keyframe index for:', file.name);

    try {
      let result;

      // Try worker first
      if (Streaming.state.worker) {
        try {
          result = await Streaming.workerCall('buildKeyframeIndex');
        } catch (err) {
          console.warn('[Seeking] Worker index build failed, trying main thread:', err);
          result = await this.buildIndexMainThread(file);
        }
      } else {
        result = await this.buildIndexMainThread(file);
      }

      if (result.success) {
        this.state.keyframeIndex = result.keyframes || [];
        this.state.allKeyframes = result.allKeyframes || false;
        this.state.duration = result.duration || 0;
        this.state.timescale = result.timescale || 0;

        // Build time-based index for fast lookup
        this.buildTimeIndex();

        this.state.isIndexed = true;
        console.log('[Seeking] Keyframe index built:', {
          keyframeCount: this.state.keyframeIndex.length,
          allKeyframes: this.state.allKeyframes,
          duration: this.state.duration
        });
      } else {
        console.warn('[Seeking] Index build failed:', result.reason);
      }

    } catch (err) {
      console.error('[Seeking] Index build error:', err);
    }

    this.state.isIndexing = false;
    return this.state.isIndexed;
  },

  /**
   * Build index on main thread (fallback)
   * @param {File} file - The video file
   * @returns {Promise<Object>}
   */
  async buildIndexMainThread(file) {
    return new Promise((resolve) => {
      // Simple MP4 header scan for moov atom
      const reader = new FileReader();
      const headerSize = Math.min(1024 * 64, file.size); // Read first 64KB
      const slice = file.slice(0, headerSize);

      reader.onload = (e) => {
        try {
          const data = e.target.result;
          const view = new DataView(data);
          let offset = 0;

          while (offset < data.byteLength - 8) {
            const size = view.getUint32(offset);
            const type = String.fromCharCode(
              view.getUint8(offset + 4),
              view.getUint8(offset + 5),
              view.getUint8(offset + 6),
              view.getUint8(offset + 7)
            );

            if (type === 'moov') {
              // Found moov, but can't easily parse stss without full moov data
              // Fall back to assuming all keyframes
              resolve({
                success: true,
                keyframes: [],
                allKeyframes: true,
                duration: 0,
                timescale: 0
              });
              return;
            }

            if (size > 0) {
              offset += size;
            } else {
              break;
            }
          }

          resolve({ success: false, reason: 'moov atom not found' });
        } catch (err) {
          resolve({ success: false, reason: err.message });
        }
      };

      reader.onerror = () => resolve({ success: false, reason: 'FileReader error' });
      reader.readAsArrayBuffer(slice);
    });
  },

  /**
   * Build time-based keyframe index for fast lookups
   */
  buildTimeIndex() {
    if (!this.state.timescale || this.state.timescale === 0) {
      // If no timescale, assume keyframes are frame numbers at 30fps
      this.state.keyframeTimes = this.state.keyframeIndex.map(frame => frame / 30);
    } else {
      // Convert sample numbers to times
      this.state.keyframeTimes = this.state.keyframeIndex.map(sample => sample / this.state.timescale);
    }

    // Sort by time
    this.state.keyframeTimes.sort((a, b) => a - b);

    console.log('[Seeking] Time index built, first 5 keyframes:', this.state.keyframeTimes.slice(0, 5));
  },

  /**
   * Find nearest keyframe before target time
   * @param {number} targetTime - Target time in seconds
   * @returns {number} Nearest keyframe time
   */
  findNearestKeyframe(targetTime) {
    if (this.state.allKeyframes || this.state.keyframeTimes.length === 0) {
      // All frames are keyframes or no index, seek directly
      return targetTime;
    }

    // Binary search for nearest keyframe
    let low = 0;
    let high = this.state.keyframeTimes.length - 1;
    let bestIndex = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const keyframeTime = this.state.keyframeTimes[mid];

      if (keyframeTime <= targetTime) {
        bestIndex = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return this.state.keyframeTimes[bestIndex];
  },

  /**
   * Perform smart seek to target time
   * @param {number} targetTime - Target time in seconds
   * @param {boolean} precise - If true, seek exactly to target (slower)
   * @returns {Promise<void>}
   */
  async smartSeek(targetTime, precise = false) {
    const video = Player.video;
    if (!video || !video.duration) return;

    // Clamp to valid range
    targetTime = Utils.clamp(targetTime, 0, video.duration);

    // Check cache
    const cacheKey = Math.floor(targetTime * 10) / 10; // Round to 0.1s
    if (this.state.seekCache.has(cacheKey)) {
      const cachedTime = this.state.seekCache.get(cacheKey);
      video.currentTime = cachedTime;
      console.log('[Seeking] Cache hit, seeking to:', cachedTime);
      return;
    }

    // Find nearest keyframe
    const keyframeTime = this.findNearestKeyframe(targetTime);

    if (!precise && keyframeTime < targetTime) {
      // Seek to keyframe then let decoder catch up
      video.currentTime = keyframeTime;
      console.log('[Seeking] Keyframe seek to:', keyframeTime, '(target:', targetTime, ')');

      // Cache the result
      this.state.seekCache.set(cacheKey, keyframeTime);
      this.trimCache();
    } else {
      // Direct seek (for precise or when all keyframes)
      video.currentTime = targetTime;
      console.log('[Seeking] Direct seek to:', targetTime);

      this.state.seekCache.set(cacheKey, targetTime);
      this.trimCache();
    }

    this.state.lastSeekTime = Date.now();
  },

  /**
   * Seek with debouncing for rapid seeks (e.g., dragging progress bar)
   * @param {number} targetTime - Target time
   */
  debouncedSeek(targetTime) {
    if (this.state.pendingSeek) {
      clearTimeout(this.state.pendingSeek);
    }

    // Update visual immediately
    if (Controls && Controls.updateProgressBar) {
      const percent = targetTime / Player.video.duration;
      Controls.updateProgressBar(percent);
    }

    this.state.pendingSeek = setTimeout(() => {
      this.smartSeek(targetTime);
      this.state.pendingSeek = null;
    }, this.config.seekDebounceMs);
  },

  /**
   * Seek forward by delta seconds
   * @param {number} delta - Seconds to seek
   */
  seekForward(delta) {
    const video = Player.video;
    if (!video) return;
    const targetTime = video.currentTime + delta;
    this.smartSeek(targetTime);
  },

  /**
   * Seek backward by delta seconds
   * @param {number} delta - Seconds to seek
   */
  seekBackward(delta) {
    const video = Player.video;
    if (!video) return;
    const targetTime = video.currentTime - delta;
    this.smartSeek(targetTime);
  },

  /**
   * Seek to percentage of duration
   * @param {number} percent - 0-100
   */
  seekToPercent(percent) {
    const video = Player.video;
    if (!video || !video.duration) return;
    const targetTime = (percent / 100) * video.duration;
    this.smartSeek(targetTime);
  },

  /**
   * Jump to specific time (G key)
   * @param {number} timeSeconds - Time in seconds
   */
  jumpToTime(timeSeconds) {
    this.smartSeek(timeSeconds, true); // Precise seek
  },

  /**
   * Pre-buffer around current position for smooth playback
   */
  async preBuffer() {
    if (!Streaming.state.isActive) return;

    const video = Player.video;
    if (!video) return;

    const currentTime = video.currentTime;
    await Streaming.loadSegmentAtTime(currentTime);
  },

  /**
   * Get seek statistics
   * @returns {Object}
   */
  getStats() {
    return {
      isIndexed: this.state.isIndexed,
      keyframeCount: this.state.keyframeTimes.length,
      allKeyframes: this.state.allKeyframes,
      duration: this.state.duration,
      cacheSize: this.state.seekCache.size,
      lastSeekTime: this.state.lastSeekTime
    };
  },

  /**
   * Trim seek cache to max size
   */
  trimCache() {
    if (this.state.seekCache.size > this.config.keyframeCacheSize) {
      const firstKey = this.state.seekCache.keys().next().value;
      this.state.seekCache.delete(firstKey);
    }
  },

  /**
   * Cleanup seeking resources
   */
  cleanup() {
    console.log('[Seeking] Cleaning up');
    if (this.state.pendingSeek) {
      clearTimeout(this.state.pendingSeek);
      this.state.pendingSeek = null;
    }
    this.state.keyframeIndex = [];
    this.state.keyframeTimes = [];
    this.state.seekCache.clear();
    this.state.isIndexed = false;
    this.state.isIndexing = false;
    this.cleanupFns.forEach(fn => fn());
    this.cleanupFns = [];
    console.log('[Seeking] Cleanup complete');
  },

  /**
   * Destroy module
   */
  destroy() {
    this.cleanup();
  }
};