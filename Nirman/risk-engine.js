const { getDB } = require('./database');

// ─── RISK WEIGHTS ────────────────────────────────────────────
const WEIGHTS = {
    stock_mismatch: 0.20,
    artificial_stockout: 0.20,
    price_violations: 0.15,
    after_hours: 0.10,
    damage_anomalies: 0.10,
    complaint_frequency: 0.10,
    partial_allocation: 0.15
};

function calculateShopRisk(shopId) {
    const db = getDB();
    const shop = db.get('SELECT * FROM shops WHERE id = ?', [shopId]);
    if (!shop) return { shopId, riskScore: 0, breakdown: {} };

    const txCount = db.get('SELECT COUNT(*) as c FROM transactions WHERE shop_id = ?', [shopId]).c || 1;
    const complaintCount = db.get('SELECT COUNT(*) as c FROM complaints WHERE shop_id = ?', [shopId]).c;

    const stockMismatchScore = Math.min(shop.stock_out_flags * 20, 100);
    const artificialStockoutScore = Math.min(shop.stock_out_flags * 25, 100);
    const priceViolationScore = Math.min((shop.price_violation_flags / Math.max(txCount, 1)) * 500, 100);
    const afterHoursScore = Math.min(shop.afterhours_flags * 25, 100);
    const damageScore = Math.min(shop.damage_claims * 20, 100);
    const complaintScore = Math.min(complaintCount * 15, 100);
    const partialAllocScore = Math.min(shop.partial_alloc_flags * 20, 100);

    const riskScore = (
        stockMismatchScore * WEIGHTS.stock_mismatch +
        artificialStockoutScore * WEIGHTS.artificial_stockout +
        priceViolationScore * WEIGHTS.price_violations +
        afterHoursScore * WEIGHTS.after_hours +
        damageScore * WEIGHTS.damage_anomalies +
        complaintScore * WEIGHTS.complaint_frequency +
        partialAllocScore * WEIGHTS.partial_allocation
    );

    const normalizedScore = Math.min(Math.round(riskScore), 100);
    db.run('UPDATE shops SET risk_score = ? WHERE id = ?', [normalizedScore, shopId]);

    return {
        shopId,
        riskScore: normalizedScore,
        breakdown: {
            stock_mismatch: Math.round(stockMismatchScore * WEIGHTS.stock_mismatch),
            artificial_stockout: Math.round(artificialStockoutScore * WEIGHTS.artificial_stockout),
            price_violations: Math.round(priceViolationScore * WEIGHTS.price_violations),
            after_hours: Math.round(afterHoursScore * WEIGHTS.after_hours),
            damage_anomalies: Math.round(damageScore * WEIGHTS.damage_anomalies),
            complaint_frequency: Math.round(complaintScore * WEIGHTS.complaint_frequency),
            partial_allocation: Math.round(partialAllocScore * WEIGHTS.partial_allocation)
        }
    };
}

function calculateWarehouseRisk(warehouseId) {
    const db = getDB();
    const wh = db.get('SELECT * FROM warehouses WHERE id = ?', [warehouseId]);
    if (!wh) return { warehouseId, riskScore: 0, damageRatio: 0 };

    const totalReceived = wh.rice_received + wh.wheat_received + wh.sugar_received;
    const totalDamaged = wh.rice_damaged + wh.wheat_damaged + wh.sugar_damaged;
    const totalDispatched = wh.rice_dispatched + wh.wheat_dispatched + wh.sugar_dispatched;
    const closingStock = totalReceived - totalDispatched - totalDamaged;
    const expectedClosing = (wh.rice_received - wh.rice_dispatched - wh.rice_damaged) +
        (wh.wheat_received - wh.wheat_dispatched - wh.wheat_damaged) +
        (wh.sugar_received - wh.sugar_dispatched - wh.sugar_damaged);

    const damageRatio = totalReceived > 0 ? (totalDamaged / totalReceived) * 100 : 0;
    const damageScore = damageRatio > 3 ? Math.min(damageRatio * 10, 100) : damageRatio * 5;
    const mismatchScore = Math.abs(closingStock - expectedClosing) > 100 ? 50 : 0;
    const riskScore = Math.min(Math.round((damageScore * 0.6 + mismatchScore * 0.4)), 100);

    db.run('UPDATE warehouses SET risk_score = ? WHERE id = ?', [riskScore, warehouseId]);
    return { warehouseId, riskScore, damageRatio: Math.round(damageRatio * 100) / 100 };
}

