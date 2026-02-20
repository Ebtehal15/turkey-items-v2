const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const axios = require('axios');
const { db } = require('../db');
const { getNextSpecialId, parseClassPayload, getTurkeyTimestamp } = require('../utils');

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const uniqueSuffix = `${timestamp}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const excelStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const tempDir = path.join(uploadsDir, 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  },
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

const excelUpload = multer({
  storage: excelStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

const router = express.Router();

const mapRowToResponse = (row) => ({
  id: row.id,
  specialId: row.special_id,
  mainCategory: row.main_category,
  quality: row.quality,
  className: row.class_name,
  classNameArabic: row.class_name_ar,
  classNameEnglish: row.class_name_en,
  classFeatures: row.class_features,
  classPrice: row.class_price,
  classWeight: row.class_weight,
  classQuantity: row.class_quantity,
  classVideo: row.class_video,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

router.get('/', (req, res) => {
  const { classNameSearch, codeSearch, category, quality, includeZeroQuantity } = req.query;

  const filters = [];
  const params = [];

  // Hide products with quantity = 0 from catalog (unless includeZeroQuantity is true for admin)
  if (includeZeroQuantity !== 'true') {
    filters.push('(class_quantity IS NULL OR class_quantity != 0)');
  }

  if (codeSearch) {
    filters.push('LOWER(special_id) LIKE ?');
    params.push(`%${codeSearch.toLowerCase()}%`);
  }

  if (classNameSearch) {
    filters.push('(LOWER(class_name) LIKE ? OR LOWER(IFNULL(class_name_ar, "")) LIKE ? OR LOWER(IFNULL(class_name_en, "")) LIKE ?)');
    const term = `%${classNameSearch.toLowerCase()}%`;
    params.push(term, term, term);
  }

  if (category) {
    filters.push('LOWER(main_category) = ?');
    params.push(category.toLowerCase());
  }

  if (quality) {
    filters.push('LOWER(quality) = ?');
    params.push(quality.toLowerCase());
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT * FROM classes
    ${whereClause}
    ORDER BY 
      CASE 
        WHEN class_video IS NOT NULL AND class_video != '' THEN 0 
        ELSE 1 
      END ASC,
      main_category ASC, 
      quality ASC, 
      class_name ASC
  `;

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ message: 'Failed to retrieve classes', error: err.message });
      return;
    }
    res.json(rows.map(mapRowToResponse));
  });
});

