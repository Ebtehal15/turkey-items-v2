require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db');
const classesRouter = require('./routes/classes');
const { router: settingsRouter } = require('./routes/settings');

// 🔹 Veritabanını başlat
initializeDatabase();

const app = express();

// 🔹 Genel Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 📁 Uploads klasör yolu
const uploadsPath = path.resolve(__dirname, '..', 'uploads');

// ✅ Upload dosyalarını doğru header’larla servis et
app.use(
  '/uploads',
  cors(), // Cross-origin izin
  express.static(uploadsPath, {
    setHeaders(res, filePath) {
      // Doğru MIME tipi ayarla
      if (filePath.endsWith('.mp4')) {
        res.type('video/mp4');
      }

      // Cross-origin ve streaming izinleri
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Accept-Ranges', 'bytes'); // Video seek işlemi
    },
  })
);

// ✅ Health check endpoint (Render için önemli)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ✅ API rotaları
app.use('/api/classes', classesRouter);
app.use('/api/settings', settingsRouter);

// ✅ Sunucuyu başlat
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});

module.exports = app;
