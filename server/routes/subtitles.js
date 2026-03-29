const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: path.join(__dirname, '../temp'),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 500 * 1024 * 1024 }, // 500MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['video/mp4', 'video/x-matroska', 'video/webm', 'video/quicktime'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files allowed (MP4, MKV, WebM, MOV)'));
    }
  }
});

// Ensure temp directory exists
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * GET /api/status
 * Check server and FFmpeg health
 */
router.get('/status', (req, res) => {
  try {
    // Try to probe ffmpeg availability
    const testPath = path.join(tempDir, 'test.txt');
    fs.writeFileSync(testPath, 'test');
    fs.unlinkSync(testPath);
    
    res.json({
      status: 'ok',
      ffmpeg: 'checking...',
      temp_dir: tempDir,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      error: err.message
    });
  }
});

/**
 * POST /api/extract-subtitles
 * Extracts subtitle streams from uploaded video file
 */
router.post('/extract-subtitles', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      console.log('[Subtitles] No file uploaded');
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const videoPath = req.file.path;
    const fileName = req.file.originalname;
    console.log(`[Subtitles] File received: ${fileName} (${req.file.size} bytes)`);
    console.log(`[Subtitles] File path: ${videoPath}`);

    // Extract subtitles
    const subtitles = await extractSubtitles(videoPath);

    console.log(`[Subtitles] Extraction complete: ${subtitles.length} subtitle stream(s)`);

    // Cleanup temp file
    fs.unlink(videoPath, (err) => {
      if (err) console.error('[Cleanup] Error removing temp file:', err);
    });

    res.json({
      success: true,
      filename: fileName,
      subtitles: subtitles
    });
  } catch (error) {
    console.error('[Subtitles] Error:', error.message);
    console.error('[Subtitles] Stack:', error.stack);
    
    // Cleanup on error
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('[Cleanup] Error on error cleanup:', err);
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to extract subtitles'
    });
  }
});

/**
 * Extract all subtitle streams from video using FFmpeg
 */
async function extractSubtitles(videoPath) {
  return new Promise((resolve, reject) => {
    // 20 second timeout for ffprobe
    const probeTimeout = setTimeout(() => {
      console.error('[Subtitles] FFprobe timeout - no response from ffmpeg');
      resolve([]); // Return empty array instead of error
    }, 20000);

    // Get video information first
    ffmpeg.ffprobe(videoPath, async (err, metadata) => {
      clearTimeout(probeTimeout);
      
      if (err) {
        console.error('[Subtitles] FFprobe error:', err.message);
        return resolve([]); // Graceful fallback
      }

      try {
        console.log('[Subtitles] Video streams found:', metadata.streams.length);
        
        // Find all subtitle streams
        const subtitleStreams = metadata.streams.filter(
          (stream) => stream.codec_type === 'subtitle'
        );

        console.log('[Subtitles] Subtitle streams found:', subtitleStreams.length);
        
        if (subtitleStreams.length === 0) {
          console.log('[Subtitles] No subtitle streams found in this video');
          return resolve([]);
        }

        console.log(`[Subtitles] Found ${subtitleStreams.length} subtitle stream(s)`);
        subtitleStreams.forEach((s, i) => {
          console.log(`[Subtitles] Stream ${i}: codec=${s.codec_name}, lang=${s.tags?.language || 'unknown'}`);
        });

        const extractedSubtitles = [];
        const tempDir = path.join(__dirname, '../temp');

        // Extract each subtitle stream
        for (let i = 0; i < subtitleStreams.length; i++) {
          const stream = subtitleStreams[i];
          const subtitle = await extractSingleSubtitle(videoPath, stream, i, tempDir);
          if (subtitle) {
            extractedSubtitles.push(subtitle);
          }
        }

        // Cleanup temp files after extraction
        setImmediate(() => {
          fs.readdir(tempDir, (err, files) => {
            if (!err) {
              files.forEach((file) => {
                if (file.startsWith('subtitle_')) {
                  fs.unlink(path.join(tempDir, file), () => {});
                }
              });
            }
          });
        });

        resolve(extractedSubtitles);
      } catch (error) {
        console.error('[Subtitles] Error processing video:', error);
        resolve([]); // Graceful fallback
      }
    });
  });
}

/**
 * Extract a single subtitle stream
 */
async function extractSingleSubtitle(videoPath, stream, index, tempDir) {
  return new Promise((resolve) => {
    const streamIndex = stream.index;
    const codec = stream.codec_name || 'unknown';
    const language = stream.tags?.language || stream.tags?.LANGUAGE || 'und';
    const title = stream.tags?.title || `Subtitle ${index + 1}`;

    // Map codec to output format
    let outputFormat = 'srt';
    if (codec === 'ass' || codec === 'ssa') outputFormat = 'ass';
    if (codec === 'webvtt') outputFormat = 'webvtt';

    const outputPath = path.join(tempDir, `subtitle_${index}.${outputFormat}`);

    console.log(
      `[Subtitles] Extracting stream ${streamIndex} (${codec}) -> ${outputFormat}`
    );

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      console.error(`[Subtitles] Extraction timeout for stream ${streamIndex}`);
      resolve(null);
    }, 30000); // 30 second timeout

    ffmpeg(videoPath)
      .outputOptions(`-map 0:${streamIndex}`)
      .output(outputPath)
      .on('end', () => {
        clearTimeout(timeout);
        if (timedOut) return;
        
        try {
          const content = fs.readFileSync(outputPath, 'utf-8');
          console.log(`[Subtitles] Extracted ${content.length} bytes from stream ${streamIndex}`);

          // Clean up the temp subtitle file
          fs.unlink(outputPath, () => {});

          resolve({
            index: index,
            streamIndex: streamIndex,
            label: title,
            language: language,
            codec: codec,
            format: outputFormat,
            content: content
          });
        } catch (err) {
          console.error(`[Subtitles] Error reading extracted subtitle:`, err);
          resolve(null);
        }
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        if (timedOut) return;
        
        console.error(`[Subtitles] Extraction error for stream ${streamIndex}:`, err.message);
        resolve(null);
      })
      .run();
  });
}

module.exports = router;
