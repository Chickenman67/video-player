#!/bin/bash
echo "[Bootstrap] Installing dependencies..."

# Update package manager
apt-get update -qq

# Install FFmpeg
echo "[Bootstrap] Installing FFmpeg..."
apt-get install -y -qq ffmpeg

# Verify installation
if command -v ffmpeg &> /dev/null; then
  echo "[Bootstrap] ✓ FFmpeg installed successfully"
  ffmpeg -version | head -1
else
  echo "[Bootstrap] ✗ FFmpeg installation failed"
  exit 1
fi

# Verify ffprobe
if command -v ffprobe &> /dev/null; then
  echo "[Bootstrap] ✓ FFprobe available"
else
  echo "[Bootstrap] ✗ FFprobe not found"
  exit 1
fi

echo "[Bootstrap] Setup complete - starting Node.js server..."

# Start the Node.js server
cd server
npm install
node server.js