router.get('/:identifier', (req, res) => {
  const { identifier } = req.params;
  const isNumericId = /^\d+$/.test(identifier);
  const query = isNumericId
    ? 'SELECT * FROM classes WHERE id = ?'
    : 'SELECT * FROM classes WHERE LOWER(special_id) = ?';
  const param = isNumericId ? identifier : identifier.toLowerCase();

  db.get(query, [param], (err, row) => {
    if (err) {
      res.status(500).json({ message: 'Failed to retrieve class', error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }
    res.json(mapRowToResponse(row));
  });
});

router.post('/generate-id', async (req, res) => {
  try {
    const { prefix } = req.body;
    const nextId = await getNextSpecialId(prefix);
    res.json({ specialId: nextId });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate special ID', error: error.message });
  }
});

router.post(
  '/',
  videoUpload.single('classVideo'),
  async (req, res) => {
    try {
      const payload = parseClassPayload(req.body);
      const { classVideoUrl } = payload;

      let specialId = payload.specialId;
      if (!specialId) {
        specialId = await getNextSpecialId();
      }

      const videoPath = req.file
        ? `/uploads/${req.file.filename}`
        : (classVideoUrl ?? null);

      const stmt = db.prepare(`
        INSERT INTO classes (
          special_id,
          main_category,
          quality,
          class_name,
          class_name_ar,
          class_name_en,
          class_features,
          class_price,
          class_weight,
          class_quantity,
          class_video
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        specialId,
        payload.mainCategory ?? '',
        payload.quality ?? '',
        payload.className || '',
        payload.classNameArabic || null,
        payload.classNameEnglish || null,
        payload.classFeatures || null,
        payload.classPrice,
        payload.classWeight,
        payload.classQuantity,
        videoPath,
        function insertCallback(err) {
          if (err) {
            if (req.file) {
              fs.unlink(path.join(uploadsDir, req.file.filename), () => {});
            }
            res.status(500).json({ message: 'Failed to create class', error: err.message });
            return;
          }

          db.get('SELECT * FROM classes WHERE id = ?', [this.lastID], (selectErr, row) => {
            if (selectErr) {
              res.status(500).json({ message: 'Class created but failed to retrieve record', error: selectErr.message });
              return;
            }
            res.status(201).json(mapRowToResponse(row));
          });
        }
      );

      stmt.finalize();
    } catch (error) {
      if (req.file) {
        fs.unlink(path.join(uploadsDir, req.file.filename), () => {});
      }
      res.status(400).json({ message: error.message });
    }
  }
);

// Bulk text replace for class fields (e.g., normalize group/main category names)
router.post('/bulk-replace-text', (req, res) => {
  const { field, search, replace } = req.body || {};

  if (!field || typeof field !== 'string') {
    res.status(400).json({ message: 'Field is required.' });
    return;
  }

  if (!search || typeof search !== 'string') {
    res.status(400).json({ message: 'Search text is required.' });
    return;
  }

  const allowedFields = {
    mainCategory: 'main_category',
    quality: 'quality',
    className: 'class_name',
    classNameArabic: 'class_name_ar',
    classNameEnglish: 'class_name_en',
  };

  const column = allowedFields[field];
  if (!column) {
    res.status(400).json({ message: 'Invalid field.' });
    return;
  }

  const searchText = String(search);
  const replaceText = replace !== undefined && replace !== null ? String(replace) : '';

  const sql = `
    UPDATE classes
    SET ${column} = REPLACE(${column}, ?, ?)
    WHERE ${column} LIKE ?
  `;

  db.run(sql, [searchText, replaceText, `%${searchText}%`], function onUpdate(err) {
    if (err) {
      res.status(500).json({ message: 'Failed to apply bulk replace', error: err.message });
      return;
    }
    res.json({ updatedCount: this.changes ?? 0 });
  });
});

router.put(
  '/:id',
  videoUpload.single('classVideo'),
  async (req, res) => {
    const { id } = req.params;
    try {
      const payload = parseClassPayload(req.body);
      const { classVideoUrl } = payload;

      db.get('SELECT * FROM classes WHERE id = ?', [id], async (getErr, current) => {
        if (getErr) {
          if (req.file) {
            fs.unlink(path.join(uploadsDir, req.file.filename), () => {});
          }
          res.status(500).json({ message: 'Failed to fetch class for update', error: getErr.message });
          return;
        }

        if (!current) {
          if (req.file) {
            fs.unlink(path.join(uploadsDir, req.file.filename), () => {});
          }
          res.status(404).json({ message: 'Class not found' });
          return;
        }

        let videoPath = current.class_video;
        if (req.file) {
          videoPath = `/uploads/${req.file.filename}`;
        } else if (classVideoUrl !== undefined) {
          if (classVideoUrl === '__DELETE__') {
            videoPath = null;
          } else {
            videoPath = classVideoUrl;
          }
        }

        const updateStmt = db.prepare(`
          UPDATE classes
          SET special_id = ?,
              main_category = ?,
              quality = ?,
              class_name = ?,
              class_name_ar = ?,
              class_name_en = ?,
              class_features = ?,
              class_price = ?,
              class_weight = ?,
              class_quantity = ?,
              class_video = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);

        const newSpecialId = payload.specialId || current.special_id;
        const oldPrice = current.class_price;
        const newPrice = payload.classPrice !== undefined ? payload.classPrice : current.class_price;

        // Check if price changed and record it in price_history
        const priceChanged = payload.classPrice !== undefined && 
          (oldPrice !== newPrice) && 
          (oldPrice !== null || newPrice !== null);

        updateStmt.run(
          newSpecialId,
          payload.mainCategory !== undefined ? payload.mainCategory : current.main_category,
          payload.quality !== undefined ? payload.quality : current.quality,
          payload.className || current.class_name,
          payload.classNameArabic !== undefined ? payload.classNameArabic : current.class_name_ar,
          payload.classNameEnglish !== undefined ? payload.classNameEnglish : current.class_name_en,
          payload.classFeatures !== undefined ? payload.classFeatures : current.class_features,
          newPrice,
          payload.classWeight !== undefined ? payload.classWeight : current.class_weight,
          payload.classQuantity !== undefined ? payload.classQuantity : current.class_quantity,
          videoPath,
          id,
          (updateErr) => {
            if (updateErr) {
              if (req.file) {
                fs.unlink(path.join(uploadsDir, req.file.filename), () => {});
              }
              res.status(500).json({ message: 'Failed to update class', error: updateErr.message });
              return;
            }

            // Record price change in history if price changed
            if (priceChanged) {
              const priceHistoryStmt = db.prepare(`
                INSERT INTO price_history (class_id, old_price, new_price, changed_at)
                VALUES (?, ?, ?, ?)
              `);
              priceHistoryStmt.run(id, oldPrice, newPrice, getTurkeyTimestamp(), (historyErr) => {
                if (historyErr) {
                  console.error('Failed to record price history:', historyErr);
                }
                priceHistoryStmt.finalize();
              });
            }

            const shouldRemoveOldVideo = (() => {
              if (!current.class_video || !current.class_video.startsWith('/uploads/')) {
                return false;
              }
              if (req.file) {
                return true;
              }
              if (videoPath === null) {
                return true;
              }
              if (classVideoUrl !== undefined && classVideoUrl !== current.class_video) {
                return true;
              }
              return false;
            })();

            if (shouldRemoveOldVideo) {
              const oldPath = path.join(uploadsDir, path.basename(current.class_video));
              fs.unlink(oldPath, () => {});
            }

            db.get('SELECT * FROM classes WHERE id = ?', [id], (selectErr, row) => {
              if (selectErr) {
                res.status(500).json({ message: 'Class updated but failed to retrieve record', error: selectErr.message });
                return;
              }
              res.json(mapRowToResponse(row));
            });
          }
        );

        updateStmt.finalize();
      });
    } catch (error) {
      if (req.file) {
        fs.unlink(path.join(uploadsDir, req.file.filename), () => {});
      }
      res.status(400).json({ message: error.message });
    }
  }
);

