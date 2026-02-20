require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db');
const classesRouter = require('./routes/classes');
const { router: settingsRouter } = require('./routes/settings');
const cartRouter = require('./routes/cart');
const ordersRouter = require('./routes/orders');

// 🔹 Veritabanını başlat
initializeDatabase();

const app = express();

// 🔹 Genel Middleware
// CORS yapılandırması - dış IP erişimi için esnek
const corsOptions = {
  origin: function (origin, callback) {
    // Geliştirme ortamında (NODE_ENV production değilse) veya CORS_ALLOW_ALL=true ise tüm origin'lere izin ver
    // Bu sayede dış IP'lerden erişim mümkün olur
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const allowAll = process.env.CORS_ALLOW_ALL === 'true';
    
    if (isDevelopment || allowAll) {
      // Development'ta veya açıkça izin verilmişse tüm origin'lere izin ver
      callback(null, true);
    } else {
      // Production'da sadece belirtilen origin'lere izin ver
      const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'https://cillii-1.onrender.com',
        ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [])
      ];
      // Origin yoksa (örneğin same-origin request) veya izin verilen listede varsa kabul et
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn('⚠️ CORS blocked origin:', origin);
        callback(new Error('CORS policy violation'));
      }
    }
  },
  credentials: true, // Session cookie'leri için kritik
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔹 Session Middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'cillii-super-secret-key-2024',
  resave: false, // Session'ı sadece değiştiğinde kaydet
  saveUninitialized: true, // Boş session'ları da kaydet
  rolling: false, // Cookie süresini sabit tut
  name: 'connect.sid', // Standart session name
  cookie: {
    secure: false, // Önce false deneyelim
    httpOnly: false, // JavaScript erişimi için false
    maxAge: 24 * 60 * 60 * 1000, // 24 saat
    sameSite: 'lax', // Daha uyumlu seçenek
    domain: undefined, // Auto-detect domain
    path: '/', // Tüm path'lerde geçerli
  },
}));

// 🔍 Session Debug Middleware
app.use((req, res, next) => {
  console.log('🔍 Session Debug:', {
    sessionID: req.sessionID,
    hasSession: !!req.session,
    cartExists: !!req.session?.cart,
    cartLength: req.session?.cart?.length || 0,
    userAgent: req.get('User-Agent')?.substring(0, 50),
    origin: req.get('Origin'),
    cookie: req.get('Cookie')?.substring(0, 100)
  });
  next();
});

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
app.use('/api/orders', ordersRouter);

// ✅ Sunucuyu başlat
const port = process.env.PORT || 4000;
const host = process.env.HOST || '0.0.0.0'; // Tüm ağ arayüzlerinde dinle
app.listen(port, host, () => {
  console.log(`🚀 Server running on http://${host}:${port}`);
  console.log(`🌐 Accessible from external IPs on port ${port}`);
});

module.exports = app;
