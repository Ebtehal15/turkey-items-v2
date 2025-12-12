const express = require('express');
const { db } = require('../db');

const router = express.Router();

// Get all orders
router.get('/', (req, res) => {
  const { limit = 100, offset = 0 } = req.query;

  db.all(
    `SELECT 
      id,
      order_id,
      customer_full_name,
      customer_company,
      customer_phone,
      customer_sales_person,
      customer_notes,
      items,
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
      res.json(rows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        customerInfo: {
          fullName: row.customer_full_name,
          company: row.customer_company || '',
          phone: row.customer_phone || '',
          salesPerson: row.customer_sales_person || '',
          notes: row.customer_notes || '',
        },
        items: JSON.parse(row.items),
        knownTotal: row.known_total,
        totalItems: row.total_items,
        hasUnknownPrices: row.has_unknown_prices === 1,
        language: row.language || 'es',
        createdAt: row.created_at,
      })));
    }
  );
});

// Get single order by order_id
router.get('/:orderId', (req, res) => {
  const { orderId } = req.params;

  db.get(
    `SELECT 
      id,
      order_id,
      customer_full_name,
      customer_company,
      customer_phone,
      customer_sales_person,
      customer_notes,
      items,
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
        items: JSON.parse(row.items),
        knownTotal: row.known_total,
        totalItems: row.total_items,
        hasUnknownPrices: row.has_unknown_prices === 1,
        language: row.language || 'es',
        createdAt: row.created_at,
      });
    }
  );
});

// Create new order
router.post('/', (req, res) => {
  const {
    orderId,
    customerInfo,
    items,
    knownTotal,
    totalItems,
    hasUnknownPrices,
    language,
  } = req.body;

  if (!orderId || !customerInfo || !items || knownTotal === undefined) {
    res.status(400).json({ message: 'Missing required fields' });
    return;
  }

  const stmt = db.prepare(`
    INSERT INTO orders (
      order_id,
      customer_full_name,
      customer_company,
      customer_phone,
      customer_sales_person,
      customer_notes,
      items,
      known_total,
      total_items,
      has_unknown_prices,
      language
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    orderId,
    customerInfo.fullName || '',
    customerInfo.company || null,
    customerInfo.phone || null,
    customerInfo.salesPerson || null,
    customerInfo.notes || null,
    JSON.stringify(items),
    knownTotal,
    totalItems || 0,
    hasUnknownPrices ? 1 : 0,
    language || 'es',
    function insertCallback(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          res.status(409).json({ message: 'Order with this ID already exists' });
          return;
        }
        res.status(500).json({ message: 'Failed to create order', error: err.message });
        return;
      }

      db.get('SELECT * FROM orders WHERE id = ?', [this.lastID], (selectErr, row) => {
        if (selectErr) {
          res.status(500).json({ message: 'Order created but failed to retrieve record', error: selectErr.message });
          return;
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
          items: JSON.parse(row.items),
          knownTotal: row.known_total,
          totalItems: row.total_items,
          hasUnknownPrices: row.has_unknown_prices === 1,
          language: row.language || 'es',
          createdAt: row.created_at,
        });
      });
    }
  );

  stmt.finalize();
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

