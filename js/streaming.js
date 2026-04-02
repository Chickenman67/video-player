/* ==========================================================================
   Streaming Module
   Handles chunked file reading and MediaSource streaming for large files
   ========================================================================== */

const Streaming = {
  // Configuration
  config: {
    smallFileThreshold: 1024 * 1024 * 200, // 200MB - use blob for smaller files
    largeFileThreshold: 1024 * 1024 * 1024 * 2, // 2GB - aggressive streaming
    chunkSize: 1024 * 1024 * 2, // 2MB chunks
    prefetchSize: 1024 * 1024 * 10, // 10MB prefetch
    maxBufferSize: 1024 * 1024 * 100, // 100MB max buffer
    enableWorker: typeof Worker !== 'undefined'
  },

  // State
  state: {
    isActive: false,
    file: null,
    fileSize: 0,
    worker: null,
    workerCallbacks: {},
    workerIdCounter: 0,
    mediaSource: null,
    sourceBuffer: null,
    objectURL: null,
    pendingBuffers: [],
    isUpdating: false,
    loadedRanges: [],
    streamEnded: false,
    mimeType: ''
  },

  // Cleanup functions
  cleanupFns: [],

  /**
   * Initialize streaming module
   */
  init() {
    console.log('[Streaming] Module initialized');
  },

  /**
   * Check if streaming should be used for this file
   * @param {File} file - The video file
   * @returns {boolean}
   */
  shouldUseStreaming(file) {
    if (file.size < this.config.smallFileThreshold) {
      console.log('[Streaming] File too small for streaming, using blob:', file.size);
      return false;
    }
    if (!window.MediaSource) {
      console.log('[Streaming] MediaSource not supported, using blob');
      return false;
    }
    const mimeType = this.detectMimeType(file);
    if (!MediaSource.isTypeSupported(mimeType)) {
      console.log('[Streaming] MIME type not supported by MSE:', mimeType);
      return false;
    }
    return true;
  },

  /**
   * Detect MIME type for MSE
   * @param {File} file - The video file
   * @returns {string}
   */
  detectMimeType(file) {
    const fileName = file.name.toLowerCase();
    const fileType = file.type.toLowerCase();
    if (fileType.includes('mp4') || fileName.endsWith('.mp4') || fileName.endsWith('.m4v')) {
      return 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
    }
    if (fileType.includes('webm') || fileName.endsWith('.webm')) {
      return 'video/webm; codecs="vp9, opus"';
    }
    if (fileType.includes('matroska') || fileName.endsWith('.mkv')) {
      return 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
    }
    return 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
  },

  /**
   * Create and initialize Web Worker
   * @returns {Promise<void>}
   */
  async initWorker() {
    if (!this.config.enableWorker) {
      console.log('[Streaming] Workers not available');
      return;
    }
    try {
      this.state.worker = new Worker('js/worker-fileReader.js');
      this.state.worker.onmessage = (e) => {
        const { id, success, result, error } = e.data;
        const callback = this.state.workerCallbacks[id];
        if (callback) {
          if (success) {
            callback.resolve(result);
          } else {
            callback.reject(new Error(error));
          }
          delete this.state.workerCallbacks[id];
        }
      };
      this.state.worker.onerror = (err) => {
        console.error('[Streaming] Worker error:', err);
      };
      await this.workerCall('init', { file: this.state.file });
      console.log('[Streaming] Worker initialized');
    } catch (err) {
      console.warn('[Streaming] Worker init failed, falling back to main thread:', err);
      this.state.worker = null;
    }
  },

  /**
   * Make a call to the worker
   * @param {string} action - Action name
   * @param {Object} data - Data to send
   * @returns {Promise<any>}
   */
  workerCall(action, data = {}) {
    return new Promise((resolve, reject) => {
      if (!this.state.worker) {
        reject(new Error('Worker not available'));
        return;
      }
      const id = ++this.state.workerIdCounter;
      this.state.workerCallbacks[id] = { resolve, reject };
      this.state.worker.postMessage({ id, action, data });
    });
  },

  /**
   * Read chunk using worker or main thread
   * @param {number} start - Start byte
   * @param {number} end - End byte
   * @returns {Promise<ArrayBuffer>}
   */
  async readChunk(start, end) {
    if (this.state.worker) {
      return this.workerCall('readChunk', { start, end });
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const slice = this.state.file.slice(start, end);
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(slice);
    });
  },

  /**
   * Start streaming the file
   * @param {File} file - The video file
   * @returns {Promise<Object>} - { url, cleanup }
   */
  async startStreaming(file) {
    this.state.file = file;
    this.state.fileSize = file.size;
    this.state.mimeType = this.detectMimeType(file);
    console.log('[Streaming] Starting streaming for:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)}MB)`);
    await this.initWorker();
    this.state.mediaSource = new MediaSource();
    this.state.objectURL = URL.createObjectURL(this.state.mediaSource);
    return new Promise((resolve, reject) => {
      const onSourceOpen = () => {
        this.state.mediaSource.removeEventListener('sourceopen', onSourceOpen);
        try {
          this.state.sourceBuffer = this.state.mediaSource.addSourceBuffer(this.state.mimeType);
          this.state.sourceBuffer.mode = 'segments';
          this.state.sourceBuffer.addEventListener('updateend', () => {
            this.state.isUpdating = false;
            this.processPendingBuffers();
          });
          this.state.sourceBuffer.addEventListener('error', (e) => {
            console.error('[Streaming] SourceBuffer error:', e);
          });
          this.state.isActive = true;
          this.loadInitialSegment();
          console.log('[Streaming] MediaSource ready');
          resolve({
            url: this.state.objectURL,
            cleanup: () => this.cleanup()
          });
        } catch (err) {
          console.error('[Streaming] Failed to create SourceBuffer:', err);
          reject(err);
        }
      };
      this.state.mediaSource.addEventListener('sourceopen', onSourceOpen);
      setTimeout(() => {
        reject(new Error('MediaSource sourceopen timeout'));
      }, 5000);
    });
  },

  /**
   * Load initial segment for quick start
   */
  async loadInitialSegment() {
    const initSize = Math.min(this.config.prefetchSize, this.state.fileSize);
    try {
      const initData = await this.readChunk(0, initSize);
      this.appendBuffer(initData);
      this.state.loadedRanges.push({ start: 0, end: initSize });
      console.log('[Streaming] Initial segment loaded:', initSize, 'bytes');
    } catch (err) {
      console.error('[Streaming] Failed to load initial segment:', err);
    }
  },

  /**
   * Load segment around a specific time position
   * @param {number} timeSeconds - Target time in seconds
   */
  async loadSegmentAtTime(timeSeconds) {
    const estimatedDuration = this.state.fileSize > 1024 * 1024 * 1024 ? 3600 : 1800;
    const bytesPerSecond = this.state.fileSize / estimatedDuration;
    const targetByte = Math.floor(timeSeconds * bytesPerSecond);
    const isLoaded = this.state.loadedRanges.some(
      range => targetByte >= range.start && targetByte < range.end
    );
    if (isLoaded) {
      console.log('[Streaming] Segment already loaded at:', timeSeconds, 'seconds');
      return;
    }
    const startByte = Math.max(0, targetByte - this.config.chunkSize);
    const endByte = Math.min(this.state.fileSize, targetByte + this.config.prefetchSize);
    try {
      const data = await this.readChunk(startByte, endByte);
      this.appendBuffer(data);
      this.state.loadedRanges.push({ start: startByte, end: endByte });
      console.log('[Streaming] Loaded segment at:', timeSeconds, 'seconds');
    } catch (err) {
      console.error('[Streaming] Failed to load segment:', err);
    }
  },

  /**
   * Append buffer data to source buffer
   * @param {ArrayBuffer} data - Buffer data
   */
  appendBuffer(data) {
    if (!this.state.sourceBuffer || this.state.sourceBuffer.updating) {
      this.state.pendingBuffers.push(data);
      return;
    }
    try {
      this.state.sourceBuffer.appendBuffer(data);
      this.state.isUpdating = true;
    } catch (err) {
      if (err.name === 'QuotaExceededError') {
        console.warn('[Streaming] Buffer quota exceeded, evicting old data');
        this.evictOldBuffers();
        try {
          this.state.sourceBuffer.appendBuffer(data);
        } catch (retryErr) {
          console.error('[Streaming] Buffer append failed after eviction:', retryErr);
        }
      } else {
        console.error('[Streaming] Buffer append error:', err);
      }
    }
  },

  /**
   * Process pending buffer queue
   */
  processPendingBuffers() {
    if (this.state.pendingBuffers.length === 0 || this.state.isUpdating) return;
    const nextBuffer = this.state.pendingBuffers.shift();
    this.appendBuffer(nextBuffer);
  },

  /**
   * Evict old buffered ranges to free memory
   */
  evictOldBuffers() {
    if (!this.state.sourceBuffer || !this.state.sourceBuffer.buffered.length) return;
    const buffered = this.state.sourceBuffer.buffered;
    const currentTime = Player.video ? Player.video.currentTime : 0;
    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      if (end < currentTime - 30) {
        try {
          this.state.sourceBuffer.remove(start, end);
          console.log('[Streaming] Evicted buffer range:', start, '-', end);
        } catch (err) {
          console.warn('[Streaming] Buffer eviction failed:', err);
        }
      }
    }
  },

  /**
   * Get memory usage estimate
   * @returns {Object}
   */
  getMemoryUsage() {
    if (!this.state.sourceBuffer || !this.state.sourceBuffer.buffered.length) {
      return { bufferedMB: 0, loadedRanges: 0 };
    }
    let totalBuffered = 0;
    const buffered = this.state.sourceBuffer.buffered;
    for (let i = 0; i < buffered.length; i++) {
      totalBuffered += buffered.end(i) - buffered.start(i);
    }
    const bufferedMB = (totalBuffered * 5 * 1024 * 1024 / 8) / (1024 * 1024);
    return {
      bufferedMB: Math.round(bufferedMB * 10) / 10,
      loadedRanges: this.state.loadedRanges.length,
      pendingBuffers: this.state.pendingBuffers.length
    };
  },

  /**
   * Cleanup streaming resources
   */
  cleanup() {
    console.log('[Streaming] Cleaning up');
    if (this.state.worker) {
      this.state.worker.terminate();
      this.state.worker = null;
      this.state.workerCallbacks = {};
    }
    if (this.state.objectURL) {
      URL.revokeObjectURL(this.state.objectURL);
      this.state.objectURL = null;
    }
    if (this.state.mediaSource && this.state.mediaSource.readyState === 'open') {
      try {
        this.state.mediaSource.endOfStream();
      } catch (err) {
        console.warn('[Streaming] endOfStream error:', err);
      }
    }
    this.state.isActive = false;
    this.state.file = null;
    this.state.fileSize = 0;
    this.state.mediaSource = null;
    this.state.sourceBuffer = null;
    this.state.pendingBuffers = [];
    this.state.loadedRanges = [];
    this.state.streamEnded = false;
    this.cleanupFns.forEach(fn => fn());
    this.cleanupFns = [];
    console.log('[Streaming] Cleanup complete');
  },

  /**
   * Destroy module
   */
  destroy() {
    this.cleanup();
  }
};