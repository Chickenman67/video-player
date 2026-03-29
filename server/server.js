const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files (index.html, css, js)
app.use(express.static(path.join(__dirname, '../')));

// Import routes
let subtitleRoutes;
try {
  subtitleRoutes = require('./routes/subtitles');
  console.log('[Server] Subtitle routes loaded successfully');
} catch (err) {
  console.error('[Server] Failed to load subtitle routes:', err.message);
  subtitleRoutes = require('express').Router();
}

// API Routes
app.use('/api', subtitleRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback to index.html for SPA (Single Page Application)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Server error' : err.message
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV}`);
  console.log(`[Server] Listening on all interfaces (0.0.0.0:${PORT})`);
});

// Handle server errors
server.on('error', (err) => {
  console.error('[Server] Server error:', err);
  process.exit(1);
});

// Handle process errors
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled rejection at:', promise, 'reason:', reason);
});
