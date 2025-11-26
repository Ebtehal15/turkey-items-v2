require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db');
const classesRouter = require('./routes/classes');
const { router: settingsRouter } = require('./routes/settings');
const cartRouter = require('./routes/cart');

// 🔹 Veritabanını başlat
initializeDatabase();

const app = express();

// 🔹 Genel Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || ['http://localhost:5173', 'https://cillii-1.onrender.com'],
  credentials: true, // Session cookie'leri için gerekli
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔹 Session Middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS'de true olmalı
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 saat
    sameSite: 'lax',
  },
}));

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
app.use('/api/cart', cartRouter);

// ✅ Sunucuyu başlat
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});

module.exports = app;
