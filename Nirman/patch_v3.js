// patch_v3.js – TrustChain v3 feature implementation
const fs = require('fs');

// ═══════════════════════════════════════════
// STEP 1: database.js – add 3 new tables + seed data
// ═══════════════════════════════════════════
let db = fs.readFileSync('d:/Nirman/database.js', 'utf8');

const NEW_TABLES_V3 = `
    // ─── NEW TABLES (v3 extension) ────────────────────────────
    dbHelper.exec(\`
    CREATE TABLE IF NOT EXISTS family_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ration_card_number TEXT NOT NULL,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      relationship TEXT NOT NULL,
      aadhaar_masked TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS shop_status_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      changed_by INTEGER NOT NULL,
      old_status INTEGER NOT NULL,
      new_status INTEGER NOT NULL,
      reason TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    \`);

`;

const SEED_V3 = `
    // ── V3: Family Members seed ──
    const fmSql = 'INSERT INTO family_members (ration_card_number, name, age, relationship, aadhaar_masked) VALUES (?, ?, ?, ?, ?)';
    dbHelper.run(fmSql, ['KL-TVM-1000001', 'Ravi Kumar', 42, 'Head of Family', 'XXXX-XXXX-4521']);
    dbHelper.run(fmSql, ['KL-TVM-1000001', 'Sita Kumar', 38, 'Spouse', 'XXXX-XXXX-3314']);
    dbHelper.run(fmSql, ['KL-TVM-1000001', 'Arjun Kumar', 16, 'Son', 'XXXX-XXXX-7782']);
    dbHelper.run(fmSql, ['KL-TVM-1000001', 'Priya Kumar', 12, 'Daughter', 'XXXX-XXXX-9943']);
    dbHelper.run(fmSql, ['KL-TVM-1000002', 'Lakshmi Nair', 55, 'Head of Family', 'XXXX-XXXX-1126']);
    dbHelper.run(fmSql, ['KL-TVM-1000002', 'Mohan Nair', 58, 'Spouse', 'XXXX-XXXX-5531']);
    dbHelper.run(fmSql, ['KL-TVM-1000002', 'Deepa Nair', 28, 'Daughter', 'XXXX-XXXX-8874']);
    dbHelper.run(fmSql, ['KL-EKM-2000001', 'Arun Menon', 35, 'Head of Family', 'XXXX-XXXX-6612']);
    dbHelper.run(fmSql, ['KL-EKM-2000001', 'Rekha Menon', 32, 'Spouse', 'XXXX-XXXX-2298']);
    dbHelper.run(fmSql, ['KL-EKM-2000001', 'Rohit Menon', 8, 'Son', 'XXXX-XXXX-4471']);
    dbHelper.run(fmSql, ['KL-KLM-4000001', 'Meera Das', 48, 'Head of Family', 'XXXX-XXXX-1193']);
    dbHelper.run(fmSql, ['KL-KLM-4000001', 'Samuel Das', 52, 'Spouse', 'XXXX-XXXX-8823']);
`;

// Insert new tables before "return dbHelper;"
const returnIdx = db.indexOf('    return dbHelper;\r\n}\r\n');
const returnIdx2 = db.indexOf('    return dbHelper;\n}\n');
const insertAt = returnIdx >= 0 ? returnIdx : (returnIdx2 >= 0 ? returnIdx2 : -1);

if (insertAt >= 0 && !db.includes('family_members')) {
    db = db.slice(0, insertAt) + NEW_TABLES_V3 + db.slice(insertAt);
    console.log('✅ New tables inserted into database.js');
} else if (db.includes('family_members')) {
    console.log('ℹ family_members table already exists in database.js');
} else {
    console.log('⚠ Could not find return dbHelper; in database.js');
}

// Insert seed data before "dbHelper.save();"
if (!db.includes('fmSql') && db.includes('dbHelper.save();')) {
    db = db.replace('    dbHelper.save();\r\n    console.log', SEED_V3 + '    dbHelper.save();\r\n    console.log');
    if (!db.includes('fmSql')) {
        db = db.replace('    dbHelper.save();\n    console.log', SEED_V3 + '    dbHelper.save();\n    console.log');
    }
    console.log('✅ Seed data inserted into database.js');
} else if (db.includes('fmSql')) {
    console.log('ℹ Seed data already exists');
}

