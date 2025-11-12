require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db');
const classesRouter = require('./routes/classes');
const { router: settingsRouter } = require('./routes/settings');

initializeDatabase();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 📁 Uploads klasör yolu
const uploadsPath = path.join(__dirname, '..', 'uploads');

// ✅ Uploads rotası CORS ve güvenlik başlıklarıyla birlikte
app.use(
  '/uploads',
  express.static(uploadsPath, {
    setHeaders(res) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    },
  }),
);

// ✅ Sağlık kontrolü (test endpoint)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ✅ API rotaları
app.use('/api/classes', classesRouter);
app.use('/api/settings', settingsRouter);

// ✅ Sunucu başlatma
const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

module.exports = app;

