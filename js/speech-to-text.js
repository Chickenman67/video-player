/**
 * Web Speech API Integration for Real-Time Subtitle Generation
 * Transcribes video audio to generate live subtitles
 */

const SpeechToText = {
  recognition: null,
  isListening: false,
  transcript: '',
  interimTranscript: '',
  subtitleCues: [],
  startTime: 0,
  videoElement: null,
  textTrack: null,
  lastCueTime: 0,

  /**
   * Initialize Speech Recognition
   */
  init(videoElement) {
    try {
      // Check browser support
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        console.warn('[SpeechToText] Web Speech API not supported in this browser');
        return false;
      }

      this.recognition = new SpeechRecognition();
      this.videoElement = videoElement;

      // Configure recognition
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      // Event handlers
      this.recognition.onstart = () => this.onStart();
      this.recognition.onresult = (event) => this.onResult(event);
      this.recognition.onerror = (event) => this.onError(event);
      this.recognition.onend = () => this.onEnd();

      console.log('✓ Web Speech API initialized');
      return true;
    } catch (error) {
      console.error('[SpeechToText] Init error:', error);
      return false;
    }
  },

  /**
   * Start transcription
   */
  start(videoElement) {
    try {
      if (!this.recognition) {
        this.init(videoElement);
      }

      if (!this.recognition) {
        console.error('[SpeechToText] Speech Recognition not available');
        return false;
      }

      // Create subtitle track
      if (!this.textTrack) {
        this.textTrack = videoElement.addTextTrack('captions', 'Live Subtitles', 'en');
        this.textTrack.mode = 'showing';
      }

      this.videoElement = videoElement;
      this.startTime = videoElement.currentTime;
      this.transcript = '';
      this.interimTranscript = '';
      this.lastCueTime = 0;

      // Start listening
      this.recognition.start();
      this.isListening = true;

      console.log('[SpeechToText] Transcription started');
      return true;
    } catch (error) {
      console.error('[SpeechToText] Start error:', error);
      return false;
    }
  },

  /**
   * Stop transcription
   */
  stop() {
    try {
      if (this.recognition && this.isListening) {
        this.recognition.stop();
        this.isListening = false;
        console.log('[SpeechToText] Transcription stopped');

        // Finalize last interim cue
        if (this.interimTranscript.trim()) {
          this.addSubtitleCue(this.lastCueTime, this.videoElement.currentTime, this.interimTranscript);
        }
      }
      return true;
    } catch (error) {
      console.error('[SpeechToText] Stop error:', error);
      return false;
    }
  },

  /**
   * Handle recognition start
   */
  onStart() {
    console.log('[SpeechToText] Listening...');
  },

  /**
   * Handle recognition results
   */
  onResult(event) {
    try {
      let interimText = '';

      // Process all results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          // Final result - add to official transcript
          this.transcript += transcript + ' ';
          console.log(`[SpeechToText] Final: "${transcript}"`);

          // Create subtitle cue for final result
          this.addSubtitleCue(
            this.lastCueTime,
            this.videoElement.currentTime + 3,
            transcript
          );

          this.lastCueTime = this.videoElement.currentTime + 3;
        } else {
          // Interim result - show in real-time but don't save yet
          interimText += transcript;
        }
      }

      // Update interim transcript display
      if (interimText !== this.interimTranscript) {
        this.interimTranscript = interimText;
        console.log(`[SpeechToText] Interim: "${interimText}"`);

        // Show interim as a temporary cue
        if (this.textTrack && this.textTrack.cues.length > 0) {
          const lastCue = this.textTrack.cues[this.textTrack.cues.length - 1];
          if (lastCue && !lastCue.text.includes('[interim]')) {
            // Don't overwrite final cues, just show interim
          }
        }
      }
    } catch (error) {
      console.error('[SpeechToText] Result handling error:', error);
    }
  },

  /**
   * Handle recognition error
   */
  onError(event) {
    console.warn(`[SpeechToText] Error: ${event.error}`);

    // Auto-restart on network error
    if (event.error === 'network') {
      console.log('[SpeechToText] Network error, retrying...');
      setTimeout(() => {
        if (this.isListening) {
          this.recognition.start();
        }
      }, 1000);
    }
  },

  /**
   * Handle recognition end
   */
  onEnd() {
    console.log('[SpeechToText] Recognition ended');

    // Auto-restart if still listening
    if (this.isListening && this.videoElement && !this.videoElement.paused) {
      console.log('[SpeechToText] Video still playing, restarting...');
      setTimeout(() => {
        this.recognition.start();
      }, 100);
    }
  },

  /**
   * Add subtitle cue to video
   */
  addSubtitleCue(startTime, endTime, text) {
    try {
      if (!this.textTrack) return;

      // Clean up text
      const cleanText = text.trim();
      if (!cleanText) return;

      // Create and add cue
      const cue = new VTTCue(startTime, endTime, cleanText);
      this.textTrack.addCue(cue);

      console.log(`[SpeechToText] Added cue: ${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s: "${cleanText}"`);
    } catch (error) {
      console.warn('[SpeechToText] Failed to add cue:', error.message);
    }
  },

  /**
   * Clear all transcript cues
   */
  clear() {
    try {
      if (this.textTrack) {
        // Remove all cues
        while (this.textTrack.cues.length > 0) {
          this.textTrack.removeCue(this.textTrack.cues[0]);
        }
      }

      this.transcript = '';
      this.interimTranscript = '';
      this.subtitleCues = [];
      console.log('[SpeechToText] Cleared subtitles');
    } catch (error) {
      console.error('[SpeechToText] Clear error:', error);
    }
  },

  /**
   * Get transcription status
   */
  isSupported() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    return !!SpeechRecognition;
  },

  /**
   * Get current transcript
   */
  getTranscript() {
    return this.transcript.trim();
  },

  /**
   * Set language
   */
  setLanguage(lang) {
    if (this.recognition) {
      this.recognition.lang = lang;
      console.log(`[SpeechToText] Language set to: ${lang}`);
    }
  }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  if (typeof SpeechToText !== 'undefined') {
    const supported = SpeechToText.isSupported();
    console.log(`[SpeechToText] Web Speech API supported: ${supported}`);
  }
});
