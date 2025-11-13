require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db');
const classesRouter = require('./routes/classes');
const { router: settingsRouter } = require('./routes/settings');

initializeDatabase();

const app = express();

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 📁 Uploads folder path
const uploadsPath = path.join(__dirname, '..', 'uploads');

// ✅ Enable CORS preflight for uploads
app.options('/uploads/*', cors());

// ✅ Serve uploads with all correct headers
app.use(
  '/uploads',
  cors(), // Allow cross-origin requests for uploads
  express.static(uploadsPath, {
    setHeaders(res, filePath) {
      // Force correct MIME type for .mp4 files
      if (filePath.endsWith('.mp4')) {
        res.type('video/mp4');
      }

      // Cross-origin + streaming headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Accept-Ranges', 'bytes'); // Needed for video seeking
    },
  }),
);

// ✅ Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ✅ API routes
app.use('/api/classes', classesRouter);
app.use('/api/settings', settingsRouter);

// ✅ Start server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});

module.exports = app;
