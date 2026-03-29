/* ==========================================================================
   Subtitle Extractor Module - Backend API Integration
   Sends videos to backend server for FFmpeg subtitle extraction
   ========================================================================== */

const SubtitleExtractor = {
  // API endpoint - changes based on environment
  API_URL: (() => {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isDev ? 'http://localhost:3000' : 'https://video-player-production-dc18.up.railway.app';
  })(),

  isProcessing: false,

  /**
   * Extract subtitle streams from video file via backend
   * @param {File} videoFile - The video file
   * @returns {Promise<Array>} Array of subtitle objects
   */
  async extractSubtitles(videoFile) {
    if (this.isProcessing) {
      console.log('[SubtitleExtractor] Already processing, skipping duplicate request');
      return [];
    }

    this.isProcessing = true;
    console.log('[SubtitleExtractor] Sending to backend:', videoFile.name);

    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', videoFile);

      // Call backend API
      const response = await fetch(`${this.API_URL}/api/extract-subtitles`, {
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type header - browser will set it with boundary
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to extract subtitles');
      }

      console.log('[SubtitleExtractor] Received', result.subtitles.length, 'subtitle stream(s)');

      this.isProcessing = false;
      return result.subtitles || [];
    } catch (error) {
      console.error('[SubtitleExtractor] Error:', error.message);
      this.isProcessing = false;
      return [];
    }
  },

  /**
   * Create HTML5 text track from extracted subtitle content
   */
  createTextTrack(videoElement, subtitleContent, label, language) {
    try {
      const track = videoElement.addTextTrack('subtitles', label, language);

      // Parse subtitle content based on format (SRT, ASS, WebVTT)
      const cues = this.parseSubtitles(subtitleContent);

      // Add cues to track
      cues.forEach((cue) => {
        track.addCue(cue);
      });

      console.log('[SubtitleExtractor] Created text track:', label, '(' + cues.length + ' cues)');
      return track;
    } catch (err) {
      console.error('[SubtitleExtractor] Error creating text track:', err);
      return null;
    }
  },

  /**
   * Parse subtitle formats (SRT, WebVTT, basic ASS)
   */
  parseSubtitles(content) {
    const cues = [];

    // Simple SRT/WebVTT parser
    const lines = content.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      // Skip empty lines and non-timing lines
      if (!line || !line.includes('-->')) {
        i++;
        continue;
      }

      try {
        // Parse timing: "00:00:01,000 --> 00:00:05,000"
        const parts = line.split('-->');
        const startStr = parts[0].trim();
        const endStr = parts[1].trim().split(/\s/)[0]; // Handle extra info after end time

        const startTime = this.timeStringToSeconds(startStr);
        const endTime = this.timeStringToSeconds(endStr);

        // Get text (next lines until empty line)
        const textLines = [];
        i++;
        while (i < lines.length && lines[i].trim()) {
          textLines.push(lines[i].trim());
          i++;
        }

        if (textLines.length > 0) {
          const text = textLines.join('\n');
          const cue = new VTTCue(startTime, endTime, text);
          cues.push(cue);
        }
      } catch (err) {
        console.warn('[SubtitleExtractor] Error parsing cue:', err);
      }

      i++;
    }

    return cues;
  },

  /**
   * Convert time string (HH:MM:SS,MMM or HH:MM:SS.MMM) to seconds
   */
  timeStringToSeconds(timeStr) {
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const secondsParts = parts[2].split(/[,\.]/);
    const seconds = parseInt(secondsParts[0], 10);
    const milliseconds = parseInt((secondsParts[1] || '0').padEnd(3, '0'), 10);

    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  }
};
