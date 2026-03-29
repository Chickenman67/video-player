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
const subtitleRoutes = require('./routes/subtitles');

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
app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV}`);
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Server] Local: http://localhost:${PORT}`);
  }
});
