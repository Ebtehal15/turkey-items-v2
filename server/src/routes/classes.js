const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const { db } = require('../db');
const { getNextSpecialId, parseClassPayload } = require('../utils');

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
  classVideo: row.class_video,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

router.get('/', (req, res) => {
  const { search, category, quality } = req.query;

  const filters = [];
  const params = [];

  if (search) {
    filters.push('(LOWER(special_id) LIKE ? OR LOWER(class_name) LIKE ? OR LOWER(IFNULL(class_name_ar, "")) LIKE ? OR LOWER(IFNULL(class_name_en, "")) LIKE ?)');
    const term = `%${search.toLowerCase()}%`;
    params.push(term, term, term, term);
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
    ORDER BY main_category ASC, quality ASC, class_name ASC
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

      if (!payload.className) {
        res.status(400).json({ message: 'Class name is required.' });
        return;
      }

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
          class_video
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        specialId,
        payload.mainCategory ?? '',
        payload.quality ?? '',
        payload.className,
        payload.classNameArabic || null,
        payload.classNameEnglish || null,
        payload.classFeatures || null,
        payload.classPrice,
        payload.classWeight,
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
              class_video = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);

        const newSpecialId = payload.specialId || current.special_id;

        updateStmt.run(
          newSpecialId,
          payload.mainCategory !== undefined ? payload.mainCategory : current.main_category,
          payload.quality !== undefined ? payload.quality : current.quality,
          payload.className || current.class_name,
          payload.classNameArabic !== undefined ? payload.classNameArabic : current.class_name_ar,
          payload.classNameEnglish !== undefined ? payload.classNameEnglish : current.class_name_en,
          payload.classFeatures !== undefined ? payload.classFeatures : current.class_features,
          payload.classPrice !== undefined ? payload.classPrice : current.class_price,
          payload.classWeight !== undefined ? payload.classWeight : current.class_weight,
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
          class_video
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            const specialIdValue = parsed.specialId;

            pendingOperations += 1;

            // Check if record exists
            db.get('SELECT id, class_name FROM classes WHERE special_id = ?', [specialIdValue], (getErr, existing) => {
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

              const classNameValue = parsed.className && parsed.className.length
                ? parsed.className
                : (existing?.class_name ?? '');

              if (existing) {
                // Update existing record
                updateStmt.run(
                  parsed.mainCategory ?? '',
                  parsed.quality ?? '',
                  classNameValue,
                  parsed.classNameArabic || null,
                  parsed.classNameEnglish || null,
                  parsed.classFeatures || null,
                  priceValue,
                  weightValue,
                  parsed.classVideo || null,
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

module.exports = router;