router.delete('/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT class_video FROM classes WHERE id = ?', [id], (getErr, row) => {
    if (getErr) {
      res.status(500).json({ message: 'Failed to fetch class for deletion', error: getErr.message });
      return;
    }
    if (!row) {
      res.status(404).json({ message: 'Class not found' });
      return;
    }

    db.run('DELETE FROM classes WHERE id = ?', [id], function deleteCallback(deleteErr) {
      if (deleteErr) {
        res.status(500).json({ message: 'Failed to delete class', error: deleteErr.message });
        return;
      }

      if (row.class_video) {
        const videoFile = path.join(uploadsDir, path.basename(row.class_video));
        fs.unlink(videoFile, () => {});
      }

      res.status(204).send();
    });
  });
});

router.delete('/', (_req, res) => {
  db.all('SELECT class_video FROM classes', (selectErr, rows) => {
    if (selectErr) {
      res.status(500).json({ message: 'Failed to fetch classes for purge', error: selectErr.message });
      return;
    }

    const videos = rows
      .map((row) => row.class_video)
      .filter(Boolean)
      .map((videoPath) => path.join(uploadsDir, path.basename(videoPath)));

    db.run('DELETE FROM classes', function purgeCallback(deleteErr) {
      if (deleteErr) {
        res.status(500).json({ message: 'Failed to delete classes', error: deleteErr.message });
        return;
      }

      videos.forEach((videoFile) => {
        fs.unlink(videoFile, () => {});
      });

      res.json({ deletedCount: this.changes ?? 0 });
    });
  });
});

