/* ==========================================================================
   File Reader Web Worker
   Handles file I/O operations off the main thread
   ========================================================================== */

// Worker state
const state = {
  file: null,
  fileSize: 0,
  chunkSize: 1024 * 1024 * 2, // 2MB chunks
  readQueue: [],
  isProcessing: false
};

/**
 * Read a chunk of the file
 * @param {number} start - Start byte offset
 * @param {number} end - End byte offset
 * @returns {Promise<ArrayBuffer>}
 */
function readChunk(start, end) {
  return new Promise((resolve, reject) => {
    if (!state.file) {
      reject(new Error('No file loaded'));
      return;
    }

    const slice = state.file.slice(start, end);
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);

    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Read metadata from file header
 * @param {number} bytes - Number of bytes to read from start
 * @returns {Promise<ArrayBuffer>}
 */
function readHeader(bytes) {
  return readChunk(0, Math.min(bytes, state.fileSize));
}

/**
 * Find MP4 moov atom location by scanning file
 * @returns {Promise<Object>} Moov atom location info
 */
async function findMoovAtom() {
  const HEADER_SCAN_SIZE = 1024 * 64; // Scan first 64KB
  const headerData = await readHeader(HEADER_SCAN_SIZE);
  const view = new DataView(headerData);

  let offset = 0;
  while (offset < headerData.byteLength - 8) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );

    if (type === 'moov') {
      return { found: true, offset, size, type };
    }

    // Handle extended size
    if (size === 1 && offset + 16 <= headerData.byteLength) {
      const extendedSize = Number(view.getBigUint64(offset + 8));
      offset += extendedSize;
    } else if (size > 0) {
      offset += size;
    } else {
      break;
    }
  }

  return { found: false };
}

/**
 * Parse MP4 stss box (sync samples / keyframes)
 * @param {ArrayBuffer} data - Moov atom data
 * @param {number} moovOffset - Offset of moov in file
 * @returns {Object} Keyframe information
 */
function parseStssBox(data, moovOffset) {
  const view = new DataView(data);
  let offset = 0;
  const keyframes = [];

  // Search for stss box within moov
  while (offset < data.byteLength - 8) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );

    if (type === 'stss') {
      // Parse sync sample box
      const version = view.getUint8(offset + 8);
      const flags = (view.getUint16(offset + 8) & 0xFFFFFF);
      const entryCount = view.getUint32(offset + 12);

      for (let i = 0; i < entryCount && offset + 16 + i * 4 < data.byteLength; i++) {
        keyframes.push(view.getUint32(offset + 16 + i * 4));
      }

      return { found: true, keyframes, count: entryCount };
    }

    // Recurse into containers
    if (type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl') {
      const subResult = parseStssBox(data.slice(offset + 8, offset + size), moovOffset + offset + 8);
      if (subResult.found) return subResult;
    }

    if (size > 0) {
      offset += size;
    } else {
      break;
    }
  }

  return { found: false, keyframes: [], count: 0 };
}

/**
 * Parse mvhd box to get timescale and duration
 * @param {ArrayBuffer} data - Moov atom data
 * @returns {Object} Duration info
 */
function parseMvhdBox(data) {
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

    if (type === 'mvhd') {
      const version = view.getUint8(offset + 8);
      let timescale, duration;

      if (version === 0) {
        timescale = view.getUint32(offset + 20);
        duration = view.getUint32(offset + 24);
      } else {
        timescale = view.getUint32(offset + 28);
        duration = Number(view.getBigUint64(offset + 32));
      }

      return { found: true, timescale, duration, durationSeconds: duration / timescale };
    }

    if (size > 0) {
      offset += size;
    } else {
      break;
    }
  }

  return { found: false };
}

/**
 * Build keyframe index from MP4 file
 * @returns {Promise<Object>} Keyframe index
 */
async function buildKeyframeIndex() {
  try {
    const moovInfo = await findMoovAtom();

    if (!moovInfo.found) {
      return { success: false, reason: 'moov atom not found in header scan' };
    }

    // Read moov atom (up to 4MB to be safe)
    const moovSize = Math.min(moovInfo.size, 1024 * 1024 * 4);
    const moovData = await readChunk(moovInfo.offset, moovInfo.offset + moovSize);

    // Parse duration
    const mvhdInfo = parseMvhdBox(moovData);

    // Parse keyframes
    const stssInfo = parseStssBox(moovData, moovInfo.offset);

    if (!stssInfo.found) {
      // No stss box means all samples are keyframes (common in H.264 baseline)
      return {
        success: true,
        keyframes: [],
        allKeyframes: true,
        duration: mvhdInfo.durationSeconds || 0,
        timescale: mvhdInfo.timescale || 0
      };
    }

    return {
      success: true,
      keyframes: stssInfo.keyframes,
      allKeyframes: false,
      count: stssInfo.count,
      duration: mvhdInfo.durationSeconds || 0,
      timescale: mvhdInfo.timescale || 0
    };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

/**
 * Read file in streaming fashion with priority
 * @param {number} start - Start byte
 * @param {number} end - End byte
 * @param {number} priority - Higher = more important
 * @returns {Promise<ArrayBuffer>}
 */
async function readWithPriority(start, end, priority = 0) {
  // Clamp to file bounds
  start = Math.max(0, start);
  end = Math.min(state.fileSize, end);

  if (start >= end) {
    return new ArrayBuffer(0);
  }

  // For small reads, do directly
  if (end - start <= state.chunkSize) {
    return readChunk(start, end);
  }

  // For large reads, chunk it
  const chunks = [];
  let current = start;

  while (current < end) {
    const chunkEnd = Math.min(current + state.chunkSize, end);
    const chunk = await readChunk(current, chunkEnd);
    chunks.push(chunk);
    current = chunkEnd;
  }

  // Concatenate chunks
  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }

  return result.buffer;
}

// Message handler
self.onmessage = async function(e) {
  const { id, action, data } = e.data;

  try {
    let result;

    switch (action) {
      case 'init':
        state.file = data.file;
        state.fileSize = data.file.size;
        result = {
          fileName: data.file.name,
          fileSize: state.fileSize,
          fileType: data.file.type
        };
        break;

      case 'readChunk':
        result = await readChunk(data.start, data.end);
        break;

      case 'readHeader':
        result = await readHeader(data.bytes);
        break;

      case 'buildKeyframeIndex':
        result = await buildKeyframeIndex();
        break;

      case 'readWithPriority':
        result = await readWithPriority(data.start, data.end, data.priority);
        break;

      case 'findMoovAtom':
        result = await findMoovAtom();
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    self.postMessage({ id, success: true, result });

  } catch (err) {
    self.postMessage({
      id,
      success: false,
      error: err.message
    });
  }
};