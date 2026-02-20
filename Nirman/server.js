const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { initializeDatabase, seedDatabase, getDB } = require('./database');
const risk = require('./risk-engine');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'trustchain-pds-secret-key-2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); }
    catch { res.status(401).json({ error: 'Invalid token' }); }
}

function roleGuard(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
        next();
    };
}

// ═══ AUTH ROUTES ═══
app.post('/api/auth/register', (req, res) => {
    try {
        const db = getDB();
        const { name, email, password, role } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
        const validRoles = ['super_admin', 'warehouse_manager', 'shop_dealer', 'citizen'];
        const userRole = validRoles.includes(role) ? role : 'citizen';
        const hash = bcrypt.hashSync(password, 10);
        const result = db.run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, email, hash, userRole]);
        const token = jwt.sign({ id: result.lastInsertRowid, name, email, role: userRole }, JWT_SECRET, { expiresIn: '24h' });
        db.save();
        res.json({ token, user: { id: result.lastInsertRowid, name, email, role: userRole } });
    } catch (e) {
        if (e.message && e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email already registered' });
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/login', (req, res) => {
    const db = getDB();
    const { email, password } = req.body;
    const user = db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !bcrypt.compareSync(password, user.password_hash))
        return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({
        id: user.id, name: user.name, email: user.email, role: user.role,
        linked_shop_id: user.linked_shop_id, linked_warehouse_id: user.linked_warehouse_id
    }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, linked_shop_id: user.linked_shop_id, linked_warehouse_id: user.linked_warehouse_id } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    const db = getDB();
    res.json(db.get('SELECT id,name,email,role,linked_shop_id,linked_warehouse_id FROM users WHERE id = ?', [req.user.id]));
});

// ═══ WAREHOUSE ROUTES ═══
app.get('/api/warehouses', authMiddleware, (req, res) => {
    const db = getDB();
    const warehouses = db.all('SELECT * FROM warehouses');
    warehouses.forEach(w => {
        w.rice_closing = w.rice_received - w.rice_dispatched - w.rice_damaged;
        w.wheat_closing = w.wheat_received - w.wheat_dispatched - w.wheat_damaged;
        w.sugar_closing = w.sugar_received - w.sugar_dispatched - w.sugar_damaged;
    });
    res.json(warehouses);
});

app.get('/api/warehouses/:id', authMiddleware, (req, res) => {
    const db = getDB();
    const wh = db.get('SELECT * FROM warehouses WHERE id = ?', [parseInt(req.params.id)]);
    if (!wh) return res.status(404).json({ error: 'Warehouse not found' });
    wh.rice_closing = wh.rice_received - wh.rice_dispatched - wh.rice_damaged;
    wh.wheat_closing = wh.wheat_received - wh.wheat_dispatched - wh.wheat_damaged;
    wh.sugar_closing = wh.sugar_received - wh.sugar_dispatched - wh.sugar_damaged;
    const dispatches = db.all('SELECT * FROM warehouse_dispatch_log WHERE warehouse_id = ? ORDER BY timestamp DESC LIMIT 20', [parseInt(req.params.id)]);
    const damages = db.all('SELECT * FROM damage_log WHERE warehouse_id = ? ORDER BY timestamp DESC LIMIT 20', [parseInt(req.params.id)]);
    const shops = db.all('SELECT id, name, district, rice_stock, wheat_stock, sugar_stock, risk_score FROM shops WHERE warehouse_id = ?', [parseInt(req.params.id)]);
    res.json({ ...wh, dispatches, damages, shops });
});

app.post('/api/warehouses/:id/inbound', authMiddleware, roleGuard('super_admin', 'warehouse_manager'), (req, res) => {
    const db = getDB();
    const { item, quantity } = req.body;
    if (!item || !quantity || quantity <= 0) return res.status(400).json({ error: 'Invalid item or quantity' });
    const validItems = ['rice', 'wheat', 'sugar'];
    if (!validItems.includes(item)) return res.status(400).json({ error: 'Invalid item type' });
    const batchId = `BATCH-IN-${Date.now()}`;
    db.run(`UPDATE warehouses SET ${item}_received = ${item}_received + ? WHERE id = ?`, [quantity, parseInt(req.params.id)]);
    db.run('INSERT INTO warehouse_inbound_log (warehouse_id, item, quantity, batch_id) VALUES (?, ?, ?, ?)', [parseInt(req.params.id), item, quantity, batchId]);
    risk.calculateWarehouseRisk(parseInt(req.params.id));
    db.save();
    res.json({ success: true, batchId });
});

app.post('/api/warehouses/:id/dispatch', authMiddleware, roleGuard('super_admin', 'warehouse_manager'), (req, res) => {
    const db = getDB();
    const { shopId, item, quantity } = req.body;
    if (!shopId || !item || !quantity || quantity <= 0) return res.status(400).json({ error: 'Invalid parameters' });
    const validItems = ['rice', 'wheat', 'sugar'];
    if (!validItems.includes(item)) return res.status(400).json({ error: 'Invalid item type' });
    const wh = db.get('SELECT * FROM warehouses WHERE id = ?', [parseInt(req.params.id)]);
    const closingStock = wh[`${item}_received`] - wh[`${item}_dispatched`] - wh[`${item}_damaged`];
    if (quantity > closingStock) return res.status(400).json({ error: `Insufficient stock. Available: ${closingStock}kg` });
    const batchId = `BATCH-D-${Date.now()}`;
    db.run(`UPDATE warehouses SET ${item}_dispatched = ${item}_dispatched + ? WHERE id = ?`, [quantity, parseInt(req.params.id)]);
    db.run(`UPDATE shops SET ${item}_stock = ${item}_stock + ? WHERE id = ?`, [quantity, parseInt(shopId)]);
    db.run('INSERT INTO warehouse_dispatch_log (warehouse_id, shop_id, item, quantity, batch_id) VALUES (?, ?, ?, ?, ?)', [parseInt(req.params.id), parseInt(shopId), item, quantity, batchId]);
    risk.calculateWarehouseRisk(parseInt(req.params.id));
    risk.calculateShopRisk(parseInt(shopId));
    db.save();
    res.json({ success: true, batchId });
});

app.post('/api/warehouses/:id/damage', authMiddleware, roleGuard('super_admin', 'warehouse_manager'), (req, res) => {
    const db = getDB();
    const { item, quantity, reason } = req.body;
    if (!item || !quantity || quantity <= 0) return res.status(400).json({ error: 'Invalid parameters' });
    const validItems = ['rice', 'wheat', 'sugar'];
    if (!validItems.includes(item)) return res.status(400).json({ error: 'Invalid item type' });
    const wh = db.get('SELECT * FROM warehouses WHERE id = ?', [parseInt(req.params.id)]);
    const totalReceived = wh[`${item}_received`];
    const currentDamaged = wh[`${item}_damaged`];
    const damageRatio = (currentDamaged + quantity) / totalReceived;
    const flagged = damageRatio > 0.03 ? 1 : 0;
    db.run(`UPDATE warehouses SET ${item}_damaged = ${item}_damaged + ? WHERE id = ?`, [quantity, parseInt(req.params.id)]);
    db.run('INSERT INTO damage_log (warehouse_id, item, quantity, reason, flagged) VALUES (?, ?, ?, ?, ?)', [parseInt(req.params.id), item, quantity, reason || 'Not specified', flagged]);
    risk.calculateWarehouseRisk(parseInt(req.params.id));
    db.save();
    res.json({ success: true, flagged: flagged === 1, warning: flagged ? 'Damage ratio exceeds 3% threshold — flagged for review' : null });
});

