const express = require('express');
const { db } = require('../db');
const { getTurkeyTimestamp } = require('../utils');

const router = express.Router();

// Debug endpoint: Check database schema and order data
router.get('/debug/:orderId', (req, res) => {
  const { orderId } = req.params;
  
  // Check table schema
  db.all('PRAGMA table_info(orders)', (schemaErr, columns) => {
    if (schemaErr) {
      return res.status(500).json({ error: 'Failed to check schema', message: schemaErr.message });
    }
    
    const columnNames = columns?.map((col) => col.name) ?? [];
    
    // Get order data
    db.get('SELECT * FROM orders WHERE order_id = ?', [orderId], (orderErr, row) => {
      if (orderErr) {
        return res.status(500).json({ error: 'Failed to fetch order', message: orderErr.message });
      }
      
      if (!row) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      res.json({
        schema: {
          columns: columnNames,
          hasItems: columnNames.includes('items'),
          hasItemsJson: columnNames.includes('items_json'),
        },
        order: {
          orderId: row.order_id,
          totalItems: row.total_items,
          itemsRaw: row.items,
          itemsJsonRaw: row.items_json,
          itemsType: typeof row.items,
          itemsJsonType: typeof row.items_json,
          itemsLength: row.items ? (typeof row.items === 'string' ? row.items.length : 'not string') : 'null/undefined',
          itemsJsonLength: row.items_json ? (typeof row.items_json === 'string' ? row.items_json.length : 'not string') : 'null/undefined',
        },
      });
    });
  });
});

