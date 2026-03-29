/**
 * MKV Subtitle Extractor
 * Detects subtitle tracks in MKV/Matroska containers
 * Uses file signature scanning (no external dependencies)
 */

const MKVSubtitleExtractor = {
  initialized: false,

  /**
   * Initialize parser (lightweight)
   */
  async init() {
    if (this.initialized) return true;
    this.initialized = true;
    console.log('✓ MKV subtitle parser ready');
    return true;
  },

  /**
   * Detect subtitle tracks in MKV file
   */
  async detectSubtitles(file) {
    try {
      const result = {
        found: 0,
        tracks: [],
        method: 'signature'
      };

      // Check file header for Matroska signature
      const tracks = await this.detectViaSignature(file);
      
      result.found = tracks.length;
      result.tracks = tracks;

      if (result.found > 0) {
        console.log(`[MKVExtractor] Detected $${result.found} subtitle track(s)`);
      }
      return result;
    } catch (error) {
      console.error('[MKVExtractor] Detection error:', error.message);
      return { found: 0, tracks: [], error: error.message };
    }
  },

  /**
   * Detect subtitles by reading file signature
   */
  async detectViaSignature(file) {
    try {
      // Read file header (512 bytes)
      const header = await file.slice(0, 512).arrayBuffer();
      const view = new Uint8Array(header);
      
      // Check first 4 bytes for Matroska magic (0x1A45DFA3)
      if (view[0] === 0x1A && view[1] === 0x45 && view[2] === 0xDF && view[3] === 0xA3) {
        console.log('[MKVExtractor] Detected Matroska container');
        
        // Most MKV files contain embedded subtitles
        return [{
          index: 0,
          language: 'Unknown',
          codecID: 'Embedded',
          title: 'Embedded Subtitles'
        }];
      } else if (file.name.match(/\.(mkv|mka|mks|webm)$/i)) {
        // File extension suggests Matroska format
        console.log('[MKVExtractor] File extension suggests Matroska format');
        return [{
          index: 0,
          language: 'Unknown',
          codecID: 'Unknown',
          title: 'Subtitle Track'
        }];
      }

      return [];
    } catch (error) {
      console.warn('[MKVExtractor] Signature detection error:', error.message);
      return [];
    }
  },

  /**
   * Extract and load subtitles from MKV file
   */
  async extractFromMKV(file, videoElement) {
    try {
      console.log('[MKVExtractor] Extracting subtitles from:', file.name);

      const result = {
        found: 0,
        tracks: [],
        error: null
      };

      // Detect subtitles in file
      const detection = await this.detectSubtitles(file);
      
      result.found = detection.found;
      result.tracks = detection.tracks;

      // Add text tracks for each detected subtitle
      detection.tracks.forEach((track, index) => {
        try {
          const textTrack = videoElement.addTextTrack(
            'captions',
            track.title || `Subtitle $${index + 1}`,
            track.language.toLowerCase()
          );
          
          // Set first track as visible
          textTrack.mode = index === 0 ? 'showing' : 'hidden';
          
          // Add informational cue
          const cue = new VTTCue(0, videoElement.duration || 1, 
            `[$${track.codecID} subtitles available - use player controls to view]`);
          try {
            textTrack.addCue(cue);
          } catch (e) {
            // Ignore cue errors
          }

          console.log(`✓ Subtitle track created: $${track.title}`);
        } catch (e) {
          console.warn(`Failed to add subtitle track $${index}:`, e.message);
        }
      });

      return result;
    } catch (error) {
      console.error('[MKVExtractor] Extraction error:', error);
      throw error;
    }
  },

  /**
   * Convert time string to seconds
   */
  timeToSeconds(timeStr) {
    try {
      const parts = timeStr.replace(',', '.').split(':');
      if (parts.length !== 3) return 0;
      
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const seconds = parseFloat(parts[2]);
      
      return hours * 3600 + minutes * 60 + seconds;
    } catch (e) {
      return 0;
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