// ═══ SHOP ROUTES ═══
app.get('/api/shops', authMiddleware, (req, res) => {
    const db = getDB();
    res.json(db.all('SELECT s.*, w.name as warehouse_name FROM shops s JOIN warehouses w ON s.warehouse_id = w.id'));
});

app.get('/api/shops/:id', authMiddleware, (req, res) => {
    const db = getDB();
    const shop = db.get('SELECT s.*, w.name as warehouse_name FROM shops s JOIN warehouses w ON s.warehouse_id = w.id WHERE s.id = ?', [parseInt(req.params.id)]);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    const forecast = risk.shortageForecast(shop.id);
    const recentTx = db.all('SELECT t.*, b.name as beneficiary_name FROM transactions t LEFT JOIN beneficiaries b ON t.beneficiary_id = b.id WHERE t.shop_id = ? ORDER BY t.timestamp DESC LIMIT 20', [parseInt(req.params.id)]);
    const riskBreakdown = risk.calculateShopRisk(shop.id);
    res.json({ ...shop, forecast: forecast?.forecasts, recentTransactions: recentTx, riskBreakdown });
});

// Lookup beneficiary by ration card number
app.get('/api/beneficiaries/lookup', authMiddleware, roleGuard('super_admin', 'shop_dealer'), (req, res) => {
    const db = getDB();
    const { ration_card, card_type } = req.query;
    if (!ration_card) return res.status(400).json({ error: 'Ration card number required' });
    let query = `SELECT b.*, c.code as card_code, c.name as card_name
                 FROM beneficiaries b JOIN card_types c ON b.card_type_id = c.id
                 WHERE b.ration_card_number = ?`;
    const params = [ration_card.trim().toUpperCase()];
    if (card_type) {
        query += ' AND c.code = ?';
        params.push(card_type);
    }
    const beneficiary = db.get(query, params);
    if (!beneficiary) return res.status(404).json({ error: 'Beneficiary not found. Please check the ration card number.' });
    res.json(beneficiary);
});

