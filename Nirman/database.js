const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

let db = null;
const DB_PATH = path.join(__dirname, 'trustchain.db');

// ─── HELPER: Synchronous-style wrappers around sql.js ────────
// sql.js uses a different API than better-sqlite3.
// db.run(sql, params) - execute statement
// db.exec(sql) - execute multiple statements
// db.prepare(sql) - returns a Statement object

class DBHelper {
    constructor(database) { this.db = database; }

    run(sql, params = []) {
        this.db.run(sql, params);
        return { lastInsertRowid: this.getLastId(), changes: this.db.getRowsModified() };
    }

    get(sql, params = []) {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
        }
        stmt.free();
        return null;
    }

    all(sql, params = []) {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) results.push(stmt.getAsObject());
        stmt.free();
        return results;
    }

    exec(sql) { this.db.exec(sql); }

    getLastId() {
        const stmt = this.db.prepare('SELECT last_insert_rowid() as id');
        stmt.step();
        const id = stmt.getAsObject().id;
        stmt.free();
        return id;
    }

    save() {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    }
}

let dbHelper = null;

// ─── INITIALIZE ──────────────────────────────────────────────
async function initializeDatabase() {
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    dbHelper = new DBHelper(db);

    dbHelper.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      linked_shop_id INTEGER,
      linked_warehouse_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      district TEXT NOT NULL,
      rice_received REAL DEFAULT 0,
      wheat_received REAL DEFAULT 0,
      sugar_received REAL DEFAULT 0,
      rice_dispatched REAL DEFAULT 0,
      wheat_dispatched REAL DEFAULT 0,
      sugar_dispatched REAL DEFAULT 0,
      rice_damaged REAL DEFAULT 0,
      wheat_damaged REAL DEFAULT 0,
      sugar_damaged REAL DEFAULT 0,
      risk_score REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      district TEXT NOT NULL,
      warehouse_id INTEGER NOT NULL,
      rice_stock REAL DEFAULT 0,
      wheat_stock REAL DEFAULT 0,
      sugar_stock REAL DEFAULT 0,
      rice_price_white REAL DEFAULT 4,
      rice_price_pink REAL DEFAULT 4,
      rice_price_yellow REAL DEFAULT 2,
      wheat_price REAL DEFAULT 3,
      sugar_price REAL DEFAULT 13.50,
      open_time TEXT DEFAULT '08:00',
      close_time TEXT DEFAULT '17:00',
      is_open INTEGER DEFAULT 1,
      risk_score REAL DEFAULT 0,
      violation_count INTEGER DEFAULT 0,
      stock_out_flags INTEGER DEFAULT 0,
      price_violation_flags INTEGER DEFAULT 0,
      afterhours_flags INTEGER DEFAULT 0,
      damage_claims INTEGER DEFAULT 0,
      partial_alloc_flags INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS card_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      rice_limit REAL NOT NULL,
      wheat_limit REAL NOT NULL,
      sugar_limit REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS beneficiaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ration_card_number TEXT NOT NULL,
      card_type_id INTEGER NOT NULL,
      shop_id INTEGER NOT NULL,
      user_id INTEGER,
      monthly_remaining_rice REAL DEFAULT 0,
      monthly_remaining_wheat REAL DEFAULT 0,
      monthly_remaining_sugar REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      beneficiary_id INTEGER NOT NULL,
      item TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      official_price REAL NOT NULL,
      total_amount REAL DEFAULT 0,
      bill_number TEXT,
      card_type TEXT NOT NULL,
      violation_flag INTEGER DEFAULT 0,
      violation_type TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS official_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item TEXT NOT NULL,
      card_code TEXT NOT NULL,
      price REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      citizen_id INTEGER,
      citizen_name TEXT,
      text TEXT NOT NULL,
      category TEXT,
      urgency TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS warehouse_dispatch_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER NOT NULL,
      shop_id INTEGER NOT NULL,
      item TEXT NOT NULL,
      quantity REAL NOT NULL,
      batch_id TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS warehouse_inbound_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER NOT NULL,
      item TEXT NOT NULL,
      quantity REAL NOT NULL,
      batch_id TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS damage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER,
      shop_id INTEGER,
      item TEXT NOT NULL,
      quantity REAL NOT NULL,
      reason TEXT,
      flagged INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);


    // ─── NEW TABLES (v2 extension) ────────────────────────────
    dbHelper.exec(`
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT UNIQUE NOT NULL,
      commodity TEXT NOT NULL,
      weight REAL NOT NULL,
      warehouse_id INTEGER NOT NULL,
      shop_id INTEGER NOT NULL,
      farmer_id INTEGER,
      moisture_level REAL DEFAULT 0,
      status TEXT DEFAULT 'CREATED',
      hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      received_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      scan_type TEXT NOT NULL,
      scanned_by INTEGER,
      location TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS shop_activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      image_path TEXT,
      risk_impact INTEGER DEFAULT 0,
      resolved INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS farmers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      commodity TEXT NOT NULL,
      bank_details TEXT,
      total_supplied REAL DEFAULT 0,
      total_paid REAL DEFAULT 0,
      pending_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS farmer_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id INTEGER NOT NULL,
      batch_id TEXT,
      quantity REAL NOT NULL,
      accepted_quantity REAL DEFAULT 0,
      rejected_quantity REAL DEFAULT 0,
      moisture_level REAL DEFAULT 0,
      rate_per_kg REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'PENDING',
      payment_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS commodity_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      government_price REAL NOT NULL,
      monthly_limit REAL DEFAULT 0,
      seasonal_flag INTEGER DEFAULT 0,
      active_from_date TEXT,
      active_to_date TEXT,
      unit TEXT DEFAULT 'kg',
      active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS admin_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_type TEXT NOT NULL,
      severity TEXT DEFAULT 'medium',
      entity_type TEXT,
      entity_id INTEGER,
      message TEXT NOT NULL,
      resolved INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    `);


    // ─── NEW TABLES (v3 extension) ────────────────────────────
    dbHelper.exec(`
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
    `);

    return dbHelper;
}