router.post(
  '/bulk-upload',
  excelUpload.single('file'),
  (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: 'Excel file is required.' });
      return;
    }

    const updateOnly = req.body.updateOnly === 'true' || req.body.updateOnly === true;
    const tempFilePath = req.file.path;

    try {
      const workbook = XLSX.readFile(tempFilePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!rows.length) {
        fs.unlink(tempFilePath, () => {});
        res.status(400).json({ message: 'Excel sheet is empty.' });
        return;
      }

      const insertStmt = db.prepare(`
        INSERT INTO classes (
          special_id,
          main_category,
          quality,
          class_name,
          class_name_ar,
          class_name_en,
          class_features,
          class_price,
          class_weight,
          class_quantity,
          class_video
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStmt = db.prepare(`
        UPDATE classes
        SET main_category = ?,
            quality = ?,
            class_name = ?,
            class_name_ar = ?,
            class_name_en = ?,
            class_features = ?,
            class_price = ?,
            class_weight = ?,
            class_quantity = ?,
            class_video = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE special_id = ?
      `);

      const processed = [];
      const skipped = [];
      let pendingOperations = 0;

      // If no rows, return immediately
      if (rows.length === 0) {
        insertStmt.finalize();
        updateStmt.finalize();
        fs.unlink(tempFilePath, () => {});
        res.json({
          processedCount: 0,
          skippedCount: 0,
          skipped: [],
        });
        return;
      }

      db.serialize(() => {
        rows.forEach((row, index) => {
          const record = {
            specialId: row['Special ID'] || row['special_id'],
            mainCategory: row['Main Category'] || row['main_category'],
            quality: row['Group'] || row['group'] || row['Quality'] || row['quality'],
            className: row['Class Name'] || row['class_name'],
            classNameArabic: row['Class Name Arabic'] || row['class_name_ar'],
            classNameEnglish: row['Class Name English'] || row['class_name_en'],
            classFeatures: row['Class Features'] || row['class_features'],
            classPrice: row['Class Price'] || row['class_price'],
            classWeight: row['Class KG'] || row['class_weight'] || row['Class Weight'],
            classQuantity: row['Class Quantity'] || row['class_quantity'] || row['Quantity'] || row['quantity'],
            classVideo: row['Class Video'] || row['class_video'],
          };

          try {
            const parsed = parseClassPayload(record, { classVideo: record.classVideo || null });

            if (!parsed.specialId) {
              skipped.push({ index: index + 2, reason: 'Special ID is required.' });
              return;
            }

            const priceValue = parsed.classPrice;
            const weightValue = parsed.classWeight;
            const quantityValue = parsed.classQuantity;
            const specialIdValue = parsed.specialId;

            pendingOperations += 1;

            // Check if record exists
            db.get('SELECT id, class_name, class_video FROM classes WHERE special_id = ?', [specialIdValue], (getErr, existing) => {
              if (getErr) {
                skipped.push({ index: index + 2, reason: `Database error: ${getErr.message}` });
                pendingOperations -= 1;
                if (pendingOperations === 0) {
                  insertStmt.finalize();
                  updateStmt.finalize();
                  fs.unlink(tempFilePath, () => {});
                  res.json({
                    processedCount: processed.length,
                    skippedCount: skipped.length,
                    skipped,
                  });
                }
                return;
              }

              const operationCallback = (err) => {
                pendingOperations -= 1;
                if (err) {
                  skipped.push({ index: index + 2, reason: err.message });
                } else {
                  processed.push({ ...parsed, action: existing ? 'updated' : 'created' });
                }

                if (pendingOperations === 0) {
                  insertStmt.finalize();
                  updateStmt.finalize();
                  fs.unlink(tempFilePath, () => {});
                  res.json({
                    processedCount: processed.length,
                    skippedCount: skipped.length,
                    skipped,
                  });
                }
              };

              // Update all columns from Excel, but preserve existing video if Excel video is empty
              const classNameValue = parsed.className ?? '';

              // Preserve existing video if Excel doesn't provide a new one (not empty)
              const videoValue = (parsed.classVideo && parsed.classVideo.trim().length > 0)
                ? parsed.classVideo
                : (existing?.class_video ?? null);

              if (existing) {
                // Update existing record - update all columns from Excel
                updateStmt.run(
                  parsed.mainCategory ?? '',
                  parsed.quality ?? '',
                  classNameValue,
                  parsed.classNameArabic ?? null,
                  parsed.classNameEnglish ?? null,
                  parsed.classFeatures ?? null,
                  priceValue,
                  weightValue,
                  quantityValue,
                  videoValue,
                  specialIdValue,
                  operationCallback
                );
              } else {
                // Insert new record (only if updateOnly is false)
                if (updateOnly) {
                  // Skip new records when updateOnly is true
                  skipped.push({ index: index + 2, reason: 'Record not found (update only mode).' });
                  pendingOperations -= 1;
                  if (pendingOperations === 0) {
                    insertStmt.finalize();
                    updateStmt.finalize();
                    fs.unlink(tempFilePath, () => {});
                    res.json({
                      processedCount: processed.length,
                      skippedCount: skipped.length,
                      skipped,
                    });
                  }
                } else {
                  // Insert new record
                  insertStmt.run(
                    specialIdValue,
                    parsed.mainCategory ?? '',
                    parsed.quality ?? '',
                    classNameValue,
                    parsed.classNameArabic || null,
                    parsed.classNameEnglish || null,
                    parsed.classFeatures || null,
                    priceValue,
                    weightValue,
                    quantityValue,
                    parsed.classVideo || null,
                    operationCallback
                  );
                }
              }
            });
          } catch (error) {
            skipped.push({ index: index + 2, reason: error.message });
            // Note: pendingOperations is not incremented for caught errors,
            // so we don't need to decrement it here
          }
        });
      });
    } catch (error) {
      fs.unlink(tempFilePath, () => {});
      res.status(500).json({ message: 'Failed to process Excel file', error: error.message });
    }
  }
);

// Google Sheets'ten veri çekme ve senkronizasyon
router.post('/sync-from-sheets', async (req, res) => {
  try {
    const { sheetsUrl, updateOnly = false } = req.body;

    if (!sheetsUrl || typeof sheetsUrl !== 'string') {
      res.status(400).json({ message: 'Google Sheets URL is required.' });
      return;
    }

    // Google Sheets URL'ini CSV export URL'ine dönüştür
    let csvUrl = sheetsUrl.trim();
    
    // Eğer normal Google Sheets URL'i ise, CSV export URL'ine dönüştür
    const sheetIdMatch = csvUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (sheetIdMatch) {
      const sheetId = sheetIdMatch[1];
      // GID parametresini kontrol et (varsayılan 0)
      const gidMatch = csvUrl.match(/[#&]gid=(\d+)/);
      const gid = gidMatch ? gidMatch[1] : '0';
      csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    } else if (!csvUrl.includes('/export?format=csv')) {
      // Eğer zaten CSV export URL'i değilse ve sheet ID de yoksa hata ver
      res.status(400).json({ 
        message: 'Invalid Google Sheets URL. Please provide a valid Google Sheets URL or CSV export URL.' 
      });
      return;
    }

    // CSV verisini çek
    const response = await axios.get(csvUrl, {
      responseType: 'text',
      timeout: 30000, // 30 saniye timeout
    });

    if (!response.data || response.data.trim().length === 0) {
      res.status(400).json({ message: 'Google Sheets is empty or could not be accessed.' });
      return;
    }

    // CSV'yi parse et
    const workbook = XLSX.read(response.data, { type: 'string' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) {
      res.status(400).json({ message: 'Google Sheets has no data rows.' });
      return;
    }

    const insertStmt = db.prepare(`
      INSERT INTO classes (
        special_id,
        main_category,
        quality,
        class_name,
        class_name_ar,
        class_name_en,
        class_features,
        class_price,
        class_weight,
        class_quantity,
        class_video
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStmt = db.prepare(`
      UPDATE classes
      SET main_category = ?,
          quality = ?,
          class_name = ?,
          class_name_ar = ?,
          class_name_en = ?,
          class_features = ?,
          class_price = ?,
          class_weight = ?,
          class_quantity = ?,
          class_video = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE special_id = ?
    `);

    const processed = [];
    const skipped = [];
    let pendingOperations = 0;

    return new Promise((resolve) => {
      db.serialize(() => {
        rows.forEach((row, index) => {
          const record = {
            specialId: row['Special ID'] || row['special_id'] || row['Special ID'] || row['specialId'],
            mainCategory: row['Main Category'] || row['main_category'] || row['Main Category'] || row['mainCategory'],
            quality: row['Group'] || row['group'] || row['Quality'] || row['quality'],
            className: row['Class Name'] || row['class_name'] || row['Class Name'] || row['className'],
            classNameArabic: row['Class Name Arabic'] || row['class_name_ar'] || row['Class Name Arabic'] || row['classNameArabic'],
            classNameEnglish: row['Class Name English'] || row['class_name_en'] || row['Class Name English'] || row['classNameEnglish'],
            classFeatures: row['Class Features'] || row['class_features'] || row['Class Features'] || row['classFeatures'],
            classPrice: row['Class Price'] || row['class_price'] || row['Class Price'] || row['classPrice'],
            classWeight: row['Class KG'] || row['class_weight'] || row['Class Weight'] || row['classWeight'],
            classQuantity: row['Class Quantity'] || row['class_quantity'] || row['Quantity'] || row['quantity'] || row['classQuantity'],
            classVideo: row['Class Video'] || row['class_video'] || row['Class Video'] || row['classVideo'],
          };

          try {
            const parsed = parseClassPayload(record, { classVideo: record.classVideo || null });

            if (!parsed.specialId) {
              skipped.push({ index: index + 2, reason: 'Special ID is required.' });
              return;
            }

            const priceValue = parsed.classPrice;
            const weightValue = parsed.classWeight;
            const quantityValue = parsed.classQuantity;
            const specialIdValue = parsed.specialId;

            pendingOperations += 1;

            // Check if record exists
            db.get('SELECT id, class_name, class_video FROM classes WHERE special_id = ?', [specialIdValue], (getErr, existing) => {
              if (getErr) {
                skipped.push({ index: index + 2, reason: `Database error: ${getErr.message}` });
                pendingOperations -= 1;
                if (pendingOperations === 0) {
                  insertStmt.finalize();
                  updateStmt.finalize();
                  resolve();
                }
                return;
              }

              const operationCallback = (err) => {
                pendingOperations -= 1;
                if (err) {
                  skipped.push({ index: index + 2, reason: err.message });
                } else {
                  processed.push({ ...parsed, action: existing ? 'updated' : 'created' });
                }

                if (pendingOperations === 0) {
                  insertStmt.finalize();
                  updateStmt.finalize();
                  resolve();
                }
              };

              const classNameValue = parsed.className ?? '';
              const videoValue = (parsed.classVideo && parsed.classVideo.trim().length > 0)
                ? parsed.classVideo
                : (existing?.class_video ?? null);

              if (existing) {
                // Update existing record
                updateStmt.run(
                  parsed.mainCategory ?? '',
                  parsed.quality ?? '',
                  classNameValue,
                  parsed.classNameArabic ?? null,
                  parsed.classNameEnglish ?? null,
                  parsed.classFeatures ?? null,
                  priceValue,
                  weightValue,
                  quantityValue,
                  videoValue,
                  specialIdValue,
                  operationCallback
                );
              } else {
                // Insert new record (only if updateOnly is false)
                if (updateOnly) {
                  skipped.push({ index: index + 2, reason: 'Record not found (update only mode).' });
                  pendingOperations -= 1;
                  if (pendingOperations === 0) {
                    insertStmt.finalize();
                    updateStmt.finalize();
                    resolve();
                  }
                } else {
                  insertStmt.run(
                    specialIdValue,
                    parsed.mainCategory ?? '',
                    parsed.quality ?? '',
                    classNameValue,
                    parsed.classNameArabic || null,
                    parsed.classNameEnglish || null,
                    parsed.classFeatures || null,
                    priceValue,
                    weightValue,
                    quantityValue,
                    parsed.classVideo || null,
                    operationCallback
                  );
                }
              }
            });
          } catch (error) {
            skipped.push({ index: index + 2, reason: error.message });
          }
        });

        // Eğer hiç row yoksa hemen resolve et
        if (rows.length === 0) {
          insertStmt.finalize();
          updateStmt.finalize();
          resolve();
        }
      });
    }).then(() => {
      res.json({
        success: true,
        processedCount: processed.length,
        skippedCount: skipped.length,
        processed,
        skipped,
      });
    }).catch((error) => {
      res.status(500).json({ 
        message: 'Failed to sync from Google Sheets', 
        error: error.message 
      });
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Failed to sync from Google Sheets', 
      error: error.message 
    });
  }
});