function shortageForecast(shopId) {
    const db = getDB();
    const shop = db.get('SELECT * FROM shops WHERE id = ?', [shopId]);
    if (!shop) return null;

    const txStats = db.all("SELECT item, SUM(quantity) as total, COUNT(DISTINCT DATE(timestamp)) as days FROM transactions WHERE shop_id = ? AND timestamp >= datetime('now', '-30 days') GROUP BY item", [shopId]);

    const forecasts = {};
    const items = { rice: shop.rice_stock, wheat: shop.wheat_stock, sugar: shop.sugar_stock };

    for (const [item, stock] of Object.entries(items)) {
        const stat = txStats.find(s => s.item === item);
        const avgDaily = stat && stat.days > 0 ? stat.total / stat.days : (stock > 0 ? stock / 30 : 1);
        const daysLeft = avgDaily > 0 ? Math.round(stock / avgDaily) : 999;
        forecasts[item] = {
            currentStock: stock,
            avgDailyDistribution: Math.round(avgDaily * 100) / 100,
            daysLeft,
            alert: daysLeft < 7 ? 'critical' : daysLeft < 14 ? 'warning' : 'normal'
        };
    }
    return { shopId, shopName: shop.name, forecasts };
}

function restockRecommendation(shopId) {
    const forecast = shortageForecast(shopId);
    if (!forecast) return null;
    const recommendations = {};
    for (const [item, data] of Object.entries(forecast.forecasts)) {
        const projectedDemand30 = data.avgDailyDistribution * 30;
        const buffer = projectedDemand30 * 0.15;
        const nextDispatch = Math.max(0, Math.round(projectedDemand30 - data.currentStock + buffer));
        recommendations[item] = {
            projectedDemand30Days: Math.round(projectedDemand30),
            currentStock: data.currentStock,
            recommendedDispatch: nextDispatch,
            urgency: data.alert
        };
    }
    return { shopId, shopName: forecast.shopName, recommendations };
}

function diversionProbabilityIndex(shopId) {
    const db = getDB();
    const shop = db.get('SELECT * FROM shops WHERE id = ?', [shopId]);
    if (!shop) return null;

    const complaintCount = db.get('SELECT COUNT(*) as c FROM complaints WHERE shop_id = ?', [shopId]).c;
    const diversionComplaints = db.get("SELECT COUNT(*) as c FROM complaints WHERE shop_id = ? AND category = 'diversion_alert'", [shopId]).c;
    const priceViolationTx = db.get("SELECT COUNT(*) as c FROM transactions WHERE shop_id = ? AND violation_flag = 1", [shopId]).c;
    const totalTx = db.get('SELECT COUNT(*) as c FROM transactions WHERE shop_id = ?', [shopId]).c || 1;

    const factors = {
        partialCollectionAnomaly: shop.partial_alloc_flags * 12,
        artificialStockout: shop.stock_out_flags * 15,
        complaintFrequency: complaintCount * 8,
        priceViolationRatio: (priceViolationTx / totalTx) * 100,
        damageClaimExcess: shop.damage_claims * 10,
        diversionReports: diversionComplaints * 20
    };

    const dpi = Math.min(100, Math.round(
        Object.values(factors).reduce((sum, v) => sum + v, 0) / Object.keys(factors).length
    ));

    return {
        shopId, shopName: shop.name, district: shop.district,
        diversionProbability: dpi,
        level: dpi > 60 ? 'high' : dpi > 30 ? 'medium' : 'low',
        factors
    };
}

function recalculateAllScores() {
    const db = getDB();
    const shops = db.all('SELECT id FROM shops');
    const warehouses = db.all('SELECT id FROM warehouses');
    shops.forEach(s => calculateShopRisk(s.id));
    warehouses.forEach(w => calculateWarehouseRisk(w.id));
    db.save();
}

// ─── EXTENDED RISK TRIGGERS (Additive – do not modify WEIGHTS) ───────────────