// ─── SEED DATA ───────────────────────────────────────────────
function seedDatabase() {
    const userCount = dbHelper.get('SELECT COUNT(*) as c FROM users');
    if (userCount && userCount.c > 0) return;

    // Card Types
    dbHelper.run('INSERT INTO card_types (name, code, rice_limit, wheat_limit, sugar_limit) VALUES (?, ?, ?, ?, ?)', ['Above Poverty Line', 'White', 5, 4, 1]);
    dbHelper.run('INSERT INTO card_types (name, code, rice_limit, wheat_limit, sugar_limit) VALUES (?, ?, ?, ?, ?)', ['Priority Household', 'Pink', 5, 5, 1]);
    dbHelper.run('INSERT INTO card_types (name, code, rice_limit, wheat_limit, sugar_limit) VALUES (?, ?, ?, ?, ?)', ['Antyodaya Anna Yojana', 'Yellow', 35, 0, 1]);

    // Warehouses
    const whSql = 'INSERT INTO warehouses (name, district, rice_received, wheat_received, sugar_received, rice_dispatched, wheat_dispatched, sugar_dispatched, rice_damaged, wheat_damaged, sugar_damaged, risk_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    dbHelper.run(whSql, ['Central Warehouse TVM', 'Thiruvananthapuram', 50000, 30000, 8000, 35000, 20000, 5000, 200, 100, 50, 15]);
    dbHelper.run(whSql, ['Regional Depot EKM', 'Ernakulam', 45000, 28000, 7500, 30000, 18000, 4500, 150, 80, 30, 12]);
    dbHelper.run(whSql, ['District Store KZD', 'Kozhikode', 40000, 25000, 7000, 28000, 17000, 4000, 500, 300, 100, 35]);

    // Shops
    const shSql = 'INSERT INTO shops (name, district, warehouse_id, rice_stock, wheat_stock, sugar_stock, risk_score, violation_count, stock_out_flags, price_violation_flags, afterhours_flags, damage_claims, partial_alloc_flags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    dbHelper.run(shSql, ['FPS Kazhakkoottam', 'Thiruvananthapuram', 1, 2500, 1500, 400, 12, 2, 0, 1, 0, 1, 0]);
    dbHelper.run(shSql, ['FPS Nedumangad', 'Thiruvananthapuram', 1, 1800, 1200, 350, 25, 4, 1, 1, 1, 0, 1]);
    dbHelper.run(shSql, ['FPS Attingal', 'Thiruvananthapuram', 1, 3000, 1800, 450, 8, 1, 0, 0, 0, 1, 0]);
    dbHelper.run(shSql, ['FPS Fort Kochi', 'Ernakulam', 2, 2200, 1400, 380, 18, 3, 1, 1, 0, 0, 1]);
    dbHelper.run(shSql, ['FPS Aluva', 'Ernakulam', 2, 2000, 1300, 360, 45, 7, 2, 2, 1, 1, 1]);
    dbHelper.run(shSql, ['FPS Perumbavoor', 'Ernakulam', 2, 2800, 1600, 420, 10, 1, 0, 0, 1, 0, 0]);
    dbHelper.run(shSql, ['FPS Kozhikode Beach', 'Kozhikode', 3, 1500, 900, 300, 55, 9, 2, 3, 1, 2, 1]);
    dbHelper.run(shSql, ['FPS Vadakara', 'Kozhikode', 3, 2100, 1350, 370, 22, 3, 0, 1, 1, 0, 1]);
    dbHelper.run(shSql, ['FPS Koyilandy', 'Kozhikode', 3, 2600, 1500, 400, 14, 2, 1, 0, 0, 1, 0]);

    // Users
    const salt = bcrypt.hashSync('password123', 10);
    const uSql = 'INSERT INTO users (name, email, password_hash, role, linked_shop_id, linked_warehouse_id) VALUES (?, ?, ?, ?, ?, ?)';
    dbHelper.run(uSql, ['Admin Kerala PDS', 'admin@trustchain.gov.in', salt, 'super_admin', null, null]);
    dbHelper.run(uSql, ['WH Manager TVM', 'wh.tvm@trustchain.gov.in', salt, 'warehouse_manager', null, 1]);
    dbHelper.run(uSql, ['WH Manager EKM', 'wh.ekm@trustchain.gov.in', salt, 'warehouse_manager', null, 2]);
    dbHelper.run(uSql, ['Dealer Kazhakkoottam', 'dealer.kzk@trustchain.gov.in', salt, 'shop_dealer', 1, null]);
    dbHelper.run(uSql, ['Dealer Fort Kochi', 'dealer.fk@trustchain.gov.in', salt, 'shop_dealer', 4, null]);
    dbHelper.run(uSql, ['Ravi Kumar', 'ravi@citizen.in', salt, 'citizen', null, null]);
    dbHelper.run(uSql, ['Lakshmi Nair', 'lakshmi@citizen.in', salt, 'citizen', null, null]);

    // Beneficiaries
    const bSql = 'INSERT INTO beneficiaries (name, ration_card_number, card_type_id, shop_id, user_id, monthly_remaining_rice, monthly_remaining_wheat, monthly_remaining_sugar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    dbHelper.run(bSql, ['Ravi Kumar', 'KL-TVM-1000001', 1, 1, 6, 5, 4, 1]);
    dbHelper.run(bSql, ['Arun Menon', 'KL-EKM-2000001', 1, 2, null, 3, 2, 1]);
    dbHelper.run(bSql, ['Meera Das', 'KL-KLM-4000001', 1, 4, null, 5, 4, 1]);
    dbHelper.run(bSql, ['Lakshmi Nair', 'KL-TVM-1000002', 2, 1, 7, 5, 5, 1]);
    dbHelper.run(bSql, ['Suresh Pillai', 'KL-TSR-3000001', 2, 3, null, 4, 3, 1]);
    dbHelper.run(bSql, ['Priya Mohan', 'KL-KNR-5000001', 2, 5, null, 5, 5, 1]);
    dbHelper.run(bSql, ['Gopal Krishnan', 'KL-TVM-1000003', 3, 1, null, 35, 0, 1]);
    dbHelper.run(bSql, ['Janaki Amma', 'KL-PKD-7000001', 3, 7, null, 35, 0, 1]);
    dbHelper.run(bSql, ['Babu Raj', 'KL-KLM-4000002', 3, 4, null, 20, 0, 1]);

    // Official Prices (admin-managed)
    const pSql = 'INSERT INTO official_prices (item, card_code, price) VALUES (?, ?, ?)';
    dbHelper.run(pSql, ['rice', 'White', 4]);
    dbHelper.run(pSql, ['rice', 'Pink', 4]);
    dbHelper.run(pSql, ['rice', 'Yellow', 2]);
    dbHelper.run(pSql, ['wheat', 'White', 3]);
    dbHelper.run(pSql, ['wheat', 'Pink', 3]);
    dbHelper.run(pSql, ['wheat', 'Yellow', 3]);
    dbHelper.run(pSql, ['sugar', 'White', 13.50]);
    dbHelper.run(pSql, ['sugar', 'Pink', 13.50]);
    dbHelper.run(pSql, ['sugar', 'Yellow', 13.50]);

    // Transactions
    const tSql = 'INSERT INTO transactions (shop_id, beneficiary_id, item, quantity, price, official_price, total_amount, bill_number, card_type, violation_flag, violation_type, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    dbHelper.run(tSql, [1, 1, 'rice', 2, 4, 4, 8, 'BILL-1-20260215-001', 'White', 0, null, '2026-02-15 10:30:00']);
    dbHelper.run(tSql, [1, 4, 'rice', 3, 4, 4, 12, 'BILL-1-20260215-002', 'Pink', 0, null, '2026-02-15 11:00:00']);
    dbHelper.run(tSql, [1, 7, 'rice', 15, 2, 2, 30, 'BILL-1-20260215-003', 'Yellow', 0, null, '2026-02-15 14:00:00']);
    dbHelper.run(tSql, [2, 2, 'rice', 2, 5, 4, 10, 'BILL-2-20260216-001', 'White', 1, 'overpricing', '2026-02-16 09:30:00']);
    dbHelper.run(tSql, [4, 3, 'wheat', 2, 3, 3, 6, 'BILL-4-20260216-001', 'White', 0, null, '2026-02-16 10:00:00']);
    dbHelper.run(tSql, [5, 6, 'rice', 3, 4, 4, 12, 'BILL-5-20260217-001', 'Pink', 0, null, '2026-02-17 15:30:00']);
    dbHelper.run(tSql, [7, 8, 'rice', 10, 2, 2, 20, 'BILL-7-20260217-001', 'Yellow', 0, null, '2026-02-17 18:30:00']);
    dbHelper.run(tSql, [7, 8, 'rice', 5, 3, 2, 15, 'BILL-7-20260218-001', 'Yellow', 1, 'overpricing,after_hours', '2026-02-18 19:00:00']);

    // Dispatch logs
    const dSql = 'INSERT INTO warehouse_dispatch_log (warehouse_id, shop_id, item, quantity, batch_id, timestamp) VALUES (?, ?, ?, ?, ?, ?)';
    dbHelper.run(dSql, [1, 1, 'rice', 3000, 'BATCH-TVM-R-001', '2026-02-01 08:00:00']);
    dbHelper.run(dSql, [1, 1, 'wheat', 2000, 'BATCH-TVM-W-001', '2026-02-01 08:30:00']);
    dbHelper.run(dSql, [1, 2, 'rice', 2500, 'BATCH-TVM-R-002', '2026-02-02 09:00:00']);
    dbHelper.run(dSql, [1, 3, 'rice', 3500, 'BATCH-TVM-R-003', '2026-02-03 08:00:00']);
    dbHelper.run(dSql, [2, 4, 'rice', 2800, 'BATCH-EKM-R-001', '2026-02-01 10:00:00']);
    dbHelper.run(dSql, [2, 5, 'rice', 2500, 'BATCH-EKM-R-002', '2026-02-02 10:00:00']);
    dbHelper.run(dSql, [2, 6, 'rice', 3200, 'BATCH-EKM-R-003', '2026-02-03 10:00:00']);
    dbHelper.run(dSql, [3, 7, 'rice', 2000, 'BATCH-KZD-R-001', '2026-02-01 09:00:00']);
    dbHelper.run(dSql, [3, 8, 'rice', 2500, 'BATCH-KZD-R-002', '2026-02-02 09:00:00']);
    dbHelper.run(dSql, [3, 9, 'rice', 3000, 'BATCH-KZD-R-003', '2026-02-03 09:00:00']);

    // Complaints
    const cSql = 'INSERT INTO complaints (shop_id, citizen_id, citizen_name, text, category, urgency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    dbHelper.run(cSql, [7, 6, 'Ravi Kumar', 'Shop is charging extra money for rice', 'pricing_violation', 'high', 'pending', '2026-02-15 12:00:00']);
    dbHelper.run(cSql, [5, 7, 'Lakshmi Nair', 'Shop says no stock available but I saw bags inside', 'artificial_shortage', 'high', 'pending', '2026-02-16 14:00:00']);
    dbHelper.run(cSql, [2, null, 'Anonymous', 'Getting less quantity than entitled', 'allocation_issue', 'medium', 'pending', '2026-02-17 10:00:00']);
    dbHelper.run(cSql, [7, null, 'Gopal K', 'Shop was closed during working hours', 'operational_issue', 'medium', 'resolved', '2026-02-10 16:00:00']);
    dbHelper.run(cSql, [5, null, 'Suresh P', 'I suspect black market selling of ration rice', 'diversion_alert', 'critical', 'investigating', '2026-02-18 11:00:00']);

    // Damage logs
    const dmSql = 'INSERT INTO damage_log (warehouse_id, shop_id, item, quantity, reason, flagged, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)';
    dbHelper.run(dmSql, [1, null, 'rice', 200, 'Water seepage in storage', 0, '2026-02-05 08:00:00']);
    dbHelper.run(dmSql, [3, null, 'rice', 500, 'Rodent damage', 1, '2026-02-06 09:00:00']);
    dbHelper.run(dmSql, [3, null, 'wheat', 300, 'Moisture damage', 1, '2026-02-08 10:00:00']);
    dbHelper.run(dmSql, [null, 7, 'rice', 150, 'Bag torn during unloading', 1, '2026-02-10 11:00:00']);
    dbHelper.run(dmSql, [null, 5, 'wheat', 50, 'Expired stock', 0, '2026-02-12 09:00:00']);


    // Farmer users
    dbHelper.run(uSql, ['Krishnan Farmer', 'farmer@trustchain.gov.in', salt, 'farmer', null, 1]);
    dbHelper.run(uSql, ['Balan Farmer', 'balan@farmer.in', salt, 'farmer', null, 1]);

    // Farmers
    dbHelper.run('INSERT INTO farmers (user_id, name, commodity, bank_details, total_supplied, total_paid, pending_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [8, 'Krishnan Nair', 'Rice', 'SBI Acc: 0012345678, IFSC: SBIN0001234', 5000, 140000, 10000]);
    dbHelper.run('INSERT INTO farmers (user_id, name, commodity, bank_details, total_supplied, total_paid, pending_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [9, 'Balan Pillai', 'Wheat', 'Canara Acc: 9987654321, IFSC: CNRB0001234', 3000, 60000, 30000]);

    // Farmer transactions
    const ftSql = 'INSERT INTO farmer_transactions (farmer_id, batch_id, quantity, accepted_quantity, rejected_quantity, moisture_level, rate_per_kg, payment_status, payment_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    dbHelper.run(ftSql, [1, 'BATCH-TVM-R-001', 2000, 1950, 50, 12.5, 28, 'PAID', '2026-02-05 00:00:00', '2026-02-01 08:00:00']);
    dbHelper.run(ftSql, [1, 'BATCH-TVM-R-002', 1500, 1480, 20, 13.0, 28, 'PAID', '2026-02-08 00:00:00', '2026-02-02 09:00:00']);
    dbHelper.run(ftSql, [1, null, 1500, 1450, 50, 14.2, 28, 'PENDING', null, '2026-02-15 10:00:00']);
    dbHelper.run(ftSql, [2, 'BATCH-TVM-W-001', 2000, 1900, 100, 11.0, 20, 'PAID', '2026-02-06 00:00:00', '2026-02-01 09:00:00']);
    dbHelper.run(ftSql, [2, null, 1000, 950, 50, 15.5, 20, 'PENDING', null, '2026-02-16 11:00:00']);

    // Commodity master
    const cmSql = 'INSERT INTO commodity_master (name, code, government_price, monthly_limit, seasonal_flag, active_from_date, active_to_date, unit, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    dbHelper.run(cmSql, ['Rice', 'rice', 4, 5, 0, null, null, 'kg', 1]);
    dbHelper.run(cmSql, ['Wheat', 'wheat', 3, 4, 0, null, null, 'kg', 1]);
    dbHelper.run(cmSql, ['Sugar', 'sugar', 13.50, 1, 0, null, null, 'kg', 1]);
    dbHelper.run(cmSql, ['Kerosene', 'kerosene', 15, 2, 0, null, null, 'litre', 1]);
    dbHelper.run(cmSql, ['Maida', 'maida', 5, 2, 0, null, null, 'kg', 1]);
    dbHelper.run(cmSql, ['Atta', 'atta', 4.5, 3, 0, null, null, 'kg', 1]);
    dbHelper.run(cmSql, ['Festival Kit', 'festival_kit', 50, 1, 1, '2026-03-01', '2026-03-31', 'kit', 0]);
    dbHelper.run(cmSql, ['Onam Kit', 'onam_kit', 75, 1, 1, '2026-08-25', '2026-09-05', 'kit', 0]);
    dbHelper.run(cmSql, ['Ramzan Kit', 'ramzan_kit', 60, 1, 1, '2026-03-10', '2026-04-10', 'kit', 0]);
    dbHelper.run(cmSql, ['Emergency Relief Kit', 'emergency_kit', 0, 1, 0, null, null, 'kit', 1]);

    // Sample batches (QR traced)
    const batchSql = 'INSERT INTO batches (batch_id, commodity, weight, warehouse_id, shop_id, farmer_id, moisture_level, status, hash, created_at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    dbHelper.run(batchSql, ['QR-TVM-2026-001', 'rice', 500, 1, 1, 1, 12.5, 'RECEIVED', 'hmac_placeholder_001', '2026-02-10 08:00:00', '2026-02-10 14:00:00']);
    dbHelper.run(batchSql, ['QR-TVM-2026-002', 'rice', 750, 1, 2, 1, 13.0, 'DISPATCHED', 'hmac_placeholder_002', '2026-02-12 09:00:00', null]);
    dbHelper.run(batchSql, ['QR-TVM-2026-003', 'wheat', 400, 1, 1, 2, 11.0, 'DISTRIBUTED', 'hmac_placeholder_003', '2026-02-08 07:00:00', '2026-02-08 15:00:00']);
    dbHelper.run(batchSql, ['QR-EKM-2026-001', 'rice', 600, 2, 4, null, 12.0, 'CREATED', 'hmac_placeholder_004', '2026-02-19 10:00:00', null]);

    // Sample scans
    const scanSql = 'INSERT INTO scans (batch_id, scan_type, scanned_by, location, timestamp) VALUES (?, ?, ?, ?, ?)';
    dbHelper.run(scanSql, ['QR-TVM-2026-001', 'DISPATCH', 2, 'Central Warehouse TVM', '2026-02-10 08:10:00']);
    dbHelper.run(scanSql, ['QR-TVM-2026-001', 'RECEIVE', 4, 'FPS Kazhakkoottam', '2026-02-10 14:05:00']);
    dbHelper.run(scanSql, ['QR-TVM-2026-003', 'DISPATCH', 2, 'Central Warehouse TVM', '2026-02-08 07:15:00']);
    dbHelper.run(scanSql, ['QR-TVM-2026-003', 'RECEIVE', 4, 'FPS Kazhakkoottam', '2026-02-08 15:05:00']);
    dbHelper.run(scanSql, ['QR-TVM-2026-003', 'DISTRIBUTE', 4, 'FPS Kazhakkoottam', '2026-02-09 10:00:00']);

    // After-hours activity logs
    const actSql = 'INSERT INTO shop_activity_logs (shop_id, event_type, timestamp, risk_impact, resolved) VALUES (?, ?, ?, ?, ?)';
    dbHelper.run(actSql, [7, 'AFTER_HOURS_TRANSACTION', '2026-02-17 18:30:00', 10, 0]);
    dbHelper.run(actSql, [7, 'MOTION', '2026-02-18 21:00:00', 5, 0]);
    dbHelper.run(actSql, [5, 'AFTER_HOURS_TRANSACTION', '2026-02-16 19:00:00', 10, 1]);

    // Admin alerts
    const alertSql = 'INSERT INTO admin_alerts (alert_type, severity, entity_type, entity_id, message, resolved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
    dbHelper.run(alertSql, ['AFTER_HOURS_ACTIVITY', 'high', 'shop', 7, 'After-hours transaction detected at FPS Kozhikode Beach', 0, '2026-02-17 18:31:00']);
    dbHelper.run(alertSql, ['QR_MISSING_RECEIVE', 'medium', 'batch', 2, 'Batch QR-TVM-2026-002 dispatched but no RECEIVE scan after 48h', 0, '2026-02-14 09:00:00']);
    dbHelper.run(alertSql, ['FARMER_PAYMENT_DELAY', 'medium', 'farmer', 1, 'Krishnan Nair has pending payment of ₹10,000 for 5+ days', 0, '2026-02-20 00:00:00']);
    dbHelper.run(alertSql, ['MOISTURE_ANOMALY', 'low', 'farmer', 2, 'Balan Pillai: moisture level 15.5% exceeds threshold (14%)', 0, '2026-02-16 11:05:00']);

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
    dbHelper.save();
    console.log('✅ Database seeded with Kerala PDS data');
}

function getDB() { return dbHelper; }

module.exports = { initializeDatabase, seedDatabase, getDB };