app.post('/api/shops/:id/transaction', authMiddleware, roleGuard('super_admin', 'shop_dealer'), (req, res) => {
    const db = getDB();
    const { beneficiaryId, item, quantity, price } = req.body;
    if (!beneficiaryId || !item || !quantity || quantity <= 0 || price === undefined) return res.status(400).json({ error: 'All fields required' });
    const validItems = ['rice', 'wheat', 'sugar'];
    if (!validItems.includes(item)) return res.status(400).json({ error: 'Invalid item type' });
    const shop = db.get('SELECT * FROM shops WHERE id = ?', [parseInt(req.params.id)]);
    const beneficiary = db.get('SELECT b.*, c.code as card_code, c.name as card_name FROM beneficiaries b JOIN card_types c ON b.card_type_id = c.id WHERE b.id = ?', [parseInt(beneficiaryId)]);
    if (!shop || !beneficiary) return res.status(404).json({ error: 'Shop or beneficiary not found' });
    if (shop.is_open === 0) return res.status(403).json({ error: 'This shop is currently CLOSED. Transactions are not allowed.' });

    const violations = [];
    if (shop[`${item}_stock`] < quantity) {
        db.run('UPDATE shops SET stock_out_flags = stock_out_flags + 1 WHERE id = ?', [shop.id]);
        violations.push('artificial_stockout');
    }
    const remainingCol = `monthly_remaining_${item}`;
    if (beneficiary[remainingCol] !== undefined && beneficiary[remainingCol] !== null && quantity > beneficiary[remainingCol]) {
        return res.status(400).json({ error: `Exceeds monthly entitlement. Remaining: ${beneficiary[remainingCol]}kg for ${item}`, violation: 'entitlement_exceeded' });
    }

    // Look up official price from admin-managed pricing table
    const priceRow = db.get('SELECT price FROM official_prices WHERE item = ? AND card_code = ?', [item, beneficiary.card_code]);
    const officialPrice = priceRow ? priceRow.price : (item === 'rice' ? 4 : item === 'wheat' ? 3 : 13.50);

    if (price > officialPrice) {
        violations.push('overpricing');
        db.run('UPDATE shops SET price_violation_flags = price_violation_flags + 1 WHERE id = ?', [shop.id]);
    }
    const now = new Date();
    const hour = now.getHours();
    const openHour = parseInt(shop.open_time.split(':')[0]);
    const closeHour = parseInt(shop.close_time.split(':')[0]);
    if (hour < openHour || hour >= closeHour) {
        violations.push('after_hours');
        db.run('UPDATE shops SET afterhours_flags = afterhours_flags + 1 WHERE id = ?', [shop.id]);
    }
    if (beneficiary[remainingCol] !== undefined && beneficiary[remainingCol] !== null && quantity < beneficiary[remainingCol] * 0.3 && beneficiary[remainingCol] > 3) {
        violations.push('partial_allocation_anomaly');
        db.run('UPDATE shops SET partial_alloc_flags = partial_alloc_flags + 1 WHERE id = ?', [shop.id]);
    }

    const violationFlag = violations.length > 0 ? 1 : 0;
    const totalAmount = Math.round(quantity * officialPrice * 100) / 100;
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const billCount = db.get('SELECT COUNT(*) as c FROM transactions WHERE shop_id = ? AND DATE(timestamp) = DATE(?)', [shop.id, now.toISOString()]).c || 0;
    const billNumber = `BILL-${shop.id}-${dateStr}-${String(billCount + 1).padStart(3, '0')}`;

    db.run('INSERT INTO transactions (shop_id, beneficiary_id, item, quantity, price, official_price, total_amount, bill_number, card_type, violation_flag, violation_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [shop.id, parseInt(beneficiaryId), item, quantity, officialPrice, officialPrice, totalAmount, billNumber, beneficiary.card_code, violationFlag, violations.join(',') || null]);

    if (!violations.includes('artificial_stockout')) {
        db.run(`UPDATE shops SET ${item}_stock = ${item}_stock - ? WHERE id = ?`, [quantity, shop.id]);
    }
    if (beneficiary[remainingCol] !== undefined && beneficiary[remainingCol] !== null) {
        db.run(`UPDATE beneficiaries SET ${remainingCol} = ${remainingCol} - ? WHERE id = ?`, [quantity, parseInt(beneficiaryId)]);
    }
    if (violationFlag) {
        db.run('UPDATE shops SET violation_count = violation_count + 1 WHERE id = ?', [shop.id]);
    }
    const riskResult = risk.calculateShopRisk(shop.id);
    db.save();
    res.json({ success: true, billNumber, totalAmount, violations, violationFlag, officialPrice, chargedPrice: officialPrice, newRiskScore: riskResult.riskScore, warning: violations.length > 0 ? `⚠ Violations detected: ${violations.join(', ')}` : null });
});

// ═══ BENEFICIARY ROUTES ═══
app.get('/api/beneficiaries', authMiddleware, (req, res) => {
    const db = getDB();
    const shopId = req.query.shop_id;
    let rows;
    if (shopId) {
        rows = db.all('SELECT b.*, c.code as card_code, c.name as card_name, s.name as shop_name FROM beneficiaries b JOIN card_types c ON b.card_type_id = c.id JOIN shops s ON b.shop_id = s.id WHERE b.shop_id = ?', [parseInt(shopId)]);
    } else {
        rows = db.all('SELECT b.*, c.code as card_code, c.name as card_name, s.name as shop_name FROM beneficiaries b JOIN card_types c ON b.card_type_id = c.id JOIN shops s ON b.shop_id = s.id');
    }
    res.json(rows);
});

app.get('/api/beneficiaries/:id', authMiddleware, (req, res) => {
    const db = getDB();
    const b = db.get('SELECT b.*, c.code as card_code, c.name as card_name, s.name as shop_name FROM beneficiaries b JOIN card_types c ON b.card_type_id = c.id JOIN shops s ON b.shop_id = s.id WHERE b.id = ?', [parseInt(req.params.id)]);
    if (!b) return res.status(404).json({ error: 'Beneficiary not found' });
    const txHistory = db.all('SELECT * FROM transactions WHERE beneficiary_id = ? ORDER BY timestamp DESC', [parseInt(req.params.id)]);
    res.json({ ...b, transactions: txHistory });
});

// ═══ COMPLAINT ROUTES ═══
app.get('/api/complaints', authMiddleware, (req, res) => {
    const db = getDB();
    const shopId = req.query.shop_id;
    let rows;
    if (shopId) {
        rows = db.all('SELECT c.*, s.name as shop_name FROM complaints c JOIN shops s ON c.shop_id = s.id WHERE c.shop_id = ? ORDER BY c.created_at DESC', [parseInt(shopId)]);
    } else {
        rows = db.all('SELECT c.*, s.name as shop_name FROM complaints c JOIN shops s ON c.shop_id = s.id ORDER BY c.created_at DESC');
    }
    res.json(rows);
});

app.post('/api/complaints', authMiddleware, (req, res) => {
    const db = getDB();
    const { shopId, text, citizenName } = req.body;
    if (!shopId || !text) return res.status(400).json({ error: 'Shop and complaint text required' });
    const lowerText = text.toLowerCase();
    let category = 'general', urgency = 'medium';
    if (lowerText.includes('black') || lowerText.includes('divert') || lowerText.includes('selling outside')) { category = 'diversion_alert'; urgency = 'critical'; }
    else if (lowerText.includes('extra') || lowerText.includes('overpric') || lowerText.includes('more money') || lowerText.includes('charging')) { category = 'pricing_violation'; urgency = 'high'; }
    else if (lowerText.includes('stock') || lowerText.includes('available') || lowerText.includes('empty') || lowerText.includes('no ration')) { category = 'artificial_shortage'; urgency = 'high'; }
    else if (lowerText.includes('less') || lowerText.includes('short') || lowerText.includes('not enough') || lowerText.includes('reduced')) { category = 'allocation_issue'; urgency = 'medium'; }
    else if (lowerText.includes('closed') || lowerText.includes('shut') || lowerText.includes('not open') || lowerText.includes('timing')) { category = 'operational_issue'; urgency = 'medium'; }

    const result = db.run('INSERT INTO complaints (shop_id, citizen_id, citizen_name, text, category, urgency) VALUES (?, ?, ?, ?, ?, ?)',
        [parseInt(shopId), req.user.id, citizenName || req.user.name, text, category, urgency]);
    risk.calculateShopRisk(parseInt(shopId));
    db.save();
    res.json({ success: true, id: result.lastInsertRowid, category, urgency });
});

// ═══ ANALYTICS ROUTES ═══
app.get('/api/analytics/shortage', authMiddleware, (req, res) => {
    const db = getDB();
    const shops = db.all('SELECT id FROM shops');
    res.json(shops.map(s => risk.shortageForecast(s.id)));
});

app.get('/api/analytics/diversion', authMiddleware, (req, res) => {
    const db = getDB();
    const shops = db.all('SELECT id FROM shops');
    res.json(shops.map(s => risk.diversionProbabilityIndex(s.id)));
});

app.get('/api/analytics/restock', authMiddleware, (req, res) => {
    const db = getDB();
    const shops = db.all('SELECT id FROM shops');
    res.json(shops.map(s => risk.restockRecommendation(s.id)));
});

app.get('/api/analytics/consumption', authMiddleware, (req, res) => {
    const db = getDB();
    res.json(db.all('SELECT DATE(timestamp) as date, item, SUM(quantity) as total FROM transactions GROUP BY DATE(timestamp), item ORDER BY date'));
});

// ═══ RISK ROUTES ═══
app.get('/api/risk-scores', authMiddleware, (req, res) => {
    const db = getDB();
    const shops = db.all('SELECT id, name, district, risk_score, violation_count FROM shops ORDER BY risk_score DESC');
    const shopDetails = shops.map(s => ({ ...s, breakdown: risk.calculateShopRisk(s.id).breakdown }));
    res.json({ weights: risk.WEIGHTS, shops: shopDetails });
});

// ═══ REPORT ROUTES ═══
app.get('/api/reports/:shopId', authMiddleware, (req, res) => {
    const db = getDB();
    const shopId = parseInt(req.params.shopId);
    const shop = db.get('SELECT s.*, w.name as warehouse_name FROM shops s JOIN warehouses w ON s.warehouse_id = w.id WHERE s.id = ?', [shopId]);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    const allocation = db.all('SELECT item, SUM(quantity) as total FROM warehouse_dispatch_log WHERE shop_id = ? GROUP BY item', [shopId]);
    const distribution = db.all('SELECT item, SUM(quantity) as total, card_type FROM transactions WHERE shop_id = ? GROUP BY item, card_type', [shopId]);
    const violations = db.all("SELECT violation_type, COUNT(*) as count FROM transactions WHERE shop_id = ? AND violation_flag = 1 GROUP BY violation_type", [shopId]);
    const complaints = db.all('SELECT category, COUNT(*) as count, urgency FROM complaints WHERE shop_id = ? GROUP BY category', [shopId]);
    const damages = db.all('SELECT item, SUM(quantity) as total, SUM(flagged) as flagged_count FROM damage_log WHERE shop_id = ? GROUP BY item', [shopId]);
    const riskBreakdown = risk.calculateShopRisk(shopId);
    const restock = risk.restockRecommendation(shopId);
    res.json({ shop, allocation, distribution, violations, complaints, damages, riskBreakdown, restock: restock?.recommendations, generatedAt: new Date().toISOString() });
});

// ═══ SUPPLY CHAIN ROUTES ═══
app.get('/api/supply-chain/logs', authMiddleware, (req, res) => {
    const db = getDB();
    const dispatches = db.all('SELECT d.*, w.name as warehouse_name, s.name as shop_name FROM warehouse_dispatch_log d JOIN warehouses w ON d.warehouse_id = w.id JOIN shops s ON d.shop_id = s.id ORDER BY d.timestamp DESC LIMIT 50');
    const transactions = db.all('SELECT t.*, s.name as shop_name, b.name as beneficiary_name FROM transactions t JOIN shops s ON t.shop_id = s.id LEFT JOIN beneficiaries b ON t.beneficiary_id = b.id ORDER BY t.timestamp DESC LIMIT 50');
    const inbound = db.all('SELECT i.*, w.name as warehouse_name FROM warehouse_inbound_log i JOIN warehouses w ON i.warehouse_id = w.id ORDER BY i.timestamp DESC LIMIT 50');
    const warehouses = db.all('SELECT * FROM warehouses').map(w => ({
        id: w.id, name: w.name,
        rice: { received: w.rice_received, dispatched: w.rice_dispatched, damaged: w.rice_damaged, closing: w.rice_received - w.rice_dispatched - w.rice_damaged },
        wheat: { received: w.wheat_received, dispatched: w.wheat_dispatched, damaged: w.wheat_damaged, closing: w.wheat_received - w.wheat_dispatched - w.wheat_damaged },
        sugar: { received: w.sugar_received, dispatched: w.sugar_dispatched, damaged: w.sugar_damaged, closing: w.sugar_received - w.sugar_dispatched - w.sugar_damaged }
    }));
    const shops = db.all('SELECT id, name, rice_stock, wheat_stock, sugar_stock, risk_score FROM shops');
    res.json({ inbound, dispatches, transactions, warehouses, shops });
});

// ═══ PUBLIC ROUTES ═══
app.get('/api/public/shops', (req, res) => {
    const db = getDB();
    const shops = db.all('SELECT id, name, district, rice_stock, wheat_stock, sugar_stock, rice_price_white, rice_price_yellow, wheat_price, sugar_price, risk_score, is_open, open_time, close_time FROM shops');
    res.json(shops.map(s => ({ ...s, forecast: risk.shortageForecast(s.id)?.forecasts })));
});

app.get('/api/public/prices', (req, res) => {
    const db = getDB();
    const prices = db.all('SELECT * FROM official_prices ORDER BY item, card_code');
    const grouped = {};
    prices.forEach(p => {
        if (!grouped[p.item]) grouped[p.item] = {};
        grouped[p.item][p.card_code] = p.price;
    });
    grouped.rice = grouped.rice || { White: 4, Pink: 4, Yellow: 2 };
    grouped.wheat = grouped.wheat || { White: 3, Pink: 3, Yellow: 3 };
    grouped.sugar = grouped.sugar || { White: 13.50, Pink: 13.50, Yellow: 13.50 };
    grouped.rice.unit = '₹/kg'; grouped.wheat.unit = '₹/kg'; grouped.sugar.unit = '₹/kg';
    res.json(grouped);
});

// ═══ ADMIN PRICING ROUTES ═══
app.get('/api/admin/pricing', authMiddleware, roleGuard('super_admin'), (req, res) => {
    const db = getDB();
    res.json(db.all('SELECT * FROM official_prices ORDER BY item, card_code'));
});

app.put('/api/admin/pricing', authMiddleware, roleGuard('super_admin'), (req, res) => {
    const db = getDB();
    const { item, card_code, price } = req.body;
    if (!item || !card_code || price === undefined || price < 0) return res.status(400).json({ error: 'Invalid parameters' });
    const existing = db.get('SELECT * FROM official_prices WHERE item = ? AND card_code = ?', [item, card_code]);
    if (existing) {
        db.run('UPDATE official_prices SET price = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE item = ? AND card_code = ?', [price, req.user.id, item, card_code]);
    } else {
        db.run('INSERT INTO official_prices (item, card_code, price, updated_by) VALUES (?, ?, ?, ?)', [item, card_code, price, req.user.id]);
    }
    db.save();
    res.json({ success: true, message: `Price updated: ${item} (${card_code}) = ₹${price}/kg` });
});

// ═══ ADMIN COMPLAINTS ═══
app.put('/api/complaints/:id/status', authMiddleware, roleGuard('super_admin'), (req, res) => {
    const db = getDB();
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status required' });
    db.run('UPDATE complaints SET status = ? WHERE id = ?', [status, parseInt(req.params.id)]);
    db.save();
    res.json({ success: true });
});

// ═══ CITIZEN ORDER & BILL ROUTES ═══
app.get('/api/citizen/orders', authMiddleware, (req, res) => {
    const db = getDB();
    // Find beneficiary linked to this user
    const beneficiary = db.get('SELECT * FROM beneficiaries WHERE user_id = ?', [req.user.id]);
    if (!beneficiary) {
        // Return all transactions if super_admin, else empty
        if (req.user.role === 'super_admin') {
            return res.json(db.all('SELECT t.*, s.name as shop_name, b.name as beneficiary_name FROM transactions t JOIN shops s ON t.shop_id = s.id LEFT JOIN beneficiaries b ON t.beneficiary_id = b.id ORDER BY t.timestamp DESC LIMIT 50'));
        }
        return res.json([]);
    }
    const orders = db.all('SELECT t.*, s.name as shop_name, b.name as beneficiary_name FROM transactions t JOIN shops s ON t.shop_id = s.id LEFT JOIN beneficiaries b ON t.beneficiary_id = b.id WHERE t.beneficiary_id = ? ORDER BY t.timestamp DESC', [beneficiary.id]);
    res.json(orders);
});

app.get('/api/citizen/bill/:txId', authMiddleware, (req, res) => {
    const db = getDB();
    const tx = db.get('SELECT t.*, s.name as shop_name, s.district as shop_district, b.name as beneficiary_name, c.name as card_name, c.code as card_code FROM transactions t JOIN shops s ON t.shop_id = s.id LEFT JOIN beneficiaries b ON t.beneficiary_id = b.id LEFT JOIN card_types c ON b.card_type_id = c.id WHERE t.id = ?', [parseInt(req.params.txId)]);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json(tx);
});

app.get('/api/card-types', (req, res) => { const db = getDB(); res.json(db.all('SELECT * FROM card_types')); });

app.get('/api/transactions', authMiddleware, (req, res) => {
    const db = getDB();
    const shopId = req.query.shop_id;
    let rows;
    if (shopId) {
        rows = db.all('SELECT t.*, s.name as shop_name, b.name as beneficiary_name FROM transactions t JOIN shops s ON t.shop_id = s.id LEFT JOIN beneficiaries b ON t.beneficiary_id = b.id WHERE t.shop_id = ? ORDER BY t.timestamp DESC LIMIT 100', [parseInt(shopId)]);
    } else {
        rows = db.all('SELECT t.*, s.name as shop_name, b.name as beneficiary_name FROM transactions t JOIN shops s ON t.shop_id = s.id LEFT JOIN beneficiaries b ON t.beneficiary_id = b.id ORDER BY t.timestamp DESC LIMIT 100');
    }
    res.json(rows);
});

// ═══ COMMODITY MASTER ═══
app.get('/api/commodities', (req, res) => {
    const db = getDB();
    const now = new Date().toISOString().slice(0, 10);
    const commodities = db.all('SELECT * FROM commodity_master ORDER BY id');
    commodities.forEach(c => {
        if (c.seasonal_flag && c.active_from_date && c.active_to_date) {
            c.currently_active = (now >= c.active_from_date && now <= c.active_to_date) ? 1 : 0;
        } else { c.currently_active = c.active; }
    });
    res.json(commodities);
});

// ═══ QR BATCH TRACEABILITY ═══
app.get('/api/batches', authMiddleware, roleGuard('super_admin', 'warehouse_manager', 'shop_dealer'), (req, res) => {
    const db = getDB();
    const { status, warehouse_id, shop_id } = req.query;
    let q = 'SELECT b.*, w.name as warehouse_name, s.name as shop_name, f.name as farmer_name FROM batches b LEFT JOIN warehouses w ON b.warehouse_id = w.id LEFT JOIN shops s ON b.shop_id = s.id LEFT JOIN farmers f ON b.farmer_id = f.id';
    const params = [];
    const conditions = [];
    if (status) { conditions.push('b.status = ?'); params.push(status); }
    if (warehouse_id) { conditions.push('b.warehouse_id = ?'); params.push(parseInt(warehouse_id)); }
    if (shop_id) { conditions.push('b.shop_id = ?'); params.push(parseInt(shop_id)); }
    if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
    q += ' ORDER BY b.created_at DESC LIMIT 100';
    res.json(db.all(q, params));
});

app.post('/api/batches/create', authMiddleware, roleGuard('super_admin', 'warehouse_manager'), (req, res) => {
    const db = getDB();
    const { commodity, weight, shop_id, farmer_id, moisture_level, warehouse_id: wh_override } = req.body;
    if (!commodity || !weight || !shop_id) return res.status(400).json({ error: 'commodity, weight, shop_id required' });
    const u = db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const warehouse_id = req.user.role === 'super_admin' ? (parseInt(wh_override) || 1) : (u && u.linked_warehouse_id ? u.linked_warehouse_id : 1);
    const ts = Date.now();
    const batch_id = 'QR-' + warehouse_id + '-' + ts;
    const payload = batch_id + '|' + commodity + '|' + weight + '|' + shop_id + '|' + warehouse_id;
    const hash = require('crypto').createHmac('sha256', 'trustchain-qr-secret-2026').update(payload).digest('hex');
    const qr_data = JSON.stringify({ batch_id, commodity, weight: parseFloat(weight), shop_id: parseInt(shop_id), warehouse_id: parseInt(warehouse_id), hash });
    db.run('INSERT INTO batches (batch_id, commodity, weight, warehouse_id, shop_id, farmer_id, moisture_level, status, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [batch_id, commodity, parseFloat(weight), parseInt(warehouse_id), parseInt(shop_id), farmer_id ? parseInt(farmer_id) : null, parseFloat(moisture_level || 0), 'DISPATCHED', hash]);
    db.run('INSERT INTO scans (batch_id, scan_type, scanned_by, location) VALUES (?, ?, ?, ?)', [batch_id, 'DISPATCH', req.user.id, 'Warehouse']);
    db.save();
    res.json({ success: true, batch_id, qr_data, hash, message: 'Batch created and dispatched' });
});

app.post('/api/batches/:batchId/scan', authMiddleware, (req, res) => {
    const db = getDB();
    const { batchId } = req.params;
    const { scan_type, location, qr_payload } = req.body;
    const batch = db.get('SELECT * FROM batches WHERE batch_id = ?', [batchId]);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    if (qr_payload) {
        try {
            const parsed = JSON.parse(qr_payload);
            const payload = parsed.batch_id + '|' + parsed.commodity + '|' + parsed.weight + '|' + parsed.shop_id + '|' + parsed.warehouse_id;
            const expectedHash = require('crypto').createHmac('sha256', 'trustchain-qr-secret-2026').update(payload).digest('hex');
            if (parsed.hash !== expectedHash || parsed.hash !== batch.hash) {
                db.run("INSERT INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)",
                    ['QR_MISMATCH', 'critical', 'batch', batch.id, 'QR hash mismatch for batch ' + batchId + ' at ' + (location || 'unknown')]);
                db.run('UPDATE shops SET risk_score = MIN(100, risk_score + 15) WHERE id = ?', [batch.shop_id]);
                db.save();
                return res.status(400).json({ error: 'QR validation failed – hash mismatch. Alert raised.' });
            }
        } catch (e) { return res.status(400).json({ error: 'Invalid QR payload' }); }
    }
    const existingScan = db.get('SELECT * FROM scans WHERE batch_id = ? AND scan_type = ?', [batchId, scan_type]);
    if (existingScan) {
        db.run("INSERT INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)",
            ['DUPLICATE_SCAN', 'high', 'batch', batch.id, 'Duplicate ' + scan_type + ' scan for batch ' + batchId]);
        db.save();
        return res.status(400).json({ error: 'Duplicate scan detected. Alert raised.' });
    }
    db.run('INSERT INTO scans (batch_id, scan_type, scanned_by, location) VALUES (?, ?, ?, ?)', [batchId, scan_type, req.user.id, location || '']);
    const statusMap = { DISPATCH: 'DISPATCHED', RECEIVE: 'RECEIVED', DISTRIBUTE: 'DISTRIBUTED' };
    if (statusMap[scan_type]) {
        if (scan_type === 'RECEIVE') {
            db.run("UPDATE batches SET status=?, received_at=datetime('now') WHERE batch_id=?", [statusMap[scan_type], batchId]);
        } else {
            db.run('UPDATE batches SET status=? WHERE batch_id=?', [statusMap[scan_type], batchId]);
        }
    }
    db.save();
    res.json({ success: true, batch_id: batchId, new_status: statusMap[scan_type] || batch.status, scan_type });
});

app.get('/api/scans', authMiddleware, roleGuard('super_admin', 'warehouse_manager'), (req, res) => {
    const db = getDB();
    res.json(db.all('SELECT s.*, u.name as scanned_by_name FROM scans s LEFT JOIN users u ON s.scanned_by = u.id ORDER BY s.timestamp DESC LIMIT 200'));
});

// ═══ AFTER-HOURS MONITORING ═══
app.get('/api/activity-logs', authMiddleware, roleGuard('super_admin', 'shop_dealer'), (req, res) => {
    const db = getDB();
    const shopId = req.query.shop_id;
    const q = shopId
        ? 'SELECT a.*, s.name as shop_name FROM shop_activity_logs a JOIN shops s ON a.shop_id=s.id WHERE a.shop_id=? ORDER BY a.timestamp DESC LIMIT 100'
        : 'SELECT a.*, s.name as shop_name FROM shop_activity_logs a JOIN shops s ON a.shop_id=s.id ORDER BY a.timestamp DESC LIMIT 100';
    res.json(db.all(q, shopId ? [parseInt(shopId)] : []));
});

app.post('/api/activity-logs', authMiddleware, roleGuard('super_admin', 'shop_dealer'), (req, res) => {
    const db = getDB();
    const { shop_id, event_type, risk_impact } = req.body;
    if (!shop_id || !event_type) return res.status(400).json({ error: 'shop_id and event_type required' });
    const impact = parseInt(risk_impact || 5);
    db.run('INSERT INTO shop_activity_logs (shop_id, event_type, risk_impact) VALUES (?, ?, ?)', [parseInt(shop_id), event_type, impact]);
    db.run("INSERT INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)",
        [event_type, impact > 8 ? 'high' : 'medium', 'shop', parseInt(shop_id), event_type + ' detected at shop #' + shop_id]);
    db.run('UPDATE shops SET risk_score = MIN(100, risk_score + ?) WHERE id = ?', [impact, parseInt(shop_id)]);
    db.save();
    res.json({ success: true });
});

// ═══ FARMERS ═══
app.get('/api/farmers', authMiddleware, roleGuard('super_admin', 'warehouse_manager', 'farmer'), (req, res) => {
    res.json(getDB().all('SELECT * FROM farmers ORDER BY id'));
});

app.get('/api/farmers/:id', authMiddleware, roleGuard('super_admin', 'warehouse_manager', 'farmer'), (req, res) => {
    const db = getDB();
    const farmer = db.get('SELECT * FROM farmers WHERE id = ?', [parseInt(req.params.id)]);
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });
    const transactions = db.all('SELECT * FROM farmer_transactions WHERE farmer_id = ? ORDER BY created_at DESC', [parseInt(req.params.id)]);
    const stats = {
        total_supplied: transactions.reduce((s, t) => s + (t.quantity || 0), 0),
        accepted: transactions.reduce((s, t) => s + (t.accepted_quantity || 0), 0),
        rejected: transactions.reduce((s, t) => s + (t.rejected_quantity || 0), 0),
        paid_count: transactions.filter(t => t.payment_status === 'PAID').length,
        pending_count: transactions.filter(t => t.payment_status === 'PENDING').length,
    };
    res.json({ ...farmer, transactions, stats });
});

