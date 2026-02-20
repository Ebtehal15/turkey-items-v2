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

    // Migration: Check if orders table has items_json column and migrate to items
    // This runs after the main initialization to ensure table exists
    db.all('PRAGMA table_info(orders)', (infoErr, columns) => {
      if (infoErr) {
        console.error('❌ Error checking orders table schema:', infoErr);
        return;
      }
      const columnNames = columns?.map((column) => column?.name) ?? [];
      console.log('📋 Orders table columns:', columnNames);
      
      // If both columns exist, copy data from items_json to items where items is null
      if (columnNames.includes('items_json') && columnNames.includes('items')) {
        console.log('🔄 Both items and items_json exist. Copying data from items_json to items...');
        db.run(`
          UPDATE orders 
          SET items = items_json 
          WHERE items IS NULL AND items_json IS NOT NULL
        `, (updateErr) => {
          if (updateErr) {
            console.error('❌ Failed to copy items_json to items:', updateErr);
          } else {
            db.get('SELECT changes() as changes', [], (changesErr, row) => {
              if (!changesErr && row) {
                console.log(`✅ Copied items_json to items for ${row.changes} orders`);
              }
            });
          }
        });
      }
      
      // If items_json exists but items doesn't, we need to migrate
      if (columnNames.includes('items_json') && !columnNames.includes('items')) {
      console.log('🔄 Migrating orders table: renaming items_json to items');
      // SQLite 3.25.0+ supports RENAME COLUMN
      db.run('ALTER TABLE orders RENAME COLUMN items_json TO items', (renameErr) => {
        if (renameErr) {
          console.error('❌ Failed to rename column, trying alternative migration:', renameErr);
          // Fallback: Create new table, copy data, drop old, rename new
          db.serialize(() => {
            db.run(`
              CREATE TABLE orders_new (
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
            `, (createErr) => {
              if (createErr) {
                console.error('❌ Failed to create new orders table:', createErr);
                return;
              }
              console.log('✅ Created orders_new table');
              db.run(`
                INSERT INTO orders_new 
                SELECT id, order_id, customer_full_name, customer_company, customer_phone, 
                       customer_sales_person, customer_notes, items_json, known_total, 
                       total_items, has_unknown_prices, language, created_at
                FROM orders
              `, (insertErr) => {
                if (insertErr) {
                  console.error('❌ Failed to copy data to new table:', insertErr);
                  db.run('DROP TABLE IF EXISTS orders_new');
                  return;
                }
                console.log('✅ Copied data to orders_new');
                db.run('DROP TABLE orders', (dropErr) => {
                  if (dropErr) {
                    console.error('❌ Failed to drop old table:', dropErr);
                    return;
                  }
                  console.log('✅ Dropped old orders table');
                  db.run('ALTER TABLE orders_new RENAME TO orders', (renameErr2) => {
                    if (renameErr2) {
                      console.error('❌ Failed to rename new table:', renameErr2);
                      return;
                    }
                    console.log('✅ Renamed orders_new to orders');
                    db.run('CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id)');
                    db.run('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)');
                    console.log('✅ Orders table migration completed successfully');
                  });
                });
              });
            });
          });
        } else {
          console.log('✅ Orders table column renamed successfully from items_json to items');
        }
      });
    } else if (columnNames.includes('items')) {
      console.log('✅ Orders table already has items column');
    } else if (!columnNames.includes('items') && !columnNames.includes('items_json')) {
      // Table exists but has neither column - this shouldn't happen, but add items if missing
      console.log('⚠️ Orders table missing items column, adding it');
      db.run('ALTER TABLE orders ADD COLUMN items TEXT NOT NULL DEFAULT "[]"', (addErr) => {
        if (addErr) {
          console.error('❌ Failed to add items column:', addErr);
        } else {
          console.log('✅ Added items column to orders table');
        }
      });
    }
  });
};

module.exports = {
  db,
  initializeDatabase,
};


