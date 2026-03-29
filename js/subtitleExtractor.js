/* ==========================================================================
   Subtitle Extractor Module
   Extracts embedded subtitles from video containers using FFmpeg.wasm
   ========================================================================== */

const SubtitleExtractor = {
  // FFmpeg instance
  ffmpeg: null,
  FFmpegUtil: null,

  // State
  isLoading: false,
  isReady: false,
  extractedSubtitles: {},

  /**
   * Initialize FFmpeg library (lazy load)
   */
  async init() {
    if (this.isReady || this.isLoading) return;
    
    this.isLoading = true;
    console.log('[SubtitleExtractor] Initializing FFmpeg.wasm...');

    try {
      // Load FFmpeg from CDN (v0.12.10)
      // Wait for global FFmpeg to be available
      if (typeof FFmpeg === 'undefined') {
        // Dynamically inject FFmpeg script
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      
      // Access FFmpeg from global scope
      const { FFmpeg, fetchFile } = FFmpeg;
      
      this.FFmpegUtil = { fetchFile };
      this.ffmpeg = new FFmpeg();
      
      // Load WASM files from CDN
      await this.ffmpeg.load({
        coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js',
        wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm',
      });
      
      this.isReady = true;
      this.isLoading = false;
      console.log('[SubtitleExtractor] FFmpeg.wasm loaded and ready');
      return true;
    } catch (err) {
      this.isLoading = false;
      console.error('[SubtitleExtractor] Failed to load FFmpeg:', err);
      return false;
    }
  },

  /**
   * Extract subtitle streams from video file
   * @param {File} videoFile - The video file
   * @returns {Promise<Array>} Array of subtitle objects
   */
  async extractSubtitles(videoFile) {
    if (!this.isReady) {
      const loaded = await this.init();
      if (!loaded) {
        console.warn('[SubtitleExtractor] FFmpeg not available, falling back to HTML5 TextTracks');
        return [];
      }
    }

    const fileName = videoFile.name;
    console.log('[SubtitleExtractor] Extracting subtitles from:', fileName);

    try {
      // Write input file to FFmpeg filesystem
      await this.ffmpeg.writeFile(fileName, await this.FFmpegUtil.fetchFile(videoFile));
      console.log('[SubtitleExtractor] Video file written to FFmpeg filesystem');

      // Get stream information
      let output = '';
      this.ffmpeg.on('log', ({ message }) => {
        output += message + '\n';
      });

      // Run FFmpeg to get codec info
      await this.ffmpeg.exec(['-i', fileName]);
      
      // Parse subtitle streams from output
      const subtitles = this.parseSubtitleStreams(output, fileName);
      
      // Extract each subtitle stream
      const extractedSubs = [];
      for (let i = 0; i < subtitles.length; i++) {
        const sub = subtitles[i];
        const outFile = `subtitle_${i}.${sub.format}`;
        
        console.log(`[SubtitleExtractor] Extracting subtitle stream ${sub.index}...`);
        
        try {
          // Extract subtitle stream
          await this.ffmpeg.exec([
            '-i', fileName,
            '-map', `0:${sub.index}`,
            '-y',
            outFile
          ]);

          // Read the extracted file
          const data = await this.ffmpeg.readFile(outFile);
          
          // Convert to VTT if needed
          let vttContent = this.convertToVTT(data, sub.format, sub.codec);
          
          extractedSubs.push({
            index: sub.index,
            label: sub.title || sub.language || `Subtitle ${i + 1}`,
            language: sub.language || 'unknown',
            codec: sub.codec,
            format: sub.format,
            content: vttContent
          });

          // Cleanup
          this.ffmpeg.deleteFile(outFile);
          console.log(`[SubtitleExtractor] Successfully extracted subtitle ${i}`);
        } catch (err) {
          console.warn(`[SubtitleExtractor] Failed to extract subtitle ${i}:`, err.message);
        }
      }

      // Cleanup input file
      this.ffmpeg.deleteFile(fileName);
      
      console.log('[SubtitleExtractor] Extraction complete, found', extractedSubs.length, 'subtitle streams');
      return extractedSubs;

    } catch (err) {
      console.error('[SubtitleExtractor] Extraction error:', err);
      return [];
    }
  },

  /**
   * Parse subtitle stream information from FFmpeg output
   * @returns {Array} Array of subtitle stream info
   */
  parseSubtitleStreams(output, fileName) {
    const subtitles = [];
    
    // Enhanced regex to capture subtitle streams
    const streamRegex = /Stream #0:(\d+).*?:\s*(.*?)\s*(?:\(.*?\))?\s*$/gm;
    const lines = output.split('\n');
    
    let inStreamSection = false;
    let streamIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect stream information section
      if (line.includes('Stream #')) {
        const match = line.match(/Stream #0:(\d+)[^:]*/);
        if (match) {
          streamIndex = parseInt(match[1]);
          
          // Check if this is a subtitle stream
          if (line.includes('Subtitle:') || 
              line.toLowerCase().includes('subtitle') ||
              line.includes('subrip') || 
              line.includes('ass') || 
              line.includes('ssa') ||
              line.includes('webvtt') ||
              line.includes('mov_text') ||
              line.includes('dvb_subtitle')) {
            
            // Extract codec info
            const codecMatch = line.match(/:\s*(\w+)/);
            const codec = codecMatch ? codecMatch[1] : 'unknown';
            
            // Extract language
            const langMatch = line.match(/\((\w+)\)/);
            const language = langMatch ? langMatch[1] : 'unknown';
            
            // Extract title/description
            const titleMatch = line.match(/title\s*:\s*([^(]+)/i);
            const title = titleMatch ? titleMatch[1].trim() : null;
            
            // Determine output format
            let format = this.getOutputFormat(codec);
            
            subtitles.push({
              index: streamIndex,
              codec: codec,
              language: language,
              title: title,
              format: format
            });
            
            console.log(`[SubtitleExtractor] Found subtitle: index=${streamIndex}, codec=${codec}, lang=${language}, format=${format}`);
          }
        }
      }
    }
    
    return subtitles;
  },

  /**
   * Get appropriate output format for subtitle codec
   */
  getOutputFormat(codec) {
    const codecLower = codec.toLowerCase();
    
    if (codecLower.includes('subrip') || codecLower.includes('srt')) return 'srt';
    if (codecLower.includes('ass') || codecLower.includes('ssa')) return 'ass';
    if (codecLower.includes('webvtt') || codecLower.includes('vtt')) return 'vtt';
    if (codecLower.includes('mov_text')) return 'vtt';
    if (codecLower.includes('dvb_subtitle') || codecLower.includes('hdmv_pgs_subtitle')) return 'ass';
    
    // Default to VTT as universal format
    return 'vtt';
  },

  /**
   * Convert subtitle data to VTT format
   */
  convertToVTT(data, sourceFormat, codec) {
    let text = '';
    
    try {
      // Convert Uint8Array to string
      const decoder = new TextDecoder('utf-8');
      text = decoder.decode(data);
    } catch (err) {
      console.warn('[SubtitleExtractor] Could not decode subtitle as UTF-8:', err);
      return '';
    }

    // Already in VTT format
    if (sourceFormat === 'vtt' || text.startsWith('WEBVTT')) {
      return text;
    }

    // Convert SRT to VTT
    if (sourceFormat === 'srt' || text.match(/^\d+\n\d{2}:\d{2}:\d{2},\d{3}/)) {
      return this.srtToVTT(text);
    }

    // Convert ASS/SSA to VTT
    if (sourceFormat === 'ass' || sourceFormat === 'ssa' || text.includes('[Script Info]')) {
      return this.assToVTT(text);
    }

    // If format unknown, try SRT first, then ASS
    if (text.match(/^\d+\n\d{2}:\d{2}:\d{2},\d{3}/)) {
      return this.srtToVTT(text);
    }

    if (text.includes('[Script Info]') || text.includes('Dialogue:')) {
      return this.assToVTT(text);
    }

    // Unknown format, return as-is with VTT header
    return 'WEBVTT\n\n' + text;
  },

  /**
   * Convert SRT subtitles to VTT
   */
  srtToVTT(srtText) {
    let vtt = 'WEBVTT\n\n';
    
    // Replace SRT timecode format (HH:MM:SS,mmm) with VTT format (HH:MM:SS.mmm)
    vtt += srtText
      .replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, '$1:$2:$3.$4')
      .replace(/^\d+\n/gm, ''); // Remove subtitle numbers
    
    return vtt;
  },

  /**
   * Convert ASS/SSA subtitles to VTT
   */
  assToVTT(assText) {
    let vtt = 'WEBVTT\n\n';
    
    const lines = assText.split('\n');
    let inEvents = false;
    
    for (let line of lines) {
      line = line.trim();
      
      // Find events section
      if (line === '[Events]' || line.startsWith('[Events')) {
        inEvents = true;
        continue;
      }
      
      if (inEvents && line.startsWith('Dialogue:')) {
        // Parse ASS dialogue line format:
        // Dialogue: Marked=0,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
        const parts = line.substring(9).split(',');
        
        if (parts.length >= 10) {
          const start = this.assTimeToVTT(parts[1]);
          const end = this.assTimeToVTT(parts[2]);
          const text = parts.slice(9).join(',').replace(/\\N/g, '\n').replace(/\\n/g, '\n');
          
          // Remove ASS formatting tags
          const cleanText = text.replace(/\{[^}]*\}/g, '');
          
          vtt += `${start} --> ${end}\n${cleanText}\n\n`;
        }
      }
    }
    
    return vtt;
  },

  /**
   * Convert ASS timestamp to VTT timestamp
   * ASS format: H:MM:SS.CC (centiseconds)
   * VTT format: HH:MM:SS.mmm (milliseconds)
   */
  assTimeToVTT(assTime) {
    const match = assTime.match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
    if (!match) return '00:00:00.000';
    
    const h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const s = parseInt(match[3]);
    const cs = parseInt(match[4]);
    
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs * 10).padStart(3, '0')}`;
  },

  /**
   * Create a text track from VTT content
   */
  createTextTrack(video, vttContent, label, language) {
    try {
      // Create a Blob from VTT content
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      const url = URL.createObjectURL(blob);
      
      // Create a track element
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = label || language || 'Subtitle';
      track.srclang = language || 'en';
      track.src = url;
      
      // Add to video element
      video.appendChild(track);
      
      console.log('[SubtitleExtractor] Created text track:', label, 'lang:', language);
      return track;
    } catch (err) {
      console.error('[SubtitleExtractor] Failed to create text track:', err);
      return null;
    }
  },

  /**
   * Clean up FFmpeg instance
   */
  destroy() {
    if (this.ffmpeg && this.ffmpeg.isLoaded()) {
      try {
        this.ffmpeg.exit();
        console.log('[SubtitleExtractor] FFmpeg cleaned up');
      } catch (err) {
        console.warn('[SubtitleExtractor] Error cleaning up FFmpeg:', err);
      }
    }
  }
};