app.post('/api/farmers/:id/supply', authMiddleware, roleGuard('super_admin', 'warehouse_manager'), (req, res) => {
    const db = getDB();
    const { quantity, accepted_quantity, rejected_quantity, moisture_level, rate_per_kg, batch_id } = req.body;
    const farmerId = parseInt(req.params.id);
    const farmer = db.get('SELECT * FROM farmers WHERE id = ?', [farmerId]);
    if (!farmer) return res.status(404).json({ error: 'Farmer not found' });
    const accepted = parseFloat(accepted_quantity || quantity);
    const rejected = parseFloat(rejected_quantity || 0);
    const rate = parseFloat(rate_per_kg || 28);
    const payment = accepted * rate;
    db.run('INSERT INTO farmer_transactions (farmer_id, batch_id, quantity, accepted_quantity, rejected_quantity, moisture_level, rate_per_kg, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [farmerId, batch_id || null, parseFloat(quantity), accepted, rejected, parseFloat(moisture_level || 0), rate, 'PENDING']);
    db.run('UPDATE farmers SET total_supplied = total_supplied + ?, pending_amount = pending_amount + ? WHERE id = ?', [parseFloat(quantity), payment, farmerId]);
    if (parseFloat(moisture_level) > 14) {
        db.run("INSERT INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)",
            ['MOISTURE_ANOMALY', 'medium', 'farmer', farmerId, 'Moisture ' + moisture_level + '% exceeds 14% threshold for ' + farmer.name]);
    }
    db.save();
    res.json({ success: true, payment_due: payment });
});

app.post('/api/farmers/:id/pay', authMiddleware, roleGuard('super_admin'), (req, res) => {
    const db = getDB();
    const { transaction_ids } = req.body;
    const farmerId = parseInt(req.params.id);
    if (transaction_ids && transaction_ids.length) {
        transaction_ids.forEach(tid => {
            const tx = db.get('SELECT * FROM farmer_transactions WHERE id = ? AND farmer_id = ?', [parseInt(tid), farmerId]);
            if (tx && tx.payment_status === 'PENDING') {
                const amount = (tx.accepted_quantity || 0) * (tx.rate_per_kg || 0);
                db.run("UPDATE farmer_transactions SET payment_status='PAID', payment_date=datetime('now') WHERE id=?", [parseInt(tid)]);
                db.run('UPDATE farmers SET total_paid = total_paid + ?, pending_amount = MAX(0, pending_amount - ?) WHERE id = ?', [amount, amount, farmerId]);
            }
        });
    }
    db.save();
    res.json({ success: true });
});

app.get('/api/farmer/me', authMiddleware, roleGuard('farmer'), (req, res) => {
    const db = getDB();
    const farmer = db.get('SELECT * FROM farmers WHERE user_id = ?', [req.user.id]);
    if (!farmer) return res.status(404).json({ error: 'Farmer profile not found' });
    const transactions = db.all('SELECT * FROM farmer_transactions WHERE farmer_id = ? ORDER BY created_at DESC', [farmer.id]);
    const daysSince = transactions.length ? Math.floor((Date.now() - new Date(transactions[0].created_at).getTime()) / 86400000) : null;
    res.json({ ...farmer, transactions, days_since_supply: daysSince });
});

// ═══ ADMIN ALERTS ═══
app.get('/api/admin/alerts', authMiddleware, roleGuard('super_admin'), (req, res) => {
    res.json(getDB().all('SELECT * FROM admin_alerts ORDER BY created_at DESC LIMIT 100'));
});

app.post('/api/admin/alerts/:id/resolve', authMiddleware, roleGuard('super_admin'), (req, res) => {
    const db = getDB();
    db.run('UPDATE admin_alerts SET resolved = 1 WHERE id = ?', [parseInt(req.params.id)]);
    db.save();
    res.json({ success: true });
});


// ═══ V3 FEATURE ROUTES ═══

// ─── Feature 1: Dealer Open/Close Status ───
app.put('/api/shops/:id/status', authMiddleware, roleGuard('super_admin', 'shop_dealer'), (req, res) => {
    const db = getDB();
    const shopId = parseInt(req.params.id);
    const shop = db.get('SELECT * FROM shops WHERE id = ?', [shopId]);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    // Dealers can only change their own shop
    if (req.user.role === 'shop_dealer' && req.user.linked_shop_id !== shopId)
        return res.status(403).json({ error: 'Access denied – not your shop' });
    const newStatus = shop.is_open === 1 ? 0 : 1;
    const { reason } = req.body;
    db.run('UPDATE shops SET is_open = ? WHERE id = ?', [newStatus, shopId]);
    db.run('INSERT INTO shop_status_log (shop_id, changed_by, old_status, new_status, reason) VALUES (?, ?, ?, ?, ?)',
        [shopId, req.user.id, shop.is_open, newStatus, reason || null]);
    // Create admin alert if dealer closed during business hours
    const hour = new Date().getHours();
    if (newStatus === 0 && hour >= 8 && hour < 17) {
        db.run("INSERT INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)",
            ['SHOP_CLOSED_HOURS', 'medium', 'shop', shopId, shop.name + ' closed during business hours by dealer']);
    }
    db.save();
    res.json({ success: true, is_open: newStatus, message: newStatus === 1 ? 'Shop is now OPEN' : 'Shop is now CLOSED' });
});

app.get('/api/shops/:id/status-log', authMiddleware, roleGuard('super_admin', 'shop_dealer'), (req, res) => {
    const db = getDB();
    const logs = db.all(
        'SELECT sl.*, u.name as changed_by_name FROM shop_status_log sl LEFT JOIN users u ON sl.changed_by = u.id WHERE sl.shop_id = ? ORDER BY sl.timestamp DESC LIMIT 20',
        [parseInt(req.params.id)]
    );
    res.json(logs);
});

// ─── Feature 2: Family Members ───
app.get('/api/family-members', authMiddleware, (req, res) => {
    const db = getDB();
    const { ration_card } = req.query;
    if (!ration_card) return res.status(400).json({ error: 'ration_card required' });
    const members = db.all('SELECT * FROM family_members WHERE ration_card_number = ? ORDER BY id', [ration_card.trim().toUpperCase()]);
    res.json(members);
});

app.post('/api/family-members', authMiddleware, roleGuard('super_admin'), (req, res) => {
    const db = getDB();
    const { ration_card_number, name, age, relationship, aadhaar_masked } = req.body;
    if (!ration_card_number || !name || !age || !relationship) return res.status(400).json({ error: 'All fields required' });
    const masked = aadhaar_masked || 'XXXX-XXXX-0000';
    db.run('INSERT INTO family_members (ration_card_number, name, age, relationship, aadhaar_masked) VALUES (?, ?, ?, ?, ?)',
        [ration_card_number.toUpperCase(), name, age, relationship, masked]);
    db.save();
    res.json({ success: true });
});

// ─── Feature 3: Farmer Supply Input + Auto Restock ───
app.post('/api/farmer/supply', authMiddleware, roleGuard('super_admin', 'farmer'), (req, res) => {
    const db = getDB();
    const { commodity, quantity, moisture_level, gross_weight, tare_weight } = req.body;
    if (!commodity || !quantity || quantity <= 0) return res.status(400).json({ error: 'Invalid supply data' });
    const grossWeight = parseFloat(gross_weight) || quantity;
    const tareWeight = parseFloat(tare_weight) || 0;

    // Find farmer record
    const farmer = db.get('SELECT * FROM farmers WHERE user_id = ?', [req.user.id]) ||
        db.get('SELECT * FROM farmers LIMIT 1'); // fallback for admin testing
    if (!farmer) return res.status(404).json({ error: 'Farmer record not found' });

    const moistureLevel = parseFloat(moisture_level) || 0;
    const accepted = moistureLevel > 14 ? quantity * 0.85 : quantity;
    const rejected = quantity - accepted;
    const commodityData = db.get('SELECT * FROM commodity_master WHERE code = ?', [commodity]);
    const ratePerKg = commodityData ? commodityData.government_price : 4;
    const crypto = require('crypto');
    const QR_SECRET = process.env.QR_SECRET || 'trustchain-qr-secret-2026';

    // Create farmer transaction
    db.run('INSERT INTO farmer_transactions (farmer_id, quantity, accepted_quantity, rejected_quantity, moisture_level, rate_per_kg, payment_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"))',
        [farmer.id, quantity, accepted, rejected, moistureLevel, ratePerKg, 'PENDING']);

    // Update farmer totals
    const earned = accepted * ratePerKg;
    db.run('UPDATE farmers SET total_supplied = total_supplied + ?, pending_amount = pending_amount + ? WHERE id = ?',
        [quantity, earned, farmer.id]);

    // Add stock to farmer's linked warehouse (warehouse_id 1 default for farmer's region)
    const warehouseId = req.user.linked_warehouse_id || 1;
    db.run(`UPDATE warehouses SET ${commodity}_received = ${commodity}_received + ? WHERE id = ?`, [accepted, warehouseId]);

    // Generate QR batch
    const batchId = 'QR-FARM-' + Date.now();
    const hash = crypto.createHmac('sha256', QR_SECRET).update(batchId + commodity + accepted).digest('hex');
    const shopResult = db.get('SELECT id FROM shops WHERE warehouse_id = ? ORDER BY rice_stock ASC LIMIT 1', [warehouseId]);
    const targetShopId = shopResult ? shopResult.id : 1;
    db.run('INSERT INTO batches (batch_id, commodity, weight, warehouse_id, shop_id, farmer_id, moisture_level, status, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [batchId, commodity, accepted, warehouseId, targetShopId, farmer.id, moistureLevel, 'CREATED', hash]);

    // Moisture alert
    if (moistureLevel > 14) {
        db.run("INSERT INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)",
            ['MOISTURE_ANOMALY', 'medium', 'farmer', farmer.id,
                farmer.name + ': moisture level ' + moistureLevel + '% exceeds threshold (14%) – partial rejection']);
    }

    // Auto low-stock restock: check all shops under this warehouse
    const shops = db.all('SELECT * FROM shops WHERE warehouse_id = ?', [warehouseId]);
    const autoRestocks = [];
    shops.forEach(shop => {
        const txAvg = db.get(
            'SELECT AVG(quantity) as avg FROM transactions WHERE shop_id = ? AND timestamp >= datetime("now","-30 days")',
            [shop.id]);
        const avgDaily = (txAvg && txAvg.avg) ? txAvg.avg * 0.3 : 10;
        const threshold = avgDaily * 3;
        const stock = shop[commodity + '_stock'] || 0;
        if (stock < threshold) {
            const restockAmt = Math.min(500, accepted * 0.3);
            db.run(`UPDATE shops SET ${commodity}_stock = ${commodity}_stock + ? WHERE id = ?`, [restockAmt, shop.id]);
            db.run(`UPDATE warehouses SET ${commodity}_dispatched = ${commodity}_dispatched + ? WHERE id = ?`, [restockAmt, warehouseId]);
            const restockBatch = 'AUTO-RESTOCK-' + Date.now() + '-' + shop.id;
            db.run('INSERT INTO warehouse_dispatch_log (warehouse_id, shop_id, item, quantity, batch_id) VALUES (?, ?, ?, ?, ?)',
                [warehouseId, shop.id, commodity, restockAmt, restockBatch]);
            autoRestocks.push({ shop: shop.name, qty: restockAmt });
        }
    });

    db.save();
    res.json({ success: true, batch_id: batchId, hash: hash.substring(0, 16), accepted, rejected, earned, autoRestocks, gross_weight: grossWeight, tare_weight: tareWeight, net_quantity: quantity });
});

// ─── Feature 4: Forgot Password ───
app.post('/api/auth/forgot-password', (req, res) => {
    const db = getDB();
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = db.get('SELECT id, name, email FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (!user) return res.status(200).json({ message: 'If that email exists, a reset token has been generated.' });

    const crypto = require('crypto');
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Invalidate old tokens
    db.run('UPDATE password_reset_tokens SET used = 1 WHERE user_id = ? AND used = 0', [user.id]);
    db.run('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [user.id, tokenHash, expiresAt]);

    // Security event alert
    db.run("INSERT INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)",
        ['PASSWORD_RESET_REQUEST', 'low', 'user', user.id, 'Password reset requested for ' + user.email]);
    db.save();

    // In production this would be emailed; for demo we return the token directly
    res.json({ message: 'Reset token generated (demo: token returned directly).', reset_token: rawToken, expires_in: '15 minutes' });
});

app.post('/api/auth/reset-password', (req, res) => {
    const db = getDB();
    const { token, new_password } = req.body;
    if (!token || !new_password || new_password.length < 6)
        return res.status(400).json({ error: 'Valid token and new password (min 6 chars) required' });

    const crypto = require('crypto');
    const bcrypt = require('bcryptjs');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const record = db.get(
        'SELECT prt.*, u.email FROM password_reset_tokens prt JOIN users u ON prt.user_id = u.id WHERE prt.token_hash = ? AND prt.used = 0',
        [tokenHash]
    );
    if (!record) return res.status(400).json({ error: 'Invalid or expired reset token' });
    if (new Date(record.expires_at) < new Date()) {
        db.run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [record.id]);
        return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    const newHash = bcrypt.hashSync(new_password, 10);
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, record.user_id]);
    db.run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [record.id]);
    db.run("INSERT INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)",
        ['PASSWORD_RESET_DONE', 'low', 'user', record.user_id, 'Password successfully reset for ' + record.email]);
    db.save();
    res.json({ success: true, message: 'Password reset successful. Please log in with your new password.' });
});

// ─── Feature 5: Admin Alerts (extended) ───
app.get('/api/admin/alerts', authMiddleware, roleGuard('super_admin'), (req, res) => {
    const db = getDB();
    const { severity, resolved, limit } = req.query;
    let sql = 'SELECT * FROM admin_alerts WHERE 1=1';
    const params = [];
    if (severity) { sql += ' AND severity = ?'; params.push(severity); }
    if (resolved !== undefined) { sql += ' AND resolved = ?'; params.push(parseInt(resolved)); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit) || 100);
    res.json(db.all(sql, params));
});

