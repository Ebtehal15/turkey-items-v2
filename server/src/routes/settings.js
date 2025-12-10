const express = require('express');
const { db } = require('../db');

const router = express.Router();

const SETTINGS_KEY = 'column_visibility';

const DEFAULT_VISIBILITY = {
  specialId: true,
  mainCategory: true,
  quality: true,
  className: true,
  classNameArabic: false,
  classNameEnglish: false,
  classFeatures: true,
  classWeight: true,
  classQuantity: true,
  classPrice: true,
  classVideo: true,
};

const normalizeVisibility = (visibility = {}) => {
  const normalized = { ...DEFAULT_VISIBILITY };
  // Update values from the provided visibility object
  Object.keys(DEFAULT_VISIBILITY).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(visibility, key)) {
      normalized[key] = Boolean(visibility[key]);
    }
  });
  // Also preserve any additional keys from visibility that might be in the client's column list
  Object.keys(visibility).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_VISIBILITY, key)) {
      normalized[key] = Boolean(visibility[key]);
    }
  });
  if (!Object.values(normalized).some(Boolean)) {
    return { ...DEFAULT_VISIBILITY };
  }
  return normalized;
};

router.get('/columns', (_req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', [SETTINGS_KEY], (err, row) => {
    if (err) {
      res.status(500).json({ message: 'Failed to load column visibility', error: err.message });
      return;
    }
    if (!row) {
      res.json(DEFAULT_VISIBILITY);
      return;
    }
    try {
      const parsed = JSON.parse(row.value);
      res.json(normalizeVisibility(parsed));
    } catch {
      res.json(DEFAULT_VISIBILITY);
    }
  });
});

router.put('/columns', (req, res) => {
  const { columns } = req.body || {};
  if (!columns || typeof columns !== 'object') {
    res.status(400).json({ message: 'Invalid payload. Expected "columns" object.' });
    return;
  }

  const normalized = normalizeVisibility(columns);
  const value = JSON.stringify(normalized);

  db.run(
    `
      INSERT INTO settings(key, value)
      VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    [SETTINGS_KEY, value],
    (err) => {
      if (err) {
        res.status(500).json({ message: 'Failed to update column visibility', error: err.message });
        return;
      }
      res.json(normalized);
    },
  );
});

// Google Sheets URL ayarları
const GOOGLE_SHEETS_URL_KEY = 'google_sheets_url';
const GOOGLE_SHEETS_AUTO_SYNC_KEY = 'google_sheets_auto_sync';

router.get('/google-sheets', (_req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', [GOOGLE_SHEETS_URL_KEY], (err, urlRow) => {
    if (err) {
      res.status(500).json({ message: 'Failed to load Google Sheets URL', error: err.message });
      return;
    }

    db.get('SELECT value FROM settings WHERE key = ?', [GOOGLE_SHEETS_AUTO_SYNC_KEY], (err2, syncRow) => {
      if (err2) {
        res.status(500).json({ message: 'Failed to load auto sync setting', error: err2.message });
        return;
      }

      res.json({
        url: urlRow?.value || '',
        autoSync: syncRow?.value === 'true',
      });
    });
  });
});

router.put('/google-sheets', (req, res) => {
  const { url, autoSync } = req.body || {};

  if (url !== undefined && typeof url !== 'string') {
    res.status(400).json({ message: 'Invalid payload. Expected "url" as string.' });
    return;
  }

  if (autoSync !== undefined && typeof autoSync !== 'boolean') {
    res.status(400).json({ message: 'Invalid payload. Expected "autoSync" as boolean.' });
    return;
  }

  const operations = [];

  if (url !== undefined) {
    operations.push(
      new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [GOOGLE_SHEETS_URL_KEY, url],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      })
    );
  }

  if (autoSync !== undefined) {
    operations.push(
      new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [GOOGLE_SHEETS_AUTO_SYNC_KEY, String(autoSync)],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      })
    );
  }

  Promise.all(operations)
    .then(() => {
      res.json({ success: true, url, autoSync });
    })
    .catch((err) => {
      res.status(500).json({ message: 'Failed to update Google Sheets settings', error: err.message });
    });
});

module.exports = {
  router,
  DEFAULT_VISIBILITY,
};



