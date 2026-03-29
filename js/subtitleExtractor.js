/**
 * Subtitle Parser - Lightweight Fallback
 * Parses .srt/.vtt files for fallback subtitle support
 * Primary MKV subtitle extraction is handled by mkv-subtitles.js
 */

const SubtitleExtractor = {
  /**
   * Parse SRT/VTT subtitle content and create text track
   * @param {string} content - Raw subtitle file content
   * @param {HTMLVideoElement} videoElement - Video to attach subtitles to
   * @param {string} label - Label for the track
   * @returns {TextTrack|null} - Created text track or null on error
   */
  parseAndCreateTrack(content, videoElement, label = 'Subtitles') {
    try {
      if (!content || !videoElement) return null;

      // Detect if SRT or VTT format
      const isSRT = content.includes('-->') && !content.includes('WEBVTT');
      
      // Parse cues
      const cues = isSRT ? this.parseSRT(content) : this.parseVTT(content);
      
      if (!cues || cues.length === 0) {
        console.warn('No subtitle cues found');
        return null;
      }

      // Create text track
      const textTrack = videoElement.addTextTrack('captions', label, 'en');
      
      // Add cues to track
      cues.forEach(cue => {
        try {
          textTrack.addCue(cue);
        } catch (e) {
          console.error('Failed to add cue:', e);
        }
      });

      textTrack.mode = 'showing';
      console.log(`✓ Loaded ${cues.length} subtitle cues`);
      return textTrack;
    } catch (error) {
      console.error('Subtitle parsing error:', error);
      return null;
    }
  },

  /**
   * Parse SRT format (00:00:00,000 --> 00:00:05,000)
   * @param {string} content - SRT file content
   * @returns {VTTCue[]} - Array of VTTCue objects
   */
  parseSRT(content) {
    const cues = [];
    const blocks = content.split(/\r?\n\r?\n/).filter(block => block.trim());

    blocks.forEach(block => {
      const lines = block.trim().split(/\r?\n/);
      if (lines.length < 3) return;

      // Line format: 00:00:00,000 --> 00:00:05,000
      const timeLine = lines[1];
      const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());

      const startTime = this.timeStringToSeconds(startStr);
      const endTime = this.timeStringToSeconds(endStr);

      if (startTime === null || endTime === null) return;

      // Collect remaining lines as subtitle text
      const text = lines.slice(2).join('\n');

      try {
        cues.push(new VTTCue(startTime, endTime, text.trim()));
      } catch (e) {
        console.warn('Failed to create cue:', e);
      }
    });

    return cues;
  },

  /**
   * Parse VTT format (00:00:00.000 --> 00:00:05.000)
   * @param {string} content - VTT file content
   * @returns {VTTCue[]} - Array of VTTCue objects
   */
  parseVTT(content) {
    const cues = [];
    const lines = content.split(/\r?\n/);
    
    let i = 0;
    // Skip WEBVTT header
    while (i < lines.length && !lines[i].includes('-->')) i++;

    while (i < lines.length) {
      // Find time line
      if (!lines[i].includes('-->')) {
        i++;
        continue;
      }

      const timeLine = lines[i];
      const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());

      const startTime = this.timeStringToSeconds(startStr);
      const endTime = this.timeStringToSeconds(endStr);

      if (startTime === null || endTime === null) {
        i++;
        continue;
      }

      // Collect subtitle text
      const textLines = [];
      i++;
      while (i < lines.length && lines[i].trim() && !lines[i].includes('-->')) {
        textLines.push(lines[i].trim());
        i++;
      }

      if (textLines.length > 0) {
        try {
          cues.push(new VTTCue(startTime, endTime, textLines.join('\n')));
        } catch (e) {
          console.warn('Failed to create cue:', e);
        }
      }
    }

    return cues;
  },

  /**
   * Convert time string to seconds
   * Handles both SRT (HH:MM:SS,ms) and VTT (HH:MM:SS.ms) formats
   * @param {string} timeStr - Time string
   * @returns {number|null} - Time in seconds or null if invalid
   */
  timeStringToSeconds(timeStr) {
    const timeStr_normalized = timeStr.replace(',', '.');
    const parts = timeStr_normalized.split(':');

    if (parts.length !== 3) return null;

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const secondsWithMs = parseFloat(parts[2]);

    if (isNaN(hours) || isNaN(minutes) || isNaN(secondsWithMs)) {
      return null;
    }

    return hours * 3600 + minutes * 60 + secondsWithMs;
  },

  /**
   * Handle subtitle file load (called from player.js)
   * @param {File} file - Subtitle file
   * @param {HTMLVideoElement} videoElement - Video element
   */
  loadSubtitleFile(file, videoElement) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const content = e.target.result;
          const track = this.parseAndCreateTrack(content, videoElement, file.name);
          if (track) {
            resolve(track);
          } else {
            reject(new Error('Failed to parse subtitle file'));
          }
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read subtitle file'));
      };

      reader.readAsText(file);
    });
  }
};