app.post('/api/admin/alerts/:id/resolve', authMiddleware, roleGuard('super_admin'), (req, res) => {
    const db = getDB();
    db.run('UPDATE admin_alerts SET resolved = 1 WHERE id = ?', [parseInt(req.params.id)]);
    db.save();
    res.json({ success: true });
});

app.post('/api/admin/run-anomaly-check', authMiddleware, roleGuard('super_admin'), (req, res) => {
    const db = getDB();
    const now = new Date().toISOString();
    let generated = 0;

    // Check shops open but 0 transactions in last 48h
    const idleOpenShops = db.all(
        `SELECT s.id, s.name FROM shops s WHERE s.is_open = 1 AND
         (SELECT COUNT(*) FROM transactions t WHERE t.shop_id = s.id AND t.timestamp >= datetime('now','-48 hours')) = 0`
    );
    idleOpenShops.forEach(s => {
        const exists = db.get("SELECT id FROM admin_alerts WHERE entity_type='shop' AND entity_id=? AND alert_type='IDLE_OPEN_SHOP' AND resolved=0", [s.id]);
        if (!exists) {
            db.run("INSERT INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?,?,?,?,?)",
                ['IDLE_OPEN_SHOP', 'low', 'shop', s.id, s.name + ' marked OPEN but no transactions in 48h']);
            generated++;
        }
    });

    // Check negative stock
    const negativeStock = db.all('SELECT id, name, rice_stock, wheat_stock, sugar_stock FROM shops WHERE rice_stock < 0 OR wheat_stock < 0 OR sugar_stock < 0');
    negativeStock.forEach(s => {
        db.run("INSERT INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?,?,?,?,?)",
            ['NEGATIVE_STOCK', 'high', 'shop', s.id, s.name + ' has negative stock – possible data anomaly']);
        generated++;
    });

    // Check QR DISPATCHED with no RECEIVE after 48h
    const noReceive = db.all(
        `SELECT id, batch_id, shop_id FROM batches WHERE status='DISPATCHED'
         AND created_at <= datetime('now','-48 hours')
         AND batch_id NOT IN (SELECT batch_id FROM scans WHERE scan_type='RECEIVE')`
    );
    noReceive.forEach(b => {
        const exists = db.get("SELECT id FROM admin_alerts WHERE entity_type='batch' AND entity_id=? AND alert_type='QR_MISSING_RECEIVE' AND resolved=0", [b.id]);
        if (!exists) {
            db.run("INSERT INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?,?,?,?,?)",
                ['QR_MISSING_RECEIVE', 'medium', 'batch', b.id, 'Batch ' + b.batch_id + ' dispatched but no RECEIVE scan after 48h']);
            generated++;
        }
    });

    // Check farmers with pending payment > 30 days
    const delayedPayments = db.all(
        `SELECT ft.farmer_id, f.name FROM farmer_transactions ft
         JOIN farmers f ON ft.farmer_id = f.id
         WHERE ft.payment_status = 'PENDING' AND ft.created_at <= datetime('now','-30 days')`
    );
    delayedPayments.forEach(fp => {
        const exists = db.get("SELECT id FROM admin_alerts WHERE entity_type='farmer' AND entity_id=? AND alert_type='PAYMENT_DELAY_30D' AND resolved=0", [fp.farmer_id]);
        if (!exists) {
            db.run("INSERT INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?,?,?,?,?)",
                ['PAYMENT_DELAY_30D', 'high', 'farmer', fp.farmer_id, fp.name + ': payment pending >30 days']);
            generated++;
        }
    });

    db.save();
    res.json({ success: true, alerts_generated: generated, timestamp: now });
});


app.get('*', (req, res) => { if (!req.path.startsWith('/api')) res.sendFile(path.join(__dirname, 'public', 'index.html')); else res.status(404).json({ error: 'Not found' }); });

// ═══ START ═══

async function start() {
    await initializeDatabase();
    seedDatabase();
    risk.recalculateAllScores();
    app.listen(PORT, () => {
        console.log(`\n🏛  TrustChain PDS Server running at http://localhost:${PORT}`);
        console.log('📊 Database initialized with Kerala PDS data\n');
        console.log('Demo accounts:');
        console.log('  Admin:     admin@trustchain.gov.in / password123');
        console.log('  Warehouse: wh.tvm@trustchain.gov.in / password123');
        console.log('  Dealer:    dealer.kzk@trustchain.gov.in / password123');
        console.log('  Citizen:   ravi@citizen.in / password123\n');
    });
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
