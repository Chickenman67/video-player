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
 * POST /api/extract-subtitles
 * Extracts subtitle streams from uploaded video file
 */
router.post('/extract-subtitles', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const videoPath = req.file.path;
    const fileName = req.file.originalname;
    console.log(`[Subtitles] Extracting from: ${fileName}`);

    // Extract subtitles
    const subtitles = await extractSubtitles(videoPath);

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
    console.error('[Subtitles] Error:', error);
    
    // Cleanup on error
    if (req.file) {
      fs.unlink(req.file.path, () => {});
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
    // Get video information first
    ffmpeg.ffprobe(videoPath, async (err, metadata) => {
      if (err) {
        return reject(new Error('Failed to read video file: ' + err.message));
      }

      try {
        // Find all subtitle streams
        const subtitleStreams = metadata.streams.filter(
          (stream) => stream.codec_type === 'subtitle'
        );

        if (subtitleStreams.length === 0) {
          console.log('[Subtitles] No subtitle streams found');
          return resolve([]);
        }

        console.log(`[Subtitles] Found ${subtitleStreams.length} subtitle stream(s)`);

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
        reject(error);
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

    ffmpeg(videoPath)
      .outputOptions(`-map 0:${streamIndex}`)
      .output(outputPath)
      .on('end', () => {
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
        console.error(`[Subtitles] Extraction error for stream ${streamIndex}:`, err.message);
        resolve(null);
      })
      .run();
  });
}

module.exports = router;
