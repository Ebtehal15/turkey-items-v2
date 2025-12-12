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

    // Price history table
    db.run(`
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id INTEGER NOT NULL,
        old_price REAL,
        new_price REAL,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
      )
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_price_history_class_id ON price_history(class_id)
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_price_history_changed_at ON price_history(changed_at)
    `);

    // Orders table - stores all orders from all devices
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER UNIQUE NOT NULL,
        customer_full_name TEXT NOT NULL,
        customer_company TEXT,
        customer_phone TEXT,
        customer_sales_person TEXT,
        customer_notes TEXT,
        items TEXT NOT NULL,
        known_total REAL NOT NULL,
        total_items INTEGER NOT NULL,
        has_unknown_prices INTEGER NOT NULL DEFAULT 0,
        language TEXT NOT NULL DEFAULT 'es',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id)
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)
    `);
  });
};

module.exports = {
  db,
  initializeDatabase,
};