// Get all orders
router.get('/', (req, res) => {
  const { limit = 100, offset = 0 } = req.query;

  // Check which column name exists
  db.all('PRAGMA table_info(orders)', (infoErr, columns) => {
    if (infoErr) {
      res.status(500).json({ message: 'Failed to check database schema', error: infoErr.message });
      return;
    }

    const columnNames = columns?.map((column) => column?.name) ?? [];
    const itemsColumnName = columnNames.includes('items') ? 'items' : 'items_json';

    db.all(
      `SELECT 
        id,
        order_id,
        customer_full_name,
        customer_company,
        customer_phone,
        customer_sales_person,
        customer_notes,
        ${itemsColumnName} as items,
        known_total,
        total_items,
        has_unknown_prices,
        language,
        created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
      [parseInt(limit, 10), parseInt(offset, 10)],
      (err, rows) => {
        if (err) {
          res.status(500).json({ message: 'Failed to retrieve orders', error: err.message });
          return;
        }
        res.json(rows.map((row) => {
          // Parse items safely
          let items = [];
          try {
            if (row.items) {
              if (typeof row.items === 'string') {
                items = JSON.parse(row.items);
                console.log(`✅ Parsed items for order ${row.order_id}:`, items.length, 'items');
              } else if (Array.isArray(row.items)) {
                items = row.items;
                console.log(`✅ Items already array for order ${row.order_id}:`, items.length, 'items');
              } else {
                console.warn('⚠️ Unexpected items type for order:', row.order_id, 'type:', typeof row.items, 'value:', row.items);
                items = [];
              }
            } else {
              console.warn('⚠️ No items field for order:', row.order_id, 'row keys:', Object.keys(row));
            }
          } catch (parseErr) {
            console.error('❌ Failed to parse items for order:', row.order_id, parseErr, 'Raw items:', row.items, 'Type:', typeof row.items);
            items = [];
          }
          
          const result = {
            id: row.id,
            orderId: row.order_id,
            customerInfo: {
              fullName: row.customer_full_name,
              company: row.customer_company || '',
              phone: row.customer_phone || '',
              salesPerson: row.customer_sales_person || '',
              notes: row.customer_notes || '',
            },
            items: items,
            knownTotal: row.known_total,
            totalItems: row.total_items,
            hasUnknownPrices: row.has_unknown_prices === 1,
            language: row.language || 'es',
            createdAt: row.created_at,
          };
          
          // Debug: Log if items is empty but totalItems > 0
          if (result.items.length === 0 && result.totalItems > 0) {
            console.error('🚨 INCONSISTENCY: Order', row.order_id, 'has totalItems:', result.totalItems, 'but items array is empty!');
          }
          
          return result;
        }));
      }
    );
  });
});

// Get single order by order_id
router.get('/:orderId', (req, res) => {
  const { orderId } = req.params;

  // Check which column name exists
  db.all('PRAGMA table_info(orders)', (infoErr, columns) => {
    if (infoErr) {
      res.status(500).json({ message: 'Failed to check database schema', error: infoErr.message });
      return;
    }

    const columnNames = columns?.map((column) => column?.name) ?? [];
    const itemsColumnName = columnNames.includes('items') ? 'items' : 'items_json';

    db.get(
      `SELECT 
        id,
        order_id,
        customer_full_name,
        customer_company,
        customer_phone,
        customer_sales_person,
        customer_notes,
        ${itemsColumnName} as items,
        known_total,
        total_items,
        has_unknown_prices,
        language,
        created_at
      FROM orders
      WHERE order_id = ?`,
      [orderId],
      (err, row) => {
        if (err) {
          res.status(500).json({ message: 'Failed to retrieve order', error: err.message });
          return;
        }
        if (!row) {
          res.status(404).json({ message: 'Order not found' });
          return;
        }
        
        // Parse items safely
        let items = [];
        try {
          if (row.items) {
            if (typeof row.items === 'string') {
              items = JSON.parse(row.items);
            } else if (Array.isArray(row.items)) {
              items = row.items;
            } else {
              console.warn('⚠️ Unexpected items type for order:', row.order_id);
              items = [];
            }
          }
        } catch (parseErr) {
          console.error('❌ Failed to parse items for order:', row.order_id, parseErr);
          items = [];
        }
        
        res.json({
          id: row.id,
          orderId: row.order_id,
          customerInfo: {
            fullName: row.customer_full_name,
            company: row.customer_company || '',
            phone: row.customer_phone || '',
            salesPerson: row.customer_sales_person || '',
            notes: row.customer_notes || '',
          },
          items: items,
          knownTotal: row.known_total,
          totalItems: row.total_items,
          hasUnknownPrices: row.has_unknown_prices === 1,
          language: row.language || 'es',
          createdAt: row.created_at,
        });
      }
    );
  });
});

// Create new order
router.post('/', (req, res) => {
  console.log('📦 Creating new order:', {
    orderId: req.body.orderId,
    hasCustomerInfo: !!req.body.customerInfo,
    itemsCount: req.body.items?.length,
    knownTotal: req.body.knownTotal,
  });

  const {
    orderId,
    customerInfo,
    items,
    knownTotal,
    totalItems,
    hasUnknownPrices,
    language,
  } = req.body;

  // Validate and log items
  if (!items || !Array.isArray(items)) {
    console.error('❌ Invalid items field:', {
      orderId,
      items,
      itemsType: typeof items,
      itemsIsArray: Array.isArray(items),
    });
    res.status(400).json({ message: 'Invalid items: must be an array' });
    return;
  }

  if (!orderId || !customerInfo || knownTotal === undefined) {
    console.error('❌ Missing required fields:', {
      hasOrderId: !!orderId,
      hasCustomerInfo: !!customerInfo,
      hasItems: !!items,
      itemsLength: items?.length,
      knownTotal,
    });
    res.status(400).json({ message: 'Missing required fields' });
    return;
  }

  console.log('📦 Order items to save:', {
    orderId,
    itemsCount: items.length,
    itemsSample: items.slice(0, 2), // Log first 2 items
  });

  // Check which column name exists in the database (items or items_json)
  db.all('PRAGMA table_info(orders)', (infoErr, columns) => {
    if (infoErr) {
      console.error('❌ Error checking orders table schema:', infoErr);
      res.status(500).json({ message: 'Failed to check database schema', error: infoErr.message });
      return;
    }

    const columnNames = columns?.map((column) => column?.name) ?? [];
    // Prefer items column if it exists, otherwise use items_json
    const itemsColumnName = columnNames.includes('items') ? 'items' : 'items_json';
    console.log(`📋 Using column name: ${itemsColumnName} (preferring items over items_json)`);

    const itemsJsonString = JSON.stringify(items);
    console.log('💾 Saving items JSON (length):', itemsJsonString.length, 'characters');
    console.log('💾 Items JSON preview:', itemsJsonString.substring(0, 200));
    console.log('💾 Column name to use:', itemsColumnName);
    console.log('💾 Available columns:', columnNames);

    // Build INSERT statement - use items column, but also set items_json if it exists
    const insertColumns = [
      'order_id',
      'customer_full_name',
      'customer_company',
      'customer_phone',
      'customer_sales_person',
      'customer_notes',
      'items', // Always use items column
      'known_total',
      'total_items',
      'has_unknown_prices',
      'language',
      'created_at'
    ];
    
    // If items_json column exists, also include it
    if (columnNames.includes('items_json')) {
      insertColumns.splice(insertColumns.indexOf('items') + 1, 0, 'items_json');
    }
    
    const placeholders = insertColumns.map(() => '?').join(', ');
    const stmt = db.prepare(`
      INSERT INTO orders (${insertColumns.join(', ')})
      VALUES (${placeholders})
    `);

    // Build values array
    const values = [
      orderId,
      customerInfo.fullName || '',
      customerInfo.company || null,
      customerInfo.phone || null,
      customerInfo.salesPerson || null,
      customerInfo.notes || null,
      itemsJsonString, // items column
    ];
    
    // If items_json column exists, also set it (for backward compatibility)
    if (columnNames.includes('items_json')) {
      values.push(itemsJsonString); // items_json column (same value)
    }
    
    values.push(
      knownTotal,
      totalItems || 0,
      hasUnknownPrices ? 1 : 0,
      language || 'es',
      getTurkeyTimestamp()
    );
    
    console.log('💾 Executing INSERT with values:', {
      orderId,
      itemsLength: itemsJsonString.length,
      totalItems,
      columns: insertColumns,
      valuesCount: values.length,
    });

    stmt.run(...values,
      function insertCallback(err) {
        if (err) {
          stmt.finalize();
          console.error('❌ Order insert error:', err.message);
          console.error('❌ Error details:', {
            orderId,
            itemsColumnName,
            itemsLength: itemsJsonString.length,
            columnNames,
          });
          if (err.message.includes('UNIQUE constraint failed')) {
            console.error('⚠️ Order ID already exists:', orderId);
            res.status(409).json({ message: 'Order with this ID already exists' });
            return;
          }
          res.status(500).json({ message: 'Failed to create order', error: err.message });
          return;
        }
        
        console.log('✅ INSERT successful, lastID:', this.lastID);

        console.log('✅ Order inserted successfully, ID:', this.lastID);
        // When reading, use the column that exists
        const selectColumnName = columnNames.includes('items') ? 'items' : 'items_json';
        db.get(`SELECT * FROM orders WHERE id = ?`, [this.lastID], (selectErr, row) => {
          stmt.finalize();
          if (selectErr) {
            console.error('❌ Failed to retrieve created order:', selectErr.message);
            res.status(500).json({ message: 'Order created but failed to retrieve record', error: selectErr.message });
            return;
          }
          console.log('✅ Order retrieved successfully, orderId:', row.order_id);
          console.log('🔍 Retrieved items data:', {
            selectColumnName,
            hasItems: !!row[selectColumnName],
            itemsType: typeof row[selectColumnName],
            itemsLength: typeof row[selectColumnName] === 'string' ? row[selectColumnName].length : 'N/A',
            itemsPreview: typeof row[selectColumnName] === 'string' ? row[selectColumnName].substring(0, 100) : row[selectColumnName],
          });
          
          // Parse items from the correct column
          const itemsData = row[selectColumnName] || row.items || row.items_json || '[]';
          let items = [];
          try {
            if (itemsData) {
              if (typeof itemsData === 'string') {
                items = JSON.parse(itemsData);
                console.log('✅ Parsed items from string, count:', items.length);
              } else if (Array.isArray(itemsData)) {
                items = itemsData;
                console.log('✅ Items already array, count:', items.length);
              } else {
                console.warn('⚠️ Unexpected items type for order:', row.order_id, 'Type:', typeof itemsData);
                items = [];
              }
            } else {
              console.error('❌ No items data found for order:', row.order_id);
            }
          } catch (parseErr) {
            console.error('❌ Failed to parse items for order:', row.order_id, parseErr, 'Raw data:', itemsData);
            items = [];
          }
          
          if (items.length === 0 && row.total_items > 0) {
            console.error('🚨 CRITICAL: Order', row.order_id, 'saved with', row.total_items, 'items but retrieved items array is empty!');
          }
          
          res.status(201).json({
            id: row.id,
            orderId: row.order_id,
            customerInfo: {
              fullName: row.customer_full_name,
              company: row.customer_company || '',
              phone: row.customer_phone || '',
              salesPerson: row.customer_sales_person || '',
              notes: row.customer_notes || '',
            },
            items: items,
            knownTotal: row.known_total,
            totalItems: row.total_items,
            hasUnknownPrices: row.has_unknown_prices === 1,
            language: row.language || 'es',
            createdAt: row.created_at,
          });
        });
      }
    );
  });
});

// Delete order
router.delete('/:orderId', (req, res) => {
  const { orderId } = req.params;

  db.run('DELETE FROM orders WHERE order_id = ?', [orderId], function deleteCallback(err) {
    if (err) {
      res.status(500).json({ message: 'Failed to delete order', error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ message: 'Order not found' });
      return;
    }
    res.status(204).send();
  });
});

module.exports = router;