// Check QR integrity issues for a shop (mismatch, duplicate, missing RECEIVE)
function checkQRIntegrity(shopId) {
    const db = getDB();
    const mismatches = db.get("SELECT COUNT(*) as c FROM admin_alerts WHERE entity_type='batch' AND alert_type='QR_MISMATCH' AND entity_id IN (SELECT id FROM batches WHERE shop_id=?)", [shopId]);
    const duplicates = db.get("SELECT COUNT(*) as c FROM admin_alerts WHERE entity_type='batch' AND alert_type='DUPLICATE_SCAN' AND entity_id IN (SELECT id FROM batches WHERE shop_id=?)", [shopId]);
    const missingReceive = db.get("SELECT COUNT(*) as c FROM batches WHERE shop_id=? AND status='DISPATCHED' AND created_at <= datetime('now','-48 hours')", [shopId]);
    const delta = Math.min((mismatches.c || 0) * 15 + (duplicates.c || 0) * 10 + (missingReceive.c || 0) * 8, 30);
    if (delta > 0) db.run('UPDATE shops SET risk_score = MIN(100, risk_score + ?) WHERE id = ?', [delta, shopId]);
    return { qr_mismatches: mismatches.c, duplicate_scans: duplicates.c, missing_receives: missingReceive.c, risk_delta: delta };
}

// Check after-hours activity signals for a shop
function checkAfterHoursActivity(shopId) {
    const db = getDB();
    const afterHours = db.get("SELECT COUNT(*) as c FROM shop_activity_logs WHERE shop_id=? AND event_type IN ('MOTION','AFTER_HOURS_TRANSACTION') AND resolved=0", [shopId]);
    const delta = Math.min((afterHours.c || 0) * 5, 20);
    if (delta > 0) db.run('UPDATE shops SET risk_score = MIN(100, risk_score + ?) WHERE id = ?', [delta, shopId]);
    return { unresolved_events: afterHours.c, risk_delta: delta };
}

// Check if a farmer has payment delays > 30 days and flag warehouse risk
function checkFarmerPaymentDelay(farmerId) {
    const db = getDB();
    const delays = db.all("SELECT * FROM farmer_transactions WHERE farmer_id=? AND payment_status='PENDING' AND created_at <= datetime('now','-30 days')", [farmerId]);
    const farmer = db.get('SELECT * FROM farmers WHERE id=?', [farmerId]);
    if (delays.length > 0 && farmer) {
        const delta = Math.min(delays.length * 5, 15);
        db.run('UPDATE warehouses SET risk_score = MIN(100, risk_score + ?) WHERE id = (SELECT linked_warehouse_id FROM users WHERE id=?)', [delta, farmer.user_id || 0]);
        db.run("INSERT OR IGNORE INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)",
            ['FARMER_PAYMENT_DELAY', 'medium', 'farmer', farmerId, 'Payment delay >30 days for farmer ' + (farmer.name || farmerId)]);
    }
    return { delayed_transactions: delays.length };
}

// Check if seasonal commodities are distributed outside active period
function checkSeasonalMisuse(shopId) {
    const db = getDB();
    const now = new Date().toISOString().slice(0, 10);
    const seasonal = db.all("SELECT * FROM commodity_master WHERE seasonal_flag=1 AND active_from_date IS NOT NULL");
    let violations = 0;
    seasonal.forEach(cm => {
        if (now < cm.active_from_date || now > cm.active_to_date) {
            const txCount = db.get("SELECT COUNT(*) as c FROM transactions WHERE shop_id=? AND item=?", [shopId, cm.code]);
            if (txCount && txCount.c > 0) {
                violations++;
                db.run("INSERT OR IGNORE INTO admin_alerts (alert_type, severity, entity_type, entity_id, message) VALUES (?, ?, ?, ?, ?)",
                    ['SEASONAL_MISUSE', 'high', 'shop', shopId, cm.name + ' distributed outside active period at shop #' + shopId]);
            }
        }
    });
    if (violations > 0) db.run('UPDATE shops SET risk_score = MIN(100, risk_score + ?) WHERE id = ?', [violations * 10, shopId]);
    return { seasonal_violations: violations };
}

// Aggregate all extended risk signals for a shop into a summary object
function getExtendedRiskSummary(shopId) {
    const qr = checkQRIntegrity(shopId);
    const ah = checkAfterHoursActivity(shopId);
    const sm = checkSeasonalMisuse(shopId);
    const db = getDB();
    db.save();
    return { shopId, qr_integrity: qr, after_hours: ah, seasonal_misuse: sm };
}

module.exports = {
    WEIGHTS, calculateShopRisk, calculateWarehouseRisk,
    shortageForecast, restockRecommendation, diversionProbabilityIndex,
    recalculateAllScores,
    // Extended risk triggers (additive, do not modify WEIGHTS)
    checkQRIntegrity,
    checkAfterHoursActivity,
    checkFarmerPaymentDelay,
    checkSeasonalMisuse,
    getExtendedRiskSummary
};
