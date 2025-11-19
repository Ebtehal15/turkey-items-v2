const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'database.sqlite');

const ensureDatabaseFile = () => {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.closeSync(fs.openSync(DB_FILE, 'w'));
  }
};

ensureDatabaseFile();

const db = new sqlite3.Database(DB_FILE);

const initializeDatabase = () => {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        special_id TEXT UNIQUE,
        main_category TEXT NOT NULL,
        quality TEXT NOT NULL,
        class_name TEXT NOT NULL,
        class_name_ar TEXT,
        class_name_en TEXT,
        class_features TEXT,
        class_price REAL,
        class_weight REAL,
        class_video TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_classes_special_id ON classes(special_id)
    `);
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_classes_main_category ON classes(main_category)
    `);
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_classes_quality ON classes(quality)
    `);

    db.all('PRAGMA table_info(classes)', (infoErr, columns) => {
      if (infoErr) {
        return;
      }
      const columnNames = columns?.map((column) => column?.name) ?? [];
      if (!columnNames.includes('class_weight')) {
        db.run('ALTER TABLE classes ADD COLUMN class_weight REAL');
      }
      if (!columnNames.includes('class_name_ar')) {
        db.run('ALTER TABLE classes ADD COLUMN class_name_ar TEXT');
      }
      if (!columnNames.includes('class_name_en')) {
        db.run('ALTER TABLE classes ADD COLUMN class_name_en TEXT');
      }
      if (!columnNames.includes('class_quantity')) {
        db.run('ALTER TABLE classes ADD COLUMN class_quantity INTEGER');
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  });
};

module.exports = {
  db,
  initializeDatabase,
};


