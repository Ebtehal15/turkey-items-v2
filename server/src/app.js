require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db');
const classesRouter = require('./routes/classes');
const { router: settingsRouter } = require('./routes/settings');

// 🔹 Veritabanı başlat
initializeDatabase();

const app = express();

// 🔹 Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 📁 Uploads klasörü yolu (her koşulda doğru yolu bulur)
const uploadsPath = path.resolve(__dirname, 'uploads');

// ✅ CORS preflight isteklerini etkinleştir
app.options('/uploads/*', cors());

// ✅ Upload dosyalarını doğru header’larla servis et
app.use(
  '/uploads',
  cors(),
  express.static(uploadsPath, {
    setHeaders(res, filePath) {
      // Doğru MIME tipi ayarla (özellikle videolar için)
      if (filePath.endsWith('.mp4')) {
        res.type('video/mp4');
      }

      // Cross-origin + video streaming header’ları
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Accept-Ranges', 'bytes'); // Video seek işlemi için
    },
  }),
);

// ✅ Health check endpoint
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
