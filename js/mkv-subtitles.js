/**
 * MKV Subtitle Extractor
 * Parses EBML/Matroska container to extract actual subtitle cues
 * Prioritizes English language tracks
 */

const MKVSubtitleExtractor = {
  initialized: false,

  async init() {
    if (this.initialized) return true;
    this.initialized = true;
    console.log('✓ MKV subtitle parser ready');
    return true;
  },

  /**
   * Main entry point: extract and load subtitles from MKV file
   */
  async extractFromMKV(file, videoElement) {
    try {
      console.log('[MKVExtractor] Extracting subtitles from:', file.name);

      const result = { found: 0, tracks: [], cues: [], error: null };

      // Step 1: Parse EBML structure to find subtitle tracks
      const tracks = await this.parseEBML(file);
      
      if (tracks.length === 0) {
        console.log('[MKVExtractor] No subtitle tracks found');
        return result;
      }

      // Step 2: Prioritize English track
      const englishTrack = tracks.find(t => 
        t.language && (t.language.startsWith('eng') || t.language.toLowerCase() === 'eng')
      ) || tracks.find(t => t.codecID && t.codecID.includes('TEXT'));

      if (!englishTrack) {
        console.log('[MKVExtractor] No text-based subtitle track found');
        return result;
      }

      console.log(`[MKVExtractor] Using track: ${englishTrack.name} (${englishTrack.codecID})`);

      // Step 3: Extract subtitle cues from the selected track
      const cues = await this.extractCuesFromTrack(file, englishTrack);
      
      result.found = 1;
      result.tracks = [englishTrack];
      result.cues = cues;

      // Step 4: Add cues to video element
      if (cues.length > 0) {
        const textTrack = videoElement.addTextTrack('captions', englishTrack.name, 'en');
        
        cues.forEach(cue => {
          try {
            textTrack.addCue(new VTTCue(cue.start, cue.end, cue.text));
          } catch (e) {
            console.warn('[MKVExtractor] Failed to add cue:', e.message);
          }
        });

        textTrack.mode = 'showing';
        console.log(`✓ Added ${cues.length} subtitle cues to video`);
      }

      return result;
    } catch (error) {
      console.error('[MKVExtractor] Extraction error:', error);
      return { found: 0, tracks: [], cues: [], error: error.message };
    }
  },

  /**
   * Parse EBML file structure to locate subtitle tracks
   */
  async parseEBML(file) {
    try {
      // Read first 100KB to find track definitions
      const headerBuffer = await file.slice(0, 100000).arrayBuffer();
      const view = new DataView(headerBuffer);
      
      let offset = 0;
      let tracks = [];

      // Scan for Tracks element (ID: 0x1654AE6B)
      while (offset < view.byteLength - 8) {
        const { elementID, size } = this.readElement(view, offset);
        if (!elementID) break;

        if (elementID === 0x1654AE6B) {
          // Found Tracks element
          const tracksStart = offset + this.getElementHeaderSize(elementID, size);
          const tracksEnd = tracksStart + size;
          tracks = this.parseTracksElement(view, tracksStart, tracksEnd);
          break;
        }

        offset += this.getElementHeaderSize(elementID, size) + size;
      }

      return tracks;
    } catch (error) {
      console.warn('[MKVExtractor] EBML parse error:', error.message);
      return [];
    }
  },

  /**
   * Parse Tracks element to extract subtitle track metadata
   */
  parseTracksElement(view, start, end) {
    const tracks = [];
    let offset = start;

    while (offset < end - 8) {
      try {
        const { elementID, size } = this.readElement(view, offset);
        if (!elementID) break;

        const headerSize = this.getElementHeaderSize(elementID, size);

        // TrackEntry element (ID: 0xAE)
        if (elementID === 0xAE) {
          const track = this.parseTrackEntry(view, offset + headerSize, offset + headerSize + size);
          
          // Only collect subtitle tracks (TrackType = 17 = 0x11)
          if (track && track.type === 17 && track.codecID && track.codecID.includes('TEXT')) {
            tracks.push(track);
          }
        }

        offset += headerSize + size;
      } catch (e) {
        console.warn('[MKVExtractor] TrackEntry parse error:', e.message);
        break;
      }
    }

    return tracks;
  },

  /**
   * Parse individual TrackEntry element
   */
  parseTrackEntry(view, start, end) {
    const track = {
      number: 1,
      name: 'Subtitle',
      type: 0,
      codecID: '',
      language: 'eng'
    };

    let offset = start;

    while (offset < end - 4) {
      try {
        const { elementID, size } = this.readElement(view, offset);
        if (!elementID) break;

        const headerSize = this.getElementHeaderSize(elementID, size);
        const dataStart = offset + headerSize;

        // TrackNumber (ID: 0xD7)
        if (elementID === 0xD7) {
          track.number = this.readUnsignedInt(view, dataStart, size);
        }
        // TrackType (ID: 0x83)
        else if (elementID === 0x83) {
          track.type = this.readUnsignedInt(view, dataStart, size);
        }
        // CodecID (ID: 0x86)
        else if (elementID === 0x86) {
          track.codecID = this.readString(view, dataStart, size);
        }
        // Language (ID: 0x22B59C)
        else if (elementID === 0x22B59C) {
          track.language = this.readString(view, dataStart, size);
        }

        offset += headerSize + size;
      } catch (e) {
        console.warn('[MKVExtractor] TrackEntry field error:', e.message);
        break;
      }
    }

    return track;
  },

  /**
   * Extract subtitle cues from a track in MKV file
   */
  async extractCuesFromTrack(file, track) {
    try {
      const cues = [];
      
      // Read file in chunks (limit to 50MB to avoid memory issues)
      const chunkSize = 5 * 1024 * 1024; // 5MB chunks
      const maxSize = Math.min(file.size, 50 * 1024 * 1024); // Max 50MB
      
      let offset = 0;
      let clusterTimecode = 0;

      while (offset < maxSize) {
        const end = Math.min(offset + chunkSize, maxSize);
        const buffer = await file.slice(offset, end).arrayBuffer();
        const view = new DataView(buffer);

        let pos = 0;
        while (pos < view.byteLength - 8) {
          const { elementID, size } = this.readElement(view, pos);
          if (!elementID) break;

          const headerSize = this.getElementHeaderSize(elementID, size);

          // Cluster element (ID: 0x1F43B675)
          if (elementID === 0x1F43B675) {
            const clusterCues = this.extractCuesFromCluster(
              view, pos + headerSize, Math.min(pos + headerSize + size, view.byteLength),
              track.number, clusterTimecode
            );
            cues.push(...clusterCues);
            pos += headerSize + size;
          } else {
            pos += headerSize + size;
          }
        }

        offset = end;
      }

      return cues;
    } catch (error) {
      console.error('[MKVExtractor] Cue extraction error:', error);
      return [];
    }
  },

  /**
   * Extract subtitle cues from a single cluster
   */
  extractCuesFromCluster(view, start, end, targetTrack, baseTimecode) {
    const cues = [];
    let offset = start;
    let clusterTimecode = 0;

    while (offset < end - 4) {
      try {
        const { elementID, size } = this.readElement(view, offset);
        if (!elementID) break;

        const headerSize = this.getElementHeaderSize(elementID, size);

        // Timecode element (ID: 0xE7)
        if (elementID === 0xE7) {
          clusterTimecode = this.readSignedInt(view, offset + headerSize, size);
        }
        // SimpleBlock element (ID: 0xA3)
        else if (elementID === 0xA3) {
          const cue = this.parseSimpleBlock(
            view, offset + headerSize, size, targetTrack, clusterTimecode
          );
          if (cue) cues.push(cue);
        }

        offset += headerSize + size;
      } catch (e) {
        console.warn('[MKVExtractor] Cluster parse error:', e.message);
        break;
      }
    }

    return cues;
  },

  /**
   * Parse SimpleBlock to extract subtitle cue
   */
  parseSimpleBlock(view, start, size, targetTrack, clusterTimecode) {
    try {
      if (size < 5) return null;

      let pos = start;

      // Read track number (variable-length encoded)
      const { value: trackNum, size: trackSize } = this.readVarInt(view, pos);
      if (trackNum !== targetTrack) return null;

      pos += trackSize;

      // Read timestamp (signed 16-bit)
      if (pos + 2 > start + size) return null;
      const timestamp = view.getInt16(pos, false);
      pos += 2;

      // Skip flags byte
      if (pos >= start + size) return null;
      pos += 1;

      // Rest is subtitle text
      const textStart = pos;
      const textEnd = start + size;
      const textLength = textEnd - textStart;

      if (textLength <= 0) return null;

      const textBytes = new Uint8Array(view.buffer, textStart, textLength);
      const text = new TextDecoder('utf-8').decode(textBytes).trim();

      if (!text) return null;

      // Convert Matroska timecodes (milliseconds) to seconds
      const startTime = Math.max(0, (clusterTimecode + timestamp) / 1000);
      const endTime = startTime + 5; // Default 5-second duration

      return { start: startTime, end: endTime, text };
    } catch (e) {
      console.warn('[MKVExtractor] SimpleBlock parse error:', e.message);
      return null;
    }
  },

  /**
   * Read EBML element header
   */
  readElement(view, offset) {
    try {
      if (offset >= view.byteLength - 1) return { elementID: 0, size: 0 };

      const { value: elementID, size: idSize } = this.readVarInt(view, offset);
      const { value: size, size: sizeSize } = this.readVarInt(view, offset + idSize);

      return { elementID, size, idSize, sizeSize };
    } catch (e) {
      return { elementID: 0, size: 0 };
    }
  },

  /**
   * Get total size of element header
   */
  getElementHeaderSize(elementID, size) {
    const idSize = this.getVarIntSize(elementID);
    const sizeSize = this.getVarIntSize(size);
    return idSize + sizeSize;
  },

  /**
   * Read variable-length integer (VarInt)
   */
  readVarInt(view, offset) {
    try {
      if (offset >= view.byteLength) return { value: 0, size: 0 };

      const byte = view.getUint8(offset);

      if ((byte & 0x80) !== 0) {
        return { value: byte & 0x7F, size: 1 };
      }
      if ((byte & 0x40) !== 0) {
        if (offset + 1 >= view.byteLength) return { value: 0, size: 0 };
        return { value: view.getUint16(offset, false) & 0x3FFF, size: 2 };
      }
      if ((byte & 0x20) !== 0) {
        if (offset + 2 >= view.byteLength) return { value: 0, size: 0 };
        return { value: ((byte & 0x1F) << 16) | view.getUint16(offset + 1, false), size: 3 };
      }
      if ((byte & 0x10) !== 0) {
        if (offset + 3 >= view.byteLength) return { value: 0, size: 0 };
        return { value: view.getUint32(offset, false) & 0x0FFFFFFF, size: 4 };
      }

      return { value: 0, size: 0 };
    } catch (e) {
      return { value: 0, size: 0 };
    }
  },

  /**
   * Get VarInt size
   */
  getVarIntSize(value) {
    if (value < 128) return 1;
    if (value < 16384) return 2;
    if (value < 2097152) return 3;
    return 4;
  },

  /**
   * Read unsigned integer
   */
  readUnsignedInt(view, offset, size) {
    if (size === 1) return view.getUint8(offset);
    if (size === 2) return view.getUint16(offset, false);
    if (size === 4) return view.getUint32(offset, false);
    if (size === 8) return Number(view.getBigUint64(offset, false));
    return 0;
  },

  /**
   * Read signed integer
   */
  readSignedInt(view, offset, size) {
    if (size === 1) return view.getInt8(offset);
    if (size === 2) return view.getInt16(offset, false);
    if (size === 4) return view.getInt32(offset, false);
    if (size === 8) return Number(view.getBigInt64(offset, false));
    return 0;
  },

  /**
   * Read UTF-8 string
   */
  readString(view, offset, size) {
    try {
      const bytes = new Uint8Array(view.buffer, offset, size);
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      return '';
    }
  }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  if (typeof MKVSubtitleExtractor !== 'undefined') {
    MKVSubtitleExtractor.init().catch(e => 
      console.warn('[MKVExtractor] Init warning:', e.message)
    );
  }
});
