const express = require('express');
const router = express.Router();
const { db } = require('../db');

// Sepeti getir
router.get('/', (req, res) => {
  try {
    console.log('📦 Cart GET request - Session ID:', req.sessionID);
    console.log('📦 Current cart in session:', req.session.cart);
    
    const cart = req.session.cart || [];
    const cartTotal = req.session.cartTotal || 0;

    // Sepetteki ürün ID'lerini al
    const productIds = cart.map((item) => item.classId);

    if (productIds.length === 0) {
      return res.json({
        items: [],
        totalItems: 0,
        knownTotal: 0,
        hasUnknownPrices: false,
      });
    }

    // Veritabanından ürün bilgilerini çek
    const placeholders = productIds.map(() => '?').join(',');
    const query = `SELECT * FROM classes WHERE id IN (${placeholders})`;

    db.all(query, productIds, (err, rows) => {
      if (err) {
        console.error('Error fetching cart items:', err);
        return res.status(500).json({ error: 'Failed to fetch cart items' });
      }

      // Sepet verilerini ürün bilgileriyle birleştir
      const items = cart
        .map((cartItem) => {
          const product = rows.find((row) => row.id === cartItem.classId);
          if (!product) return null;

          return {
            record: {
              id: product.id,
              specialId: product.special_id,
              mainCategory: product.main_category,
              quality: product.quality,
              className: product.class_name,
              classNameArabic: product.class_name_arabic || null,
              classNameEnglish: product.class_name_english || null,
              classFeatures: product.class_features || null,
              classPrice: product.class_price,
              classWeight: product.class_weight,
              classVideo: product.class_video || null,
            },
            quantity: cartItem.quantity,
          };
        })
        .filter((item) => item !== null);

      // Toplam hesapla
      let knownTotal = 0;
      let hasUnknownPrices = false;
      let totalItems = 0;

      items.forEach(({ record, quantity }) => {
        totalItems += quantity;
        if (record.classPrice === null || record.classPrice === undefined) {
          hasUnknownPrices = true;
        } else {
          knownTotal += record.classPrice * quantity;
        }
      });

      res.json({
        items,
        totalItems,
        knownTotal,
        hasUnknownPrices,
      });
    });
  } catch (error) {
    console.error('Error in GET /api/cart:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sepete ürün ekle
router.post('/add', (req, res) => {
  try {
    console.log('🛒 Cart add request:', req.body);
    console.log('📝 Session ID:', req.sessionID);
    console.log('🍪 Current cart:', req.session.cart);
    
    const { classId } = req.body;

    if (!classId || typeof classId !== 'number') {
      console.log('❌ Invalid classId:', classId);
      return res.status(400).json({ error: 'Invalid classId' });
    }

    // Session'dan sepeti al veya oluştur
    if (!req.session.cart) {
      req.session.cart = [];
      req.session.cartTotal = 0;
    }

    // Ürünün sepette olup olmadığını kontrol et
    const existingItem = req.session.cart.find((item) => item.classId === classId);

    if (existingItem) {
      // Varsa adet arttır
      existingItem.quantity += 1;
    } else {
      // Yoksa yeni kayıt ekle
      req.session.cart.push({
        classId,
        quantity: 1,
      });
    }

    // Toplam tutarı hesapla ve kaydet
    calculateCartTotal(req.session, (err, total) => {
      if (err) {
        console.error('Error calculating cart total:', err);
        return res.status(500).json({ error: 'Failed to calculate cart total' });
      }

      req.session.cartTotal = total;
      
      // Session'ı manuel olarak kaydet
      req.session.save((err) => {
        if (err) {
          console.error('❌ Session save error:', err);
          return res.status(500).json({ error: 'Session save failed' });
        }
        
        console.log('✅ Cart add success:', { 
          classId, 
          total, 
          cartLength: req.session.cart.length,
          sessionId: req.sessionID,
          cartItems: req.session.cart 
        });
        
        res.json({
          success: true,
          message: 'Item added to cart',
          cartTotal: total,
        });
      });
    });
  } catch (error) {
    console.error('Error in POST /api/cart/add:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sepetteki ürün miktarını güncelle
router.put('/update', (req, res) => {
  try {
    const { classId, quantity } = req.body;

    if (!classId || typeof classId !== 'number') {
      return res.status(400).json({ error: 'Invalid classId' });
    }

    if (typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    if (!req.session.cart) {
      req.session.cart = [];
      req.session.cartTotal = 0;
    }

    const existingItem = req.session.cart.find((item) => item.classId === classId);

    if (!existingItem) {
      return res.status(404).json({ error: 'Item not found in cart' });
    }

    if (quantity === 0) {
      // Miktar 0 ise ürünü sepetten kaldır
      req.session.cart = req.session.cart.filter((item) => item.classId !== classId);
    } else {
      // Miktarı güncelle
      existingItem.quantity = quantity;
    }

    // Toplam tutarı hesapla ve kaydet
    calculateCartTotal(req.session, (err, total) => {
      if (err) {
        console.error('Error calculating cart total:', err);
        return res.status(500).json({ error: 'Failed to calculate cart total' });
      }

      req.session.cartTotal = total;
      
      // Session'ı manuel olarak kaydet
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('❌ Session save error:', saveErr);
          return res.status(500).json({ error: 'Session save failed' });
        }
        
        console.log('✅ Cart update success:', { 
          classId, 
          quantity,
          total, 
          cartLength: req.session.cart.length,
          sessionId: req.sessionID,
        });
        
        res.json({
          success: true,
          message: 'Cart updated',
          cartTotal: total,
        });
      });
    });
  } catch (error) {
    console.error('Error in PUT /api/cart/update:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sepetten ürün kaldır
router.delete('/remove/:classId', (req, res) => {
  try {
    const classId = parseInt(req.params.classId, 10);

    if (Number.isNaN(classId)) {
      return res.status(400).json({ error: 'Invalid classId' });
    }

    if (!req.session.cart) {
      req.session.cart = [];
      req.session.cartTotal = 0;
    }

    // Ürünü sepetten kaldır
    req.session.cart = req.session.cart.filter((item) => item.classId !== classId);

    // Toplam tutarı hesapla ve kaydet
    calculateCartTotal(req.session, (err, total) => {
      if (err) {
        console.error('Error calculating cart total:', err);
        return res.status(500).json({ error: 'Failed to calculate cart total' });
      }

      req.session.cartTotal = total;
      res.json({
        success: true,
        message: 'Item removed from cart',
        cartTotal: total,
      });
    });
  } catch (error) {
    console.error('Error in DELETE /api/cart/remove:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sepeti temizle
router.delete('/clear', (req, res) => {
  try {
    // Sadece bu kullanıcının session'ındaki sepet bilgilerini sil
    req.session.cart = [];
    req.session.cartTotal = 0;

    res.json({
      success: true,
      message: 'Cart cleared',
    });
  } catch (error) {
    console.error('Error in DELETE /api/cart/clear:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sepet toplamını hesaplayan yardımcı fonksiyon
function calculateCartTotal(session, callback) {
  const cart = session.cart || [];

  if (cart.length === 0) {
    return callback(null, 0);
  }

  const productIds = cart.map((item) => item.classId);
  const placeholders = productIds.map(() => '?').join(',');
  const query = `SELECT id, class_price FROM classes WHERE id IN (${placeholders})`;

  db.all(query, productIds, (err, rows) => {
    if (err) {
      return callback(err);
    }

    let total = 0;
    cart.forEach((cartItem) => {
      const product = rows.find((row) => row.id === cartItem.classId);
      if (product && product.class_price !== null && product.class_price !== undefined) {
        total += product.class_price * cartItem.quantity;
      }
    });

    callback(null, total);
  });
}

// Order ID yönetimi
const ORDER_ID_KEY = 'lastOrderId';
const START_ORDER_ID = 1000;

// En son order ID'yi getir
router.get('/order-id', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', [ORDER_ID_KEY], (err, row) => {
    if (err) {
      console.error('Error fetching order ID:', err);
      return res.status(500).json({ error: 'Failed to fetch order ID' });
    }
    
    if (!row) {
      // İlk kez kullanılıyorsa başlangıç ID'sini döndür
      return res.json({ orderId: START_ORDER_ID });
    }
    
    try {
      const orderId = parseInt(row.value, 10);
      res.json({ orderId: isNaN(orderId) ? START_ORDER_ID : orderId });
    } catch (error) {
      console.error('Error parsing order ID:', error);
      res.json({ orderId: START_ORDER_ID });
    }
  });
});

// Yeni order ID oluştur ve kaydet
router.post('/order-id', (req, res) => {
  db.get('SELECT value FROM settings WHERE key = ?', [ORDER_ID_KEY], (err, row) => {
    if (err) {
      console.error('Error fetching order ID:', err);
      return res.status(500).json({ error: 'Failed to fetch order ID' });
    }
    
    let nextOrderId;
    if (!row) {
      // İlk kez kullanılıyorsa başlangıç ID'sini kullan
      nextOrderId = START_ORDER_ID;
    } else {
      try {
        const currentOrderId = parseInt(row.value, 10);
        nextOrderId = isNaN(currentOrderId) ? START_ORDER_ID : currentOrderId + 1;
      } catch (error) {
        console.error('Error parsing order ID:', error);
        nextOrderId = START_ORDER_ID;
      }
    }
    
    // Yeni order ID'yi kaydet
    db.run(
      'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [ORDER_ID_KEY, nextOrderId.toString()],
      (updateErr) => {
        if (updateErr) {
          console.error('Error saving order ID:', updateErr);
          return res.status(500).json({ error: 'Failed to save order ID' });
        }
        
        res.json({ orderId: nextOrderId });
      }
    );
  });
});

module.exports = router;