// Get price history for a specific class
router.get('/:id/price-history', (req, res) => {
  const { id } = req.params;

  db.all(
    `SELECT 
      id,
      old_price,
      new_price,
      changed_at
    FROM price_history
    WHERE class_id = ?
    ORDER BY changed_at DESC`,
    [id],
    (err, rows) => {
      if (err) {
        res.status(500).json({ message: 'Failed to retrieve price history', error: err.message });
        return;
      }
      res.json(rows.map((row) => ({
        id: row.id,
        oldPrice: row.old_price,
        newPrice: row.new_price,
        changedAt: row.changed_at,
      })));
    }
  );
});

// Get all products with recent price changes
router.get('/price-changes/recent', (req, res) => {
  const { limit } = req.query;
  const limitValue = limit ? parseInt(limit, 10) : null;

  const query = limitValue && limitValue > 0
    ? `SELECT 
      ph.id,
      ph.class_id,
      ph.old_price,
      ph.new_price,
      ph.changed_at,
      c.special_id,
      c.class_name,
      c.class_name_ar,
      c.class_name_en,
      c.main_category,
      c.quality
    FROM price_history ph
    INNER JOIN classes c ON ph.class_id = c.id
    ORDER BY ph.changed_at DESC
    LIMIT ?`
    : `SELECT 
      ph.id,
      ph.class_id,
      ph.old_price,
      ph.new_price,
      ph.changed_at,
      c.special_id,
      c.class_name,
      c.class_name_ar,
      c.class_name_en,
      c.main_category,
      c.quality
    FROM price_history ph
    INNER JOIN classes c ON ph.class_id = c.id
    ORDER BY ph.changed_at DESC`;

  const params = limitValue && limitValue > 0 ? [limitValue] : [];

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ message: 'Failed to retrieve price changes', error: err.message });
      return;
    }
    res.json(rows.map((row) => ({
      id: row.id,
      classId: row.class_id,
      specialId: row.special_id,
      className: row.class_name,
      classNameArabic: row.class_name_ar,
      classNameEnglish: row.class_name_en,
      mainCategory: row.main_category,
      quality: row.quality,
      oldPrice: row.old_price,
      newPrice: row.new_price,
      changedAt: row.changed_at,
    })));
  });
});

module.exports = router;