fs.writeFileSync('d:/Nirman/database.js', db, 'utf8');
console.log('✅ database.js updated');

// ═══════════════════════════════════════════
// STEP 2: server.js – add all new routes
// ═══════════════════════════════════════════
let sv = fs.readFileSync('d:/Nirman/server.js', 'utf8');

// Find the catch-all / last route position – inject before it
// The v2 routes were inserted before a catch-all at end. Find it.
const catchAll = "app.get('*'";
let insertSvAt = sv.lastIndexOf(catchAll);
if (insertSvAt < 0) {
    // fallback: right before the start() function or module.exports
    insertSvAt = sv.lastIndexOf('async function start(');
    if (insertSvAt < 0) insertSvAt = sv.length;
}

// Add shop transaction block check (is_open)
if (!sv.includes('shop is currently CLOSED')) {
    sv = sv.replace(
        "    if (!shop || !beneficiary) return res.status(404).json({ error: 'Shop or beneficiary not found' });",
        "    if (!shop || !beneficiary) return res.status(404).json({ error: 'Shop or beneficiary not found' });\n    if (shop.is_open === 0) return res.status(403).json({ error: 'This shop is currently CLOSED. Transactions are not allowed.' });"
    );
    console.log('✅ Added is_open check to transaction route');
}

// Also tighten beneficiary lookup to also return family members inline 
if (!sv.includes('/api/family-members')) {
    const NEW_ROUTES = `
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
    const { commodity, quantity, moisture_level } = req.body;
    if (!commodity || !quantity || quantity <= 0) return res.status(400).json({ error: 'Invalid supply data' });

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
    db.run(\`UPDATE warehouses SET \${commodity}_received = \${commodity}_received + ? WHERE id = ?\`, [accepted, warehouseId]);

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
            db.run(\`UPDATE shops SET \${commodity}_stock = \${commodity}_stock + ? WHERE id = ?\`, [restockAmt, shop.id]);
            db.run(\`UPDATE warehouses SET \${commodity}_dispatched = \${commodity}_dispatched + ? WHERE id = ?\`, [restockAmt, warehouseId]);
            const restockBatch = 'AUTO-RESTOCK-' + Date.now() + '-' + shop.id;
            db.run('INSERT INTO warehouse_dispatch_log (warehouse_id, shop_id, item, quantity, batch_id) VALUES (?, ?, ?, ?, ?)',
                [warehouseId, shop.id, commodity, restockAmt, restockBatch]);
            autoRestocks.push({ shop: shop.name, qty: restockAmt });
        }
    });

    db.save();
    res.json({ success: true, batch_id: batchId, hash: hash.substring(0, 16), accepted, rejected, earned, autoRestocks });
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
        \`SELECT s.id, s.name FROM shops s WHERE s.is_open = 1 AND
         (SELECT COUNT(*) FROM transactions t WHERE t.shop_id = s.id AND t.timestamp >= datetime('now','-48 hours')) = 0\`
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
        \`SELECT id, batch_id, shop_id FROM batches WHERE status='DISPATCHED'
         AND created_at <= datetime('now','-48 hours')
         AND batch_id NOT IN (SELECT batch_id FROM scans WHERE scan_type='RECEIVE')\`
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
        \`SELECT ft.farmer_id, f.name FROM farmer_transactions ft
         JOIN farmers f ON ft.farmer_id = f.id
         WHERE ft.payment_status = 'PENDING' AND ft.created_at <= datetime('now','-30 days')\`
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

`;

    const insertRouteAt = sv.lastIndexOf('async function start(');
    if (insertRouteAt >= 0 && !sv.includes('/api/family-members')) {
        sv = sv.slice(0, insertRouteAt) + NEW_ROUTES + sv.slice(insertRouteAt);
        console.log('✅ All new routes added to server.js');
    } else if (sv.includes('/api/family-members')) {
        console.log('ℹ Routes already added to server.js');
    } else {
        console.log('⚠ Could not find async function start( in server.js');
    }
}

fs.writeFileSync('d:/Nirman/server.js', sv, 'utf8');
console.log('✅ server.js updated');

console.log('\n🎉 Phase 1 (DB + Server) complete');
