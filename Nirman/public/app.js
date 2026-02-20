// ═══════════════════════════════════════════════════════════════
// TrustChain PDS – Main Application
// ═══════════════════════════════════════════════════════════════

let charts = {};
let activeModule = '';
let cachedPrices = null;

const ROLE_MODULES = {
  super_admin: [
    { id: 'admin', label: '⚙ Admin', icon: '⚙' },
    { id: 'warehouse', label: '🏭 Warehouse', icon: '🏭' },
    { id: 'shop', label: '🏪 Shop', icon: '🏪' },
    { id: 'citizen', label: '👥 Citizen', icon: '👥' },
    { id: 'analytics', label: '📊 Analytics', icon: '📊' },
    { id: 'report', label: '📄 Report', icon: '📄' },
    { id: 'supplychain', label: '🔄 Supply Chain', icon: '🔄' },
    { id: 'risk', label: '🛡 Risk Engine', icon: '🛡' },
    { id: 'batches', label: '📦 QR Batches', icon: '📦' },
    { id: 'farmer', label: '🌾 Farmers', icon: '🌾' }
  ],
  warehouse_manager: [
    { id: 'warehouse', label: '🏭 Warehouse', icon: '🏭' },
    { id: 'batches', label: '📦 QR Batches', icon: '📦' },
    { id: 'supplychain', label: '🔄 Supply Chain', icon: '🔄' }
  ],
  shop_dealer: [
    { id: 'shop', label: '🏪 Shop', icon: '🏪' },
    { id: 'report', label: '📄 Report', icon: '📄' }
  ],
  farmer: [
    { id: 'farmer', label: '🌾 My Portal', icon: '🌾' }
  ],
  citizen: [
    { id: 'citizen', label: '👥 My Portal', icon: '👥' },
    { id: 'report', label: '📄 Shop Reports', icon: '📄' },
    { id: 'risk', label: '🛡 Risk Scores', icon: '🛡' }
  ]
};

function setupRoleTabs() {
  const modules = ROLE_MODULES[currentUser.role] || ROLE_MODULES.citizen;
  document.getElementById('roleTabs').innerHTML = modules.map(m =>
    `<button class="role-tab" data-module="${m.id}" onclick="switchModule('${m.id}')">${m.label}</button>`
  ).join('');
}

function switchModule(moduleId) {
  activeModule = moduleId;
  document.querySelectorAll('.module-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
  const panel = document.getElementById(`module-${moduleId}`);
  const tab = document.querySelector(`[data-module="${moduleId}"]`);
  if (panel) panel.classList.remove('hidden');
  if (tab) tab.classList.add('active');
  const loaders = { admin: loadAdminModule, warehouse: loadWarehouseModule, shop: loadShopModule, citizen: loadCitizenModule, analytics: loadAnalyticsModule, report: loadReportModule, supplychain: loadSupplyChainModule, risk: loadRiskModule, farmer: loadFarmerDashboard, batches: loadBatchModule };
  if (loaders[moduleId]) loaders[moduleId]();
}

function initApp() {
  const modules = ROLE_MODULES[currentUser.role] || ROLE_MODULES.citizen;
  if (modules.length > 0) switchModule(modules[0].id);
}

// ═══ ADMIN MODULE ═══
async function loadAdminModule() {
  try {
    const [prices, complaints, alerts, batches, farmers, commodities] = await Promise.all([
      api('/api/admin/pricing'), api('/api/complaints'),
      api('/api/admin/alerts'), api('/api/batches'),
      api('/api/farmers'), api('/api/commodities')]);
    // Pricing table
    document.getElementById('pricingTable').innerHTML = `<table>
          <thead><tr><th>Item</th><th>Card Type</th><th>Price (₹/kg)</th><th>Action</th></tr></thead>
          <tbody>${prices.map(p => `<tr>
            <td><strong>${cap(p.item)}</strong></td>
            <td><span class="badge ${p.card_code === 'Yellow' ? 'badge-yellow' : p.card_code === 'Pink' ? 'badge-purple' : 'badge-blue'}">${p.card_code}</span></td>
            <td><input type="number" class="price-input" id="price-${p.item}-${p.card_code}" value="${p.price}" min="0" step="0.5" style="width:80px"></td>
            <td><button class="btn btn-primary btn-sm" onclick="updatePrice('${p.item}','${p.card_code}')">Update</button></td>
          </tr>`).join('')}</tbody></table>`;
    // Complaints
    document.getElementById('adminComplaintsTable').innerHTML = complaints.length ? `<table>
          <thead><tr><th>Shop</th><th>Citizen</th><th>Complaint</th><th>Category</th><th>Urgency</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${complaints.map(c => `<tr>
            <td>${c.shop_name}</td><td>${c.citizen_name || '—'}</td>
            <td>${c.text.substring(0, 50)}${c.text.length > 50 ? '...' : ''}</td>
            <td><span class="badge ${categoryBadge(c.category)}">${(c.category || 'general').replace(/_/g, ' ')}</span></td>
            <td><span class="badge ${c.urgency === 'critical' ? 'badge-red' : c.urgency === 'high' ? 'badge-yellow' : 'badge-blue'}">${c.urgency}</span></td>
            <td><select class="select-styled select-sm" onchange="updateComplaintStatus(${c.id},this.value)">
              <option value="pending" ${c.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="investigating" ${c.status === 'investigating' ? 'selected' : ''}>Investigating</option>
              <option value="resolved" ${c.status === 'resolved' ? 'selected' : ''}>Resolved</option>
              <option value="dismissed" ${c.status === 'dismissed' ? 'selected' : ''}>Dismissed</option>
            </select></td>
            <td><span class="badge badge-${c.status === 'resolved' ? 'green' : c.status === 'investigating' ? 'yellow' : 'blue'}">${c.status}</span></td>
          </tr>`).join('')}</tbody></table>` : '<div class="empty-state">No complaints</div>';

    // System Alerts panel
    const sevBadge = function (s) { return s === 'critical' || s === 'high' ? 'badge-red' : s === 'medium' ? 'badge-yellow' : 'badge-blue'; };
    document.getElementById('adminAlertsTable').innerHTML = alerts.length
      ? '<table><thead><tr><th>Type</th><th>Severity</th><th>Entity</th><th>Message</th><th>Time</th><th>Action</th></tr></thead><tbody>' +
      alerts.map(function (a) {
        return '<tr><td><span class="badge badge-yellow">' + a.alert_type.replace(/_/g, ' ') + '</span></td><td><span class="badge ' + sevBadge(a.severity) + '">' + a.severity + '</span></td><td>' + a.entity_type + ' #' + a.entity_id + '</td><td>' + a.message + '</td><td>' + timeAgo(a.created_at) + '</td><td>' + (a.resolved ? '<span class="badge badge-green">Resolved</span>' : '<button class="btn btn-sm btn-primary" onclick="resolveAlert(' + a.id + ')">Resolve</button>') + '</td></tr>';
      }).join('') + '</tbody></table>'
      : '<div class="empty-state">No alerts</div>';

    // Live Batch Tracking
    renderBatchTable(batches || [], 'adminBatchTable');

    // Scan Log
    loadScanLog();

    // Farmer Payment Monitor
    document.getElementById('adminFarmerPayTable').innerHTML = farmers.length
      ? '<table><thead><tr><th>Farmer</th><th>Commodity</th><th>Total Supplied</th><th>Total Paid</th><th>Pending</th><th>Status</th></tr></thead><tbody>' +
      farmers.map(function (f) {
        return '<tr><td><strong>' + f.name + '</strong></td><td>' + cap(f.commodity) + '</td><td>' + fmt(f.total_supplied) + ' kg</td><td>₹' + fmt(f.total_paid) + '</td><td><strong ' + (f.pending_amount > 0 ? 'style="color:var(--yellow)"' : '') + '>₹' + fmt(f.pending_amount) + '</strong></td><td><span class="badge ' + (f.pending_amount > 0 ? 'badge-yellow' : 'badge-green') + '">' + (f.pending_amount > 0 ? 'Pending' : 'Cleared') + '</span></td></tr>';
      }).join('') + '</tbody></table>'
      : '<div class="empty-state">No farmers</div>';

    // Seasonal Commodity Tracker
    document.getElementById('adminCommodityTable').innerHTML = '<table><thead><tr><th>Commodity</th><th>Govt Price</th><th>Monthly Limit</th><th>Seasonal</th><th>Active From</th><th>Active To</th><th>Status</th></tr></thead><tbody>' +
      commodities.map(function (c) {
        return '<tr><td><strong>' + c.name + '</strong></td><td>₹' + c.government_price + '/' + c.unit + '</td><td>' + c.monthly_limit + ' ' + c.unit + '</td><td>' + (c.seasonal_flag ? '<span class="badge badge-yellow">Seasonal</span>' : '<span class="badge badge-blue">Regular</span>') + '</td><td>' + (c.active_from_date || '—') + '</td><td>' + (c.active_to_date || '—') + '</td><td><span class="badge ' + (c.currently_active ? 'badge-green' : 'badge-red') + '">' + (c.currently_active ? 'Active' : 'Inactive') + '</span></td></tr>';
      }).join('') + '</tbody></table>';
  } catch (e) { showToast(e.message, 'error'); }
}

// ═══ ADMIN HELPERS ═══
async function resolveAlert(id) {
  try {
    await api('/api/admin/alerts/' + id + '/resolve', { method: 'POST', body: '{}' });
    showToast('Alert resolved', 'success'); loadAdminModule();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadScanLog() {
  try {
    const scans = await api('/api/scans');
    const el = document.getElementById('adminScanLogTable');
    if (!el) return;
    el.innerHTML = scans.length ? '<table><thead><tr><th>Batch ID</th><th>Scan Type</th><th>Scanned By</th><th>Location</th><th>Time</th></tr></thead><tbody>' +
      scans.map(s => '<tr><td><code>' + s.batch_id + '</code></td><td><span class="badge ' +
        (s.scan_type === 'DISPATCH' ? 'badge-blue' : s.scan_type === 'RECEIVE' ? 'badge-yellow' : 'badge-green') +
        '">' + s.scan_type + '</span></td><td>' + (s.scanned_by_name || '—') + '</td><td>' + (s.location || '—') + '</td><td>' + timeAgo(s.timestamp) + '</td></tr>').join('') +
      '</tbody></table>' : '<div class="empty-state">No scans logged</div>';
  } catch (e) { }
}

async function loadAdminBatches() {
  const status = document.getElementById('batchStatusFilter') ? document.getElementById('batchStatusFilter').value : '';
  try {
    const batches = await api('/api/batches' + (status ? '?status=' + status : ''));
    renderBatchTable(batches, 'adminBatchTable');
  } catch (e) { }
}

function renderBatchTable(batches, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const statusBadge = function (s) { return ({ CREATED: 'badge-blue', DISPATCHED: 'badge-yellow', RECEIVED: 'badge-purple', DISTRIBUTED: 'badge-green' })[s] || 'badge-blue'; };
  el.innerHTML = batches.length
    ? '<table><thead><tr><th>Batch ID</th><th>Commodity</th><th>Weight</th><th>Warehouse</th><th>Shop</th><th>Moisture%</th><th>Status</th><th>Created</th></tr></thead><tbody>' +
    batches.map(function (b) { return '<tr><td><code style="font-size:0.75rem">' + b.batch_id + '</code></td><td>' + cap(b.commodity) + '</td><td>' + b.weight + ' kg</td><td>' + (b.warehouse_name || '—') + '</td><td>' + (b.shop_name || '—') + '</td><td>' + (b.moisture_level || 0) + '%</td><td><span class="badge ' + statusBadge(b.status) + '">' + b.status + '</span></td><td>' + timeAgo(b.created_at) + '</td></tr>'; }).join('') + '</tbody></table>'
    : '<div class="empty-state">No batches found</div>';
}

// ═══ FARMER DASHBOARD ═══
async function loadFarmerDashboard() {
  try {
    const d = await api('/api/farmer/me');
    const s = d.stats || {};
    const pending = d.pending_amount || 0;
    const paid = d.total_paid || 0;
    document.getElementById('farmerKpiGrid').innerHTML =
      kpiCard('🌾', 'Total Supplied', fmt(d.total_supplied) + ' kg', 'teal') +
      kpiCard('✅', 'Accepted', fmt(d.transactions ? d.transactions.reduce(function (a, t) { return a + (t.accepted_quantity || 0); }, 0) : 0) + ' kg', 'green') +
      kpiCard('❌', 'Rejected', fmt(d.transactions ? d.transactions.reduce(function (a, t) { return a + (t.rejected_quantity || 0); }, 0) : 0) + ' kg', 'red') +
      kpiCard('💰', 'Total Paid', '₹' + fmt(paid), 'green') +
      kpiCard('⏳', 'Pending Payment', '₹' + fmt(pending), pending > 0 ? 'yellow' : 'green') +
      kpiCard('📦', 'Commodity', cap(d.commodity || ''), 'blue') +
      kpiCard('📅', 'Days Since Supply', d.days_since_supply != null ? d.days_since_supply + ' days' : '—', d.days_since_supply > 30 ? 'red' : 'green');

    const txs = d.transactions || [];
    document.getElementById('farmerTxTable').innerHTML = txs.length
      ? '<table><thead><tr><th>Date</th><th>Batch</th><th>Qty (kg)</th><th>Accepted</th><th>Rejected</th><th>Rate</th><th>Amount</th><th>Payment</th></tr></thead><tbody>' +
      txs.map(function (t) {
        var amt = (t.accepted_quantity || 0) * (t.rate_per_kg || 0);
        return '<tr><td>' + timeAgo(t.created_at) + '</td><td>' + (t.batch_id || '—') + '</td><td>' + (t.quantity || 0) + '</td><td>' + (t.accepted_quantity || 0) + '</td><td>' + (t.rejected_quantity || 0) + '</td><td>₹' + (t.rate_per_kg || 0) + '/kg</td><td>₹' + fmt(amt) + '</td><td><span class="badge ' + (t.payment_status === 'PAID' ? 'badge-green' : 'badge-yellow') + '">' + t.payment_status + '</span></td></tr>';
      }).join('') + '</tbody></table>'
      : '<div class="empty-state">No transactions yet</div>';

    document.getElementById('farmerMoistureTable').innerHTML = txs.length
      ? '<table><thead><tr><th>Date</th><th>Batch</th><th>Moisture %</th><th>Status</th></tr></thead><tbody>' +
      txs.map(function (t) {
        var fl = parseFloat(t.moisture_level || 0);
        return '<tr><td>' + timeAgo(t.created_at) + '</td><td>' + (t.batch_id || '—') + '</td><td>' + fl.toFixed(1) + '%</td><td><span class="badge ' + (fl > 14 ? 'badge-red' : fl > 12 ? 'badge-yellow' : 'badge-green') + '">' + (fl > 14 ? 'Critical' : fl > 12 ? 'Warning' : 'Normal') + '</span></td></tr>';
      }).join('') + '</tbody></table>'
      : '<div class="empty-state">No moisture readings</div>';
  } catch (e) { showToast(e.message, 'error'); }
}

// ═══ BATCH MODULE (Warehouse QR Dispatch) ═══
let _batchShopsLoaded = false;
async function loadBatchModule() {
  try {
    if (!_batchShopsLoaded) {
      const [shops, farmers] = await Promise.all([api('/api/shops'), api('/api/farmers')]);
      document.getElementById('batchShop').innerHTML = shops.map(function (s) { return '<option value="' + s.id + '">' + s.name + '</option>'; }).join('');
      document.getElementById('batchFarmer').innerHTML = '<option value="">— None —</option>' + farmers.map(function (f) { return '<option value="' + f.id + '">' + f.name + ' (' + cap(f.commodity) + ')</option>'; }).join('');
      _batchShopsLoaded = true;
    }
    const batches = await api('/api/batches');
    renderBatchTable(batches, 'batchListTable');
  } catch (e) { showToast(e.message, 'error'); }
}

async function createBatch(e) {
  e.preventDefault();
  const commodity = document.getElementById('batchCommodity').value;
  const weight = document.getElementById('batchWeight').value;
  const shop_id = document.getElementById('batchShop').value;
  const farmer_id = document.getElementById('batchFarmer').value;
  const moisture_level = document.getElementById('batchMoisture').value || 0;
  try {
    const res = await api('/api/batches/create', { method: 'POST', body: JSON.stringify({ commodity, weight, shop_id, farmer_id: farmer_id || null, moisture_level }) });
    showToast('✅ Batch dispatched: ' + res.batch_id, 'success');
    // Generate QR code
    const qrDiv = document.getElementById('qrDisplay');
    qrDiv.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      new QRCode(qrDiv, { text: res.qr_data, width: 180, height: 180, colorDark: '#4B3621', colorLight: '#F7F3E8' });
    } else {
      qrDiv.innerHTML = '<p style="word-break:break-all;font-size:0.7rem;color:var(--text-muted)">' + res.batch_id + '</p>';
    }
    var info = document.getElementById('batchInfo');
    info.classList.remove('hidden');
    info.innerHTML = '<div class="info-box-row"><span class="info-box-label">Batch ID</span><span class="info-box-value" style="font-family:monospace">' + res.batch_id + '</span></div>' +
      '<div class="info-box-row"><span class="info-box-label">Hash</span><span class="info-box-value" style="font-size:0.65rem;word-break:break-all">' + res.hash.substring(0, 32) + '…</span></div>';
    loadBatchModule();
  } catch (e) { showToast(e.message, 'error'); }
}

async function updatePrice(item, cardCode) {
  const price = parseFloat(document.getElementById(`price-${item}-${cardCode}`).value);
  try {
    const res = await api('/api/admin/pricing', { method: 'PUT', body: JSON.stringify({ item, card_code: cardCode, price }) });
    showToast(`✅ ${res.message}`, 'success');
    cachedPrices = null;
  } catch (e) { showToast(e.message, 'error'); }
}

async function updateComplaintStatus(id, status) {
  try {
    await api(`/api/complaints/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
    showToast(`✅ Complaint status updated to ${status}`, 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// ═══ WAREHOUSE MODULE ═══
async function loadWarehouseModule() {
  try {
    const warehouses = await api('/api/warehouses');
    const sel = document.getElementById('warehouseSelect');
    sel.innerHTML = warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    if (currentUser.linked_warehouse_id) sel.value = currentUser.linked_warehouse_id;
    await loadWarehouse();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadWarehouse() {
  const whId = document.getElementById('warehouseSelect').value;
  try {
    const wh = await api(`/api/warehouses/${whId}`);
    document.getElementById('warehouseKPIs').innerHTML = `
      ${kpiCard('🌾', 'Rice Stock', `${fmt(wh.rice_closing)} kg`, 'teal', `Recv: ${fmt(wh.rice_received)} | Disp: ${fmt(wh.rice_dispatched)}`)}
      ${kpiCard('🌿', 'Wheat Stock', `${fmt(wh.wheat_closing)} kg`, 'blue', `Recv: ${fmt(wh.wheat_received)} | Disp: ${fmt(wh.wheat_dispatched)}`)}
      ${kpiCard('🍚', 'Sugar Stock', `${fmt(wh.sugar_closing)} kg`, 'green', `Recv: ${fmt(wh.sugar_received)} | Disp: ${fmt(wh.sugar_dispatched)}`)}
      ${kpiCard('⚠', 'Damaged', `${fmt(wh.rice_damaged + wh.wheat_damaged + wh.sugar_damaged)} kg`, 'yellow')}
      ${kpiCard('🔒', 'Risk Score', wh.risk_score, wh.risk_score > 60 ? 'red' : wh.risk_score > 30 ? 'yellow' : 'green')}`;
    document.getElementById('dispatchShop').innerHTML = wh.shops.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    renderRiskMeter('warehouseRiskMeter', wh.risk_score);
    renderStockChart(wh); renderDispatchChart(wh);
    if (wh.dispatches?.length) {
      document.getElementById('dispatchLogTable').innerHTML = `<table><thead><tr><th>Batch</th><th>Shop</th><th>Item</th><th>Qty</th><th>Time</th></tr></thead>
            <tbody>${wh.dispatches.map(d => `<tr><td><span class="badge badge-blue">${d.batch_id}</span></td><td>${d.shop_id}</td><td>${cap(d.item)}</td><td>${fmt(d.quantity)}</td><td>${timeAgo(d.timestamp)}</td></tr>`).join('')}</tbody></table>`;
    }
  } catch (e) { showToast(e.message, 'error'); }
}

function renderStockChart(wh) {
  const ctx = document.getElementById('stockMovementChart');
  if (charts.stockMovement) charts.stockMovement.destroy();
  charts.stockMovement = new Chart(ctx, {
    type: 'bar', data: {
      labels: ['Rice', 'Wheat', 'Sugar'], datasets: [
        { label: 'Received', data: [wh.rice_received, wh.wheat_received, wh.sugar_received], backgroundColor: 'rgba(76,107,60,0.75)', borderRadius: 6 },
        { label: 'Dispatched', data: [wh.rice_dispatched, wh.wheat_dispatched, wh.sugar_dispatched], backgroundColor: 'rgba(212,160,23,0.75)', borderRadius: 6 },
        { label: 'Damaged', data: [wh.rice_damaged, wh.wheat_damaged, wh.sugar_damaged], backgroundColor: 'rgba(159,29,29,0.75)', borderRadius: 6 },
        { label: 'Closing', data: [wh.rice_closing, wh.wheat_closing, wh.sugar_closing], backgroundColor: 'rgba(140,94,60,0.75)', borderRadius: 6 }
      ]
    }, options: chartOptions('Stock Movement (kg)')
  });
}

function renderDispatchChart(wh) {
  const ctx = document.getElementById('dispatchTrendChart');
  if (charts.dispatchTrend) charts.dispatchTrend.destroy();
  if (!wh.dispatches?.length) return;
  const byDate = {}; wh.dispatches.forEach(d => { const dt = d.timestamp.split(' ')[0]; byDate[dt] = (byDate[dt] || 0) + d.quantity; });
  const labels = Object.keys(byDate).sort();
  charts.dispatchTrend = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Dispatch Volume', data: labels.map(l => byDate[l]), borderColor: '#00b4d8', backgroundColor: 'rgba(0,180,216,0.1)', fill: true, tension: 0.4, pointRadius: 4 }] }, options: chartOptions('Dispatch Trend') });
}

async function addInbound(e) {
  e.preventDefault();
  const whId = document.getElementById('warehouseSelect').value, item = document.getElementById('inboundItem').value, quantity = parseFloat(document.getElementById('inboundQty').value);
  try { const res = await api(`/api/warehouses/${whId}/inbound`, { method: 'POST', body: JSON.stringify({ item, quantity }) }); showToast(`✅ ${quantity}kg ${item} added. Batch: ${res.batchId}`, 'success'); document.getElementById('inboundQty').value = ''; loadWarehouse(); } catch (e) { showToast(e.message, 'error'); }
}
async function dispatchStock(e) {
  e.preventDefault();
  const whId = document.getElementById('warehouseSelect').value, shopId = document.getElementById('dispatchShop').value, item = document.getElementById('dispatchItem').value, quantity = parseFloat(document.getElementById('dispatchQty').value);
  try { const res = await api(`/api/warehouses/${whId}/dispatch`, { method: 'POST', body: JSON.stringify({ shopId, item, quantity }) }); showToast(`📦 ${quantity}kg dispatched. Batch: ${res.batchId}`, 'success'); document.getElementById('dispatchQty').value = ''; loadWarehouse(); } catch (e) { showToast(e.message, 'error'); }
}
async function logDamage(e) {
  e.preventDefault();
  const whId = document.getElementById('warehouseSelect').value, item = document.getElementById('damageItem').value, quantity = parseFloat(document.getElementById('damageQty').value), reason = document.getElementById('damageReason').value;
  try { const res = await api(`/api/warehouses/${whId}/damage`, { method: 'POST', body: JSON.stringify({ item, quantity, reason }) }); if (res.flagged) showToast(`⚠ ${res.warning}`, 'warning'); else showToast(`✅ Damage logged: ${quantity}kg`, 'success'); document.getElementById('damageQty').value = ''; document.getElementById('damageReason').value = ''; loadWarehouse(); } catch (e) { showToast(e.message, 'error'); }
}
// ═══ SHOP MODULE ═══
async function loadShopModule() {
  try {
    const shops = await api('/api/shops');
    const sel = document.getElementById('shopSelect');
    sel.innerHTML = shops.map(s => `<option value="${s.id}">${s.name} (${s.district})</option>`).join('');
    if (currentUser.linked_shop_id) sel.value = currentUser.linked_shop_id;
    await loadShop();
  } catch (e) { showToast(e.message, 'error'); }
}

async function loadShop() {
  const shopId = document.getElementById('shopSelect').value;
  try {
    const shop = await api(`/api/shops/${shopId}`);
    const beneficiaries = await api(`/api/beneficiaries?shop_id=${shopId}`);
    const dR = shop.forecast?.rice?.daysLeft || '—', dW = shop.forecast?.wheat?.daysLeft || '—';
    document.getElementById('shopKPIs').innerHTML = `
      ${kpiCard('🌾', 'Rice', `${fmt(shop.rice_stock)} kg`, 'teal', `${dR} days left`)}
      ${kpiCard('🌿', 'Wheat', `${fmt(shop.wheat_stock)} kg`, 'blue', `${dW} days left`)}
      ${kpiCard('🍚', 'Sugar', `${fmt(shop.sugar_stock)} kg`, 'green')}
      ${kpiCard(shop.is_open ? '🟢' : '🔴', 'Status', shop.is_open ? 'Open' : 'Closed', shop.is_open ? 'green' : 'red', `${shop.open_time} – ${shop.close_time}`)}
      ${kpiCard('⚡', 'Violations', shop.violation_count, shop.violation_count > 5 ? 'red' : 'yellow')}
      ${kpiCard('🔒', 'Risk', shop.risk_score, shop.risk_score > 60 ? 'red' : shop.risk_score > 30 ? 'yellow' : 'green')}`;
    // Ration card lookup replaces beneficiary dropdown
    updateShopStatusUI(shop.is_open !== undefined ? shop.is_open : 1);
    _currentShopIsOpen = shop.is_open;
    renderRiskMeter('shopRiskMeter', shop.risk_score);
    if (shop.riskBreakdown?.breakdown) {
      const bd = shop.riskBreakdown.breakdown;
      document.getElementById('shopRiskBreakdown').innerHTML = Object.entries(bd).map(([k, v]) => `<div class="risk-factor"><span class="risk-factor-label">${k.replace(/_/g, ' ')}</span><div class="risk-factor-bar"><div class="risk-factor-bar-fill" style="width:${v}%;background:${v > 15 ? 'var(--red)' : v > 8 ? 'var(--yellow)' : 'var(--green)'}"></div></div><span class="risk-factor-value">${v}</span></div>`).join('');
    }
    if (shop.recentTransactions?.length) {
      document.getElementById('shopTxTable').innerHTML = `<table><thead><tr><th>Bill</th><th>Beneficiary</th><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th>Card</th><th>Violation</th><th>Time</th></tr></thead>
            <tbody>${shop.recentTransactions.map(t => `<tr>
              <td><span class="badge badge-blue">${t.bill_number || '—'}</span></td>
              <td>${t.beneficiary_name || '—'}</td><td>${cap(t.item)}</td><td>${t.quantity} kg</td><td>₹${t.price}/kg</td>
              <td><strong>₹${t.total_amount || t.quantity * t.price}</strong></td>
              <td><span class="badge ${t.card_type === 'Yellow' ? 'badge-yellow' : t.card_type === 'Pink' ? 'badge-purple' : 'badge-blue'}">${t.card_type}</span></td>
              <td>${t.violation_flag ? `<span class="badge badge-red">${t.violation_type}</span>` : '<span class="badge badge-green">Clean</span>'}</td>
              <td>${timeAgo(t.timestamp)}</td></tr>`).join('')}</tbody></table>`;
    } else { document.getElementById('shopTxTable').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div>No transactions yet</div>'; }
  } catch (e) { showToast(e.message, 'error'); }
}

async function lookupBeneficiary() {
  const rationCard = document.getElementById('txRationCard').value.trim().toUpperCase();
  const cardType = document.getElementById('txCardType').value;
  const infoBox = document.getElementById('beneficiaryInfo');
  if (!rationCard) { showToast('Enter ration card number', 'warning'); return; }
  try {
    let url = '/api/beneficiaries/lookup?ration_card=' + encodeURIComponent(rationCard);
    if (cardType) url += '&card_type=' + encodeURIComponent(cardType);
    const b = await api(url);
    document.getElementById('txBeneficiary').value = b.id;
    infoBox.classList.remove('hidden');
    infoBox.innerHTML = `
      <div class="info-box-row"><span class="info-box-label">Name</span><span class="info-box-value">${b.name}</span></div>
      <div class="info-box-row"><span class="info-box-label">Ration Card</span><span class="info-box-value">${b.ration_card_number}</span></div>
      <div class="info-box-row"><span class="info-box-label">Card Type</span><span class="info-box-value">${b.card_code} (${b.card_name})</span></div>
      <div class="info-box-row"><span class="info-box-label">Rice Remaining</span><span class="info-box-value">${b.monthly_remaining_rice} kg</span></div>
      <div class="info-box-row"><span class="info-box-label">Wheat Remaining</span><span class="info-box-value">${b.monthly_remaining_wheat} kg</span></div>
      <div class="info-box-row"><span class="info-box-label">Sugar Remaining</span><span class="info-box-value">${b.monthly_remaining_sugar} kg</span></div>`;
    showToast('✅ Beneficiary verified: ' + b.name, 'success');
    await autoFillPrice(b.card_code);
    loadFamilyMembers(rationCard);
  } catch (e) {
    document.getElementById('txBeneficiary').value = '';
    infoBox.classList.add('hidden');
    showToast(e.message || 'Beneficiary not found', 'error');
  }
}

// Keep loadBeneficiaryInfo as alias for backward compat
async function loadBeneficiaryInfo() { await lookupBeneficiary(); }

async function autoFillPrice(cardCode) {
  const item = document.getElementById('txItem').value;
  try {
    if (!cachedPrices) cachedPrices = await api('/api/public/prices');
    const price = cachedPrices[item]?.[cardCode] || 0;
    document.getElementById('txPrice').value = price;
  } catch (e) { }
}

// ═══ WEIGHING MACHINE SIMULATION ═══
async function readWeighingScale() {
  const qtyInput = document.getElementById('txQuantity');
  const statusDiv = document.getElementById('weighingStatus');
  statusDiv.classList.remove('hidden');
  statusDiv.innerHTML = '<span class="weighing-anim">⚖ Connecting to scale...</span>';
  qtyInput.value = '';

  // Simulate scale reading with fluctuating values
  const finalWeight = (Math.random() * 4.5 + 0.5).toFixed(3);
  let step = 0;
  const interval = setInterval(() => {
    step++;
    const fluctuation = (parseFloat(finalWeight) + (Math.random() - 0.5) * 0.8).toFixed(3);
    qtyInput.value = fluctuation;
    statusDiv.innerHTML = `<span class="weighing-anim">⚖ Reading... ${fluctuation} kg</span>`;
    if (step >= 6) {
      clearInterval(interval);
      qtyInput.value = finalWeight;
      statusDiv.innerHTML = `<span class="weighing-done">✅ Stable reading: <strong>${finalWeight} kg</strong></span>`;
      setTimeout(() => statusDiv.classList.add('hidden'), 3000);
    }
  }, 400);
}

async function processTransaction(e) {
  e.preventDefault();
  const shopId = document.getElementById('shopSelect').value, beneficiaryId = document.getElementById('txBeneficiary').value;
  const item = document.getElementById('txItem').value, quantity = parseFloat(document.getElementById('txQuantity').value);
  const price = parseFloat(document.getElementById('txPrice').value);
  const resultDiv = document.getElementById('txResult');
  if (!beneficiaryId) { showToast('Please lookup the beneficiary first using ration card number', 'warning'); return; }
  if (!quantity || quantity <= 0) { showToast('Read weight from scale first', 'warning'); return; }
  try {
    const res = await api(`/api/shops/${shopId}/transaction`, { method: 'POST', body: JSON.stringify({ beneficiaryId, item, quantity, price }) });
    resultDiv.classList.remove('hidden');
    if (res.violations?.length > 0) {
      resultDiv.className = 'tx-result warning';
      resultDiv.innerHTML = `<strong>⚠ Violations:</strong><br>${res.violations.map(v => `• ${v.replace(/_/g, ' ')}`).join('<br>')}<br>Risk: ${res.newRiskScore}/100`;
    } else {
      resultDiv.className = 'tx-result success';
      resultDiv.innerHTML = `<strong>✅ Transaction successful</strong><br>Bill: <strong>${res.billNumber}</strong> | ${cap(item)}: ${quantity}kg × ₹${res.officialPrice} = <strong>₹${res.totalAmount}</strong>`;
    }
    document.getElementById('txQuantity').value = ''; document.getElementById('txRationCard').value = ''; document.getElementById('txBeneficiary').value = ''; document.getElementById('beneficiaryInfo').classList.add('hidden'); loadShop();
  } catch (err) { resultDiv.classList.remove('hidden'); resultDiv.className = 'tx-result error'; resultDiv.innerHTML = `<strong>❌ Blocked:</strong> ${err.message}`; }
}
// ═══ CITIZEN MODULE ═══
function switchCitizenTab(tabId) {
  document.querySelectorAll('.citizen-tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.citizen-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`citizen-tab-${tabId}`).classList.remove('hidden');
  document.querySelector(`.citizen-tab[onclick*="${tabId}"]`).classList.add('active');
}

async function loadCitizenModule() {
  try {
    const [shops, prices, complaints, orders] = await Promise.all([
      api('/api/public/shops'), api('/api/public/prices'), api('/api/complaints'), api('/api/citizen/orders')
    ]);
    cachedPrices = prices;

    // Orders table
    if (orders.length) {
      document.getElementById('citizenOrdersTable').innerHTML = `<table>
              <thead><tr><th>Bill No</th><th>Shop</th><th>Item</th><th>Qty</th><th>Price</th><th>Total</th><th>Date</th><th>Bill</th></tr></thead>
              <tbody>${orders.map(o => `<tr>
                <td><span class="badge badge-blue">${o.bill_number || '—'}</span></td>
                <td>${o.shop_name}</td><td>${cap(o.item)}</td><td>${o.quantity} kg</td>
                <td>₹${o.official_price}/kg</td><td><strong>₹${o.total_amount || (o.quantity * o.price)}</strong></td>
                <td>${timeAgo(o.timestamp)}</td>
                <td><button class="btn btn-primary btn-sm" onclick="viewBill(${o.id})">🧾 View</button></td>
              </tr>`).join('')}</tbody></table>`;
    } else { document.getElementById('citizenOrdersTable').innerHTML = '<div class="empty-state"><div class="empty-state-icon">🧾</div>No orders yet. Your transactions will appear here.</div>'; }

    // Shop stock
    document.getElementById('citizenShopTable').innerHTML = `<table>
          <thead><tr><th>Shop</th><th>District</th><th>Rice</th><th>Wheat</th><th>Sugar</th><th>Days Left</th><th>Risk</th><th>Status</th></tr></thead>
          <tbody>${shops.map(s => {
      const dl = s.forecast?.rice?.daysLeft || '—';
      const rc = s.risk_score > 60 ? 'badge-red' : s.risk_score > 30 ? 'badge-yellow' : 'badge-green';
      return `<tr><td><strong>${s.name}</strong></td><td>${s.district}</td>
            <td>${fmt(s.rice_stock)} kg</td><td>${fmt(s.wheat_stock)} kg</td><td>${fmt(s.sugar_stock)} kg</td>
            <td><span class="badge ${dl < 7 ? 'badge-red' : dl < 14 ? 'badge-yellow' : 'badge-green'}">${dl} days</span></td>
            <td><span class="badge ${rc}">${s.risk_score}/100</span></td>
            <td>${s.is_open ? '🟢 Open' : '🔴 Closed'}</td></tr>`;
    }).join('')}</tbody></table>`;

    // Prices
    document.getElementById('priceList').innerHTML = `
      <div class="price-row"><span class="price-item">🌾 Rice (White/Pink card)</span><span class="price-value">₹${prices.rice?.White || 4}/kg</span></div>
      <div class="price-row"><span class="price-item">🌾 Rice (Yellow card – AAY)</span><span class="price-value">₹${prices.rice?.Yellow || 2}/kg</span></div>
      <div class="price-row"><span class="price-item">🌿 Wheat (all cards)</span><span class="price-value">₹${prices.wheat?.White || 3}/kg</span></div>
      <div class="price-row"><span class="price-item">🍚 Sugar (all cards)</span><span class="price-value">₹${prices.sugar?.White || 13.5}/kg</span></div>
      <p style="color:var(--text-muted);font-size:0.8rem;margin-top:12px">* Prices are fixed by the government and managed by the Admin</p>`;

    // Complaint shop selector
    document.getElementById('complaintShop').innerHTML = shops.map(s => `<option value="${s.id}">${s.name} (${s.district})</option>`).join('');

    // Complaints
    if (complaints.length) {
      document.getElementById('complaintsList').innerHTML = `<table>
              <thead><tr><th>Shop</th><th>Complaint</th><th>Category</th><th>Urgency</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>${complaints.map(c => `<tr>
                <td>${c.shop_name}</td><td>${c.text.substring(0, 50)}${c.text.length > 50 ? '...' : ''}</td>
                <td><span class="badge ${categoryBadge(c.category)}">${(c.category || 'general').replace(/_/g, ' ')}</span></td>
                <td><span class="badge ${c.urgency === 'critical' ? 'badge-red' : c.urgency === 'high' ? 'badge-yellow' : 'badge-blue'}">${c.urgency}</span></td>
                <td>${c.status}</td><td>${timeAgo(c.created_at)}</td></tr>`).join('')}</tbody></table>`;
    }
  } catch (e) { showToast(e.message, 'error'); }
}

async function viewBill(txId) {
  try {
    const tx = await api(`/api/citizen/bill/${txId}`);
    const modal = document.getElementById('billModal');
    document.getElementById('billContent').innerHTML = `
      <div class="bill-header">
        <div class="bill-logo">🛡 TrustChain PDS</div>
        <div class="bill-title">Official Distribution Receipt</div>
        <div class="bill-subtitle">Government of Kerala – Public Distribution System</div>
      </div>
      <div class="bill-divider"></div>
      <div class="bill-info">
        <div class="bill-row"><span>Bill Number:</span><strong>${tx.bill_number || 'N/A'}</strong></div>
        <div class="bill-row"><span>Date:</span><strong>${timeAgo(tx.timestamp)}</strong></div>
        <div class="bill-row"><span>Shop:</span><strong>${tx.shop_name}</strong></div>
        <div class="bill-row"><span>District:</span><strong>${tx.shop_district}</strong></div>
      </div>
      <div class="bill-divider"></div>
      <div class="bill-info">
        <div class="bill-row"><span>Beneficiary:</span><strong>${tx.beneficiary_name || '—'}</strong></div>
        <div class="bill-row"><span>Card Type:</span><strong>${tx.card_code} (${tx.card_name || ''})</strong></div>
      </div>
      <div class="bill-divider"></div>
      <table class="bill-table">
        <thead><tr><th>Item</th><th>Qty (kg)</th><th>Rate (₹/kg)</th><th>Amount (₹)</th></tr></thead>
        <tbody><tr><td>${cap(tx.item)}</td><td>${tx.quantity}</td><td>₹${tx.official_price}</td><td><strong>₹${tx.total_amount || (tx.quantity * tx.official_price)}</strong></td></tr></tbody>
        <tfoot><tr><td colspan="3" style="text-align:right"><strong>Total Payable:</strong></td><td><strong style="font-size:1.2em">₹${tx.total_amount || (tx.quantity * tx.official_price)}</strong></td></tr></tfoot>
      </table>
      <div class="bill-divider"></div>
      ${tx.violation_flag ? `<div class="bill-warning">⚠ Violation detected: ${(tx.violation_type || '').replace(/_/g, ' ')}</div>` : '<div class="bill-ok">✅ Transaction verified — No violations detected</div>'}
      <div class="bill-footer">
        <div>Verified by TrustChain PDS Integrity System</div>
        <div style="font-size:0.75em;color:#999">This is a computer-generated receipt and does not require a signature</div>
      </div>`;
    modal.classList.remove('hidden');
  } catch (e) { showToast(e.message, 'error'); }
}

function closeBillModal() { document.getElementById('billModal').classList.add('hidden'); }

function printBill() {
  const content = document.getElementById('billContent').innerHTML;
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>TrustChain PDS Bill</title><style>
      body{font-family:Inter,sans-serif;padding:20px;max-width:400px;margin:0 auto}
      .bill-header{text-align:center}.bill-logo{font-size:1.5em;font-weight:700}.bill-title{font-size:1.1em;font-weight:600;margin:4px 0}
      .bill-subtitle{font-size:0.8em;color:#666}.bill-divider{border-top:1px dashed #ccc;margin:12px 0}
      .bill-row{display:flex;justify-content:space-between;margin:4px 0;font-size:0.9em}
      .bill-table{width:100%;border-collapse:collapse;margin:8px 0}.bill-table th,.bill-table td{padding:6px 8px;border:1px solid #ddd;font-size:0.85em;text-align:left}
      .bill-table thead{background:#f5f5f5}.bill-warning{color:#d32f2f;text-align:center;padding:8px;font-weight:600}
      .bill-ok{color:#2e7d32;text-align:center;padding:8px;font-weight:600}.bill-footer{text-align:center;margin-top:16px;font-size:0.8em;color:#666}
      @media print{body{padding:0}}
    </style></head><body>${content}</body></html>`);
  win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
}

async function submitComplaint(e) {
  e.preventDefault();
  const shopId = document.getElementById('complaintShop').value, text = document.getElementById('complaintText').value, citizenName = document.getElementById('complaintName').value;
  const resultDiv = document.getElementById('complaintResult');
  try {
    const res = await api('/api/complaints', { method: 'POST', body: JSON.stringify({ shopId, text, citizenName }) });
    resultDiv.classList.remove('hidden'); resultDiv.className = 'tx-result success';
    resultDiv.innerHTML = `<strong>✅ Complaint submitted</strong><br>Category: <strong>${(res.category || '').replace(/_/g, ' ')}</strong> | Urgency: <strong>${res.urgency}</strong>`;
    document.getElementById('complaintText').value = ''; document.getElementById('complaintName').value = ''; loadCitizenModule();
  } catch (err) { resultDiv.classList.remove('hidden'); resultDiv.className = 'tx-result error'; resultDiv.innerHTML = err.message; }
}

// ═══ ANALYTICS MODULE ═══
async function loadAnalyticsModule() {
  try {
    const [shortage, diversion, restock, consumption] = await Promise.all([api('/api/analytics/shortage'), api('/api/analytics/diversion'), api('/api/analytics/restock'), api('/api/analytics/consumption')]);
    document.getElementById('shortageCards').innerHTML = shortage.map(s => {
      if (!s) return ''; const rice = s.forecasts?.rice; const ac = rice?.alert === 'critical' ? 'red' : rice?.alert === 'warning' ? 'yellow' : 'green';
      return kpiCard('⏰', s.shopName, `${rice?.daysLeft || '—'} days`, ac, `Rice: ${fmt(rice?.currentStock || 0)}kg | Avg: ${rice?.avgDailyDistribution || 0}kg/day`);
    }).join('');
    document.getElementById('restockTable').innerHTML = `<table><thead><tr><th>Shop</th><th>Item</th><th>Current</th><th>30-Day</th><th>Recommend</th><th>Urgency</th></tr></thead>
        <tbody>${restock.filter(r => r).flatMap(r => Object.entries(r.recommendations).map(([item, d]) => `<tr><td>${r.shopName}</td><td>${cap(item)}</td><td>${fmt(d.currentStock)} kg</td><td>${fmt(d.projectedDemand30Days)} kg</td><td><strong>${fmt(d.recommendedDispatch)} kg</strong></td><td><span class="badge ${d.urgency === 'critical' ? 'badge-red' : d.urgency === 'warning' ? 'badge-yellow' : 'badge-green'}">${d.urgency}</span></td></tr>`)).join('')}</tbody></table>`;
    renderConsumptionChart(consumption);
    document.getElementById('riskHeatmap').innerHTML = diversion.filter(d => d).map(d => { const rl = d.diversionProbability > 60 ? 2 : d.diversionProbability > 30 ? 1 : 0; return `<div class="heatmap-cell risk-${rl}"><div class="heatmap-shop">${d.shopName}</div><div class="heatmap-district">${d.district}</div><div class="heatmap-score" style="color:${rl === 2 ? 'var(--red)' : rl === 1 ? 'var(--yellow)' : 'var(--green)'}">${d.diversionProbability}%</div><div class="heatmap-level" style="color:${rl === 2 ? 'var(--red)' : rl === 1 ? 'var(--yellow)' : 'var(--green)'}">${d.level} risk</div></div>`; }).join('');
    const sorted = diversion.filter(d => d).sort((a, b) => a.diversionProbability - b.diversionProbability);
    document.getElementById('complianceRanking').innerHTML = `<table><thead><tr><th>#</th><th>Shop</th><th>District</th><th>Diversion</th><th>Level</th></tr></thead><tbody>${sorted.map((s, i) => `<tr><td><strong>${i + 1}</strong></td><td>${s.shopName}</td><td>${s.district}</td><td><strong>${s.diversionProbability}%</strong></td><td><span class="badge ${s.level === 'high' ? 'badge-red' : s.level === 'medium' ? 'badge-yellow' : 'badge-green'}">${s.level}</span></td></tr>`).join('')}</tbody></table>`;
  } catch (e) { showToast(e.message, 'error'); }
}

function renderConsumptionChart(data) {
  const ctx = document.getElementById('consumptionChart'); if (charts.consumption) charts.consumption.destroy(); if (!data?.length) return;
  const dates = [...new Set(data.map(d => d.date))].sort(), items = [...new Set(data.map(d => d.item))], colors = { rice: '#00b4d8', wheat: '#D4A017', sugar: '#4C6B3C' };
  charts.consumption = new Chart(ctx, { type: 'line', data: { labels: dates, datasets: items.map(item => ({ label: cap(item), data: dates.map(date => { const m = data.find(d => d.date === date && d.item === item); return m ? m.total : 0; }), borderColor: colors[item] || '#94a3b8', backgroundColor: (colors[item] || '#94a3b8') + '22', fill: true, tension: 0.4, pointRadius: 4 })) }, options: chartOptions('Daily Consumption (kg)') });
}

// ═══ REPORT MODULE ═══
async function loadReportModule() {
  try {
    const shops = await api('/api/shops');
    const sel = document.getElementById('reportShop');
    sel.innerHTML = shops.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    if (currentUser.linked_shop_id) sel.value = currentUser.linked_shop_id;
    await generateReport();
  } catch (e) { showToast(e.message, 'error'); }
}

async function generateReport() {
  const shopId = document.getElementById('reportShop').value; if (!shopId) return;
  try {
    const r = await api(`/api/reports/${shopId}`);
    document.getElementById('reportContent').innerHTML = `
      <div class="report-header"><h1>🛡 TrustChain PDS – Monthly Integrity Report</h1>
        <p><strong>${r.shop.name}</strong> | ${r.shop.district} District</p>
        <p>Warehouse: ${r.shop.warehouse_name} | Report Date: ${new Date(r.generatedAt).toLocaleDateString('en-IN')}</p></div>
      <h2>📦 Allocation vs Distribution</h2>
      <table><thead><tr><th>Item</th><th>Allocated (kg)</th></tr></thead>
        <tbody>${r.allocation.length ? r.allocation.map(a => `<tr><td>${cap(a.item)}</td><td>${fmt(a.total)}</td></tr>`).join('') : '<tr><td colspan="2">No data</td></tr>'}</tbody></table>
      <h2>📊 Category-wise Distribution</h2>
      <table><thead><tr><th>Item</th><th>Card</th><th>Total (kg)</th></tr></thead>
        <tbody>${r.distribution.length ? r.distribution.map(d => `<tr><td>${cap(d.item)}</td><td><span class="report-badge" style="background:${d.card_type === 'Yellow' ? '#fef3c7;color:#92400e' : d.card_type === 'Pink' ? '#fce7f3;color:#9d174d' : '#dbeafe;color:#1e40af'}">${d.card_type}</span></td><td>${fmt(d.total)}</td></tr>`).join('') : '<tr><td colspan="3">No data</td></tr>'}</tbody></table>
      <h2>⚠ Violations</h2>
      <table><thead><tr><th>Type</th><th>Count</th></tr></thead>
        <tbody>${r.violations.length ? r.violations.map(v => `<tr><td>${(v.violation_type || 'N/A').replace(/_/g, ' ')}</td><td style="color:#9F1D1D;font-weight:700">${v.count}</td></tr>`).join('') : '<tr><td colspan="2" style="color:#16a34a">No violations ✅</td></tr>'}</tbody></table>
      <h2>🔒 Risk Score: ${r.riskBreakdown?.riskScore || 0}/100</h2>
      <table><thead><tr><th>Factor</th><th>Score</th></tr></thead>
        <tbody>${r.riskBreakdown?.breakdown ? Object.entries(r.riskBreakdown.breakdown).map(([k, v]) => `<tr><td>${k.replace(/_/g, ' ')}</td><td>${v}</td></tr>`).join('') : ''}</tbody></table>
      <h2>📢 Complaints</h2>
      <table><thead><tr><th>Category</th><th>Count</th><th>Urgency</th></tr></thead>
        <tbody>${r.complaints.length ? r.complaints.map(c => `<tr><td>${(c.category || '').replace(/_/g, ' ')}</td><td>${c.count}</td><td>${c.urgency}</td></tr>`).join('') : '<tr><td colspan="3" style="color:#16a34a">No complaints ✅</td></tr>'}</tbody></table>
      <div style="text-align:center;margin-top:30px;padding-top:20px;border-top:2px solid #ddd">
        <p style="font-size:0.8rem;color:#888">Generated by TrustChain PDS | ${new Date(r.generatedAt).toLocaleString('en-IN')}</p></div>`;
  } catch (e) { showToast(e.message, 'error'); }
}

async function downloadReportPDF() {
  const el = document.getElementById('reportContent'); if (!el.innerHTML.trim()) { showToast('Generate report first', 'warning'); return; }
  showToast('📄 Generating PDF...', 'info');
  try {
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const { jsPDF } = window.jspdf; const pdf = new jsPDF('p', 'mm', 'a4');
    const imgW = 190, imgH = (canvas.height * imgW) / canvas.width; let hLeft = imgH, pos = 10;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, pos, imgW, imgH); hLeft -= 277;
    while (hLeft > 0) { pos = hLeft - imgH + 10; pdf.addPage(); pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, pos, imgW, imgH); hLeft -= 277; }
    pdf.save(`TrustChain_Report_${new Date().toISOString().slice(0, 10)}.pdf`); showToast('✅ PDF downloaded!', 'success');
  } catch (e) { showToast('PDF failed: ' + e.message, 'error'); }
}

// ═══ SUPPLY CHAIN MODULE ═══
async function loadSupplyChainModule() {
  try {
    const data = await api('/api/supply-chain/logs');
    document.getElementById('supplyChainFlow').innerHTML = `<div class="flow-node"><div class="flow-node-icon">🏭</div><div class="flow-node-label">Warehouses</div><div class="flow-node-count">${data.warehouses.length} active</div></div><div class="flow-arrow">→</div><div class="flow-node"><div class="flow-node-icon">📤</div><div class="flow-node-label">Dispatch</div><div class="flow-node-count">${data.dispatches.length} records</div></div><div class="flow-arrow">→</div><div class="flow-node"><div class="flow-node-icon">🏪</div><div class="flow-node-label">Shops</div><div class="flow-node-count">${data.shops.length} active</div></div><div class="flow-arrow">→</div><div class="flow-node"><div class="flow-node-icon">👥</div><div class="flow-node-label">Beneficiaries</div><div class="flow-node-count">${data.transactions.length} tx</div></div>`;
    document.getElementById('reconciliationTable').innerHTML = `<table><thead><tr><th>Warehouse</th><th>Item</th><th>Received</th><th>Dispatched</th><th>Damaged</th><th>Closing</th></tr></thead><tbody>${data.warehouses.flatMap(w => ['rice', 'wheat', 'sugar'].map(i => `<tr><td>${w.name}</td><td>${cap(i)}</td><td>${fmt(w[i].received)} kg</td><td>${fmt(w[i].dispatched)} kg</td><td>${fmt(w[i].damaged)} kg</td><td><strong>${fmt(w[i].closing)} kg</strong></td></tr>`)).join('')}</tbody></table>`;
    document.getElementById('batchTracker').innerHTML = `<table><thead><tr><th>Batch</th><th>From</th><th>To</th><th>Item</th><th>Qty</th><th>Time</th></tr></thead><tbody>${data.dispatches.slice(0, 15).map(d => `<tr><td><span class="badge badge-blue">${d.batch_id}</span></td><td>${d.warehouse_name}</td><td>${d.shop_name}</td><td>${cap(d.item)}</td><td>${fmt(d.quantity)} kg</td><td>${timeAgo(d.timestamp)}</td></tr>`).join('')}</tbody></table>`;
    document.getElementById('supplyChainLog').innerHTML = `<table><thead><tr><th>Shop</th><th>Beneficiary</th><th>Item</th><th>Qty</th><th>Price</th><th>Violation</th><th>Time</th></tr></thead><tbody>${data.transactions.slice(0, 20).map(t => `<tr><td>${t.shop_name}</td><td>${t.beneficiary_name || '—'}</td><td>${cap(t.item)}</td><td>${t.quantity} kg</td><td>₹${t.price}/kg</td><td>${t.violation_flag ? `<span class="badge badge-red">${t.violation_type}</span>` : '<span class="badge badge-green">OK</span>'}</td><td>${timeAgo(t.timestamp)}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) { showToast(e.message, 'error'); }
}

// ═══ RISK ENGINE MODULE ═══
async function loadRiskModule() {
  try {
    const data = await api('/api/risk-scores');
    document.getElementById('weightConfig').innerHTML = Object.entries(data.weights).map(([k, v]) => `<div class="weight-item"><span class="weight-label">${k.replace(/_/g, ' ')}</span><span class="weight-value">${(v * 100).toFixed(0)}%</span></div>`).join('');
    document.getElementById('riskBreakdownTable').innerHTML = `<table><thead><tr><th>Shop</th><th>District</th><th>Mismatch</th><th>Stock-out</th><th>Pricing</th><th>After-hrs</th><th>Damage</th><th>Complaints</th><th>Partial</th><th>Total</th></tr></thead><tbody>${data.shops.map(s => { const b = s.breakdown; return `<tr><td><strong>${s.name}</strong></td><td>${s.district}</td><td>${b.stock_mismatch}</td><td>${b.artificial_stockout}</td><td>${b.price_violations}</td><td>${b.after_hours}</td><td>${b.damage_anomalies}</td><td>${b.complaint_frequency}</td><td>${b.partial_allocation}</td><td><span class="badge ${s.risk_score > 60 ? 'badge-red' : s.risk_score > 30 ? 'badge-yellow' : 'badge-green'}">${s.risk_score}</span></td></tr>`; }).join('')}</tbody></table>`;
    document.getElementById('riskLeaderboard').innerHTML = data.shops.map((s, i) => `<div class="leaderboard-item"><div class="leaderboard-rank">${i + 1}</div><div class="leaderboard-info"><div class="leaderboard-shop">${s.name}</div><div class="leaderboard-district">${s.district} | Violations: ${s.violation_count}</div></div><div class="leaderboard-score" style="color:${s.risk_score > 60 ? 'var(--red)' : s.risk_score > 30 ? 'var(--yellow)' : 'var(--green)'}">${s.risk_score}</div></div>`).join('');
  } catch (e) { showToast(e.message, 'error'); }
}

// ═══ SHARED ═══
function renderRiskMeter(id, score) { const c = document.getElementById(id), color = score > 60 ? '#9F1D1D' : score > 30 ? '#D4A017' : '#4C6B3C', label = score > 60 ? 'HIGH RISK' : score > 30 ? 'MEDIUM' : 'LOW RISK', lc = score > 60 ? 'risk-high' : score > 30 ? 'risk-medium' : 'risk-low', circ = Math.PI * 80, off = circ - (score / 100) * circ; c.innerHTML = `<div class="risk-meter"><svg viewBox="0 0 200 110"><path class="risk-meter-bg" d="M 20 95 A 80 80 0 0 1 180 95"/><path class="risk-meter-fill" d="M 20 95 A 80 80 0 0 1 180 95" stroke="${color}" stroke-dasharray="${circ}" stroke-dashoffset="${off}"/><text class="risk-meter-value" x="100" y="85">${score}</text><text class="risk-meter-label" x="100" y="105">RISK SCORE</text></svg></div><div class="risk-level ${lc}">${label}</div>`; }
function kpiCard(icon, label, value, cc, sub) { return `<div class="kpi-card"><div class="kpi-icon">${icon}</div><div class="kpi-label">${label}</div><div class="kpi-value ${cc}">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`; }
function chartOptions(t) { return { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: t, color: '#94a3b8', font: { size: 13, weight: '600' } }, legend: { labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } }; }
function categoryBadge(cat) { const m = { diversion_alert: 'badge-red', pricing_violation: 'badge-yellow', artificial_shortage: 'badge-red', allocation_issue: 'badge-purple', operational_issue: 'badge-blue', general: 'badge-blue' }; return m[cat] || 'badge-blue'; }
function fmt(n) { return n != null ? Number(n).toLocaleString('en-IN') : '—'; }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function timeAgo(ts) { if (!ts) return '—'; const d = new Date(ts.replace(' ', 'T')); return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); }
function showToast(msg, type = 'info') { const t = document.getElementById('toast'); t.textContent = msg; t.className = `toast ${type}`; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 4000); }


// ═══════════════════════════════════════════════════════
// V3 FEATURE FUNCTIONS
// ═══════════════════════════════════════════════════════

// ─── F1: Dealer Open/Close ───
let _currentShopIsOpen = 1;
async function toggleShopStatus() {
  const shopId = document.getElementById('shopSelect') ? document.getElementById('shopSelect').value : (currentUser.linked_shop_id || 1);
  if (!shopId) return showToast('No shop selected', 'error');
  try {
    const res = await api('/api/shops/' + shopId + '/status', { method: 'PUT', body: JSON.stringify({ reason: '' }) });
    _currentShopIsOpen = res.is_open;
    updateShopStatusUI(_currentShopIsOpen);
    showToast(res.message, res.is_open ? 'success' : 'warning');
  } catch (e) { showToast(e.message, 'error'); }
}

function updateShopStatusUI(isOpen) {
  const badge = document.getElementById('shopStatusBadge');
  const label = document.getElementById('shopStatusLabel');
  const btn = document.getElementById('shopToggleBtn');
  if (badge) { badge.textContent = isOpen ? 'OPEN' : 'CLOSED'; badge.className = 'badge ' + (isOpen ? 'badge-green' : 'badge-red'); }
  if (label) label.textContent = isOpen ? 'Shop is currently accepting customers and transactions.' : 'Shop is CLOSED. All transactions are blocked.';
  if (btn) btn.textContent = isOpen ? '🔴 Close Shop' : '🟢 Open Shop';
}

// ─── F2: Family Members ───
async function loadFamilyMembers(rationCard) {
  try {
    const members = await api('/api/family-members?ration_card=' + encodeURIComponent(rationCard));
    const panel = document.getElementById('familyMembersPanel');
    const table = document.getElementById('familyMembersTable');
    if (!panel || !table) return;
    if (!members.length) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    table.innerHTML = '<table><thead><tr><th>Name</th><th>Age</th><th>Relationship</th><th>Aadhaar</th></tr></thead><tbody>' +
      members.map(function (m) {
        return '<tr><td><strong>' + m.name + '</strong></td><td>' + m.age + ' yrs</td><td>' + m.relationship + '</td><td style="font-family:monospace">' + m.aadhaar_masked + '</td></tr>';
      }).join('') + '</tbody></table>';
  } catch (e) { }
}

// ─── Farmer weight helpers ───
function calcFarmerNet() {
  const gross = parseFloat(document.getElementById('fsyWeight').value) || 0;
  const tare = parseFloat(document.getElementById('fsyTare').value) || 0;
  const net = Math.max(0, +(gross - tare).toFixed(2));
  const qtyEl = document.getElementById('fsyQty');
  if (qtyEl && gross > 0) qtyEl.value = net;
  const prev = document.getElementById('fsyPreview');
  if (prev && gross > 0) {
    prev.classList.remove('hidden');
    prev.innerHTML = '<strong>Gross:</strong> ' + gross + ' kg &nbsp;|&nbsp; <strong>Tare:</strong> ' + tare + ' kg &nbsp;|&nbsp; <strong>Net:</strong> <span style="color:var(--safe);font-weight:700">' + net + ' kg</span>';
  }
}

function updateMoistureBadge() {
  const val = parseFloat(document.getElementById('fsyMoisture').value);
  const badge = document.getElementById('moistureBadge');
  if (!badge || isNaN(val)) return;
  if (val > 14) {
    badge.innerHTML = '<span class="badge badge-red" style="font-size:0.7rem">Critical – partial rejection</span>';
  } else if (val > 12) {
    badge.innerHTML = '<span class="badge badge-yellow" style="font-size:0.7rem">Warning</span>';
  } else {
    badge.innerHTML = '<span class="badge badge-green" style="font-size:0.7rem">Good</span>';
  }
}

// ─── F3: Farmer Supply Submission ───
async function submitFarmerSupply(e) {
  e.preventDefault();
  const commodity = document.getElementById('fsyCommodity').value;
  const gross_weight = parseFloat(document.getElementById('fsyWeight') ? document.getElementById('fsyWeight').value : 0) || 0;
  const tare_weight = parseFloat(document.getElementById('fsyTare') ? document.getElementById('fsyTare').value : 0) || 0;
  const quantity = parseFloat(document.getElementById('fsyQty').value);
  const moisture_level = parseFloat(document.getElementById('fsyMoisture').value);
  if (!quantity || quantity <= 0) { showToast('Enter a valid net quantity', 'warning'); return; }
  const btn = e.target.querySelector('button[type=submit]');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
  try {
    const res = await api('/api/farmer/supply', { method: 'POST', body: JSON.stringify({ commodity, quantity, moisture_level, gross_weight, tare_weight }) });
    const result = document.getElementById('fsyResult');
    result.classList.remove('hidden');
    result.innerHTML = '<div class="info-box" style="border-color:var(--safe)">' +
      (res.gross_weight ? '<div class="info-box-row"><span class="info-box-label">Gross Weight</span><span class="info-box-value">' + res.gross_weight + ' kg</span></div>' : '') +
      (res.tare_weight ? '<div class="info-box-row"><span class="info-box-label">Tare Weight</span><span class="info-box-value">' + res.tare_weight + ' kg</span></div>' : '') +
      (res.net_quantity ? '<div class="info-box-row"><span class="info-box-label">Net Quantity</span><span class="info-box-value" style="font-weight:700">' + res.net_quantity + ' kg</span></div>' : '') +
      '<div class="info-box-row"><span class="info-box-label">Accepted</span><span class="info-box-value" style="color:var(--safe)">' + res.accepted + ' kg</span></div>' +
      '<div class="info-box-row"><span class="info-box-label">Rejected</span><span class="info-box-value" style="color:' + (res.rejected > 0 ? 'var(--critical)' : 'inherit') + '">' + res.rejected + ' kg' + (res.rejected > 0 ? ' (moisture > 14%)' : '') + '</span></div>' +
      '<div class="info-box-row"><span class="info-box-label">Amount Earned</span><span class="info-box-value" style="color:var(--safe)">&#8377;' + fmt(res.earned) + '</span></div>' +
      '<div class="info-box-row"><span class="info-box-label">Batch ID</span><span class="info-box-value" style="font-family:monospace;font-size:0.8rem">' + res.batch_id + '</span></div>' +
      (res.autoRestocks && res.autoRestocks.length ? '<div class="info-box-row"><span class="info-box-label">Auto-Restock</span><span class="info-box-value">' + res.autoRestocks.map(function (r) { return r.shop + ': ' + r.qty + ' kg'; }).join(', ') + '</span></div>' : '') +
      '</div>';
    showToast('Supply submitted! Batch: ' + res.batch_id, 'success');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Supply & Generate QR Batch'; }

    setTimeout(loadFarmerDashboard, 1000);
  } catch (e) {
    showToast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '📤 Submit Supply & Generate QR'; }
  }
}

// ─── F4: Forgot Password ───
function showForgotPassword(e) {
  if (e) e.preventDefault();
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('forgotPasswordSection').classList.remove('hidden');
  document.getElementById('resetPasswordSection').classList.add('hidden');
}

async function submitForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('fpEmail').value;
  const msg = document.getElementById('fpMessage');
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) { msg.style.color = 'var(--critical)'; msg.textContent = data.error; return; }
    msg.style.color = 'var(--safe)';
    msg.innerHTML = '✅ ' + data.message;
    if (data.reset_token) {
      msg.innerHTML += '<br><span style="font-size:0.75rem;word-break:break-all;font-family:monospace;background:rgba(0,0,0,0.1);padding:4px 6px;border-radius:4px;display:block;margin-top:6px">Token: ' + data.reset_token + '</span>';
      msg.innerHTML += '<br><a href="#" onclick="showResetForm(event)"  style="font-size:0.8rem;color:var(--earth-clay)">→ Enter reset token</a>';
    }
  } catch (err) { msg.style.color = 'var(--critical)'; msg.textContent = 'Network error'; }
}

function showResetForm(e) {
  if (e) e.preventDefault();
  document.getElementById('forgotPasswordSection').classList.add('hidden');
  document.getElementById('resetPasswordSection').classList.remove('hidden');
}

async function submitResetPassword(e) {
  e.preventDefault();
  const token = document.getElementById('rpToken').value.trim();
  const new_password = document.getElementById('rpNewPassword').value;
  const msg = document.getElementById('rpMessage');
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password })
    });
    const data = await res.json();
    if (!res.ok) { msg.style.color = 'var(--critical)'; msg.textContent = data.error; return; }
    msg.style.color = 'var(--safe)';
    msg.textContent = '✅ ' + data.message;
    setTimeout(function () {
      document.getElementById('resetPasswordSection').classList.add('hidden');
      document.getElementById('loginForm').classList.remove('hidden');
    }, 2500);
  } catch (err) { msg.style.color = 'var(--critical)'; msg.textContent = 'Network error'; }
}

// ─── F5: Admin Alerts with filter ───
async function loadAdminAlerts() {
  const severity = document.getElementById('alertSeverityFilter') ? document.getElementById('alertSeverityFilter').value : '';
  try {
    const alerts = await api('/api/admin/alerts' + (severity ? '?severity=' + severity : '') + (severity ? '&resolved=0' : '?resolved=0'));
    const el = document.getElementById('adminAlertsTable');
    if (!el) return;
    const sevBadge = function (s) { return s === 'high' ? 'badge-red' : s === 'medium' ? 'badge-yellow' : 'badge-blue'; };
    el.innerHTML = alerts.length
      ? '<table><thead><tr><th>Type</th><th>Severity</th><th>Entity</th><th>Message</th><th>Time</th><th>Action</th></tr></thead><tbody>' +
      alerts.map(function (a) {
        return '<tr><td><span class="badge badge-yellow" style="font-size:0.65rem">' + a.alert_type.replace(/_/g, ' ') + '</span></td>' +
          '<td><span class="badge ' + sevBadge(a.severity) + '">' + a.severity + '</span></td>' +
          '<td>' + (a.entity_type || '') + ' #' + (a.entity_id || '') + '</td>' +
          '<td style="max-width:280px;font-size:0.82rem">' + a.message + '</td>' +
          '<td style="white-space:nowrap">' + timeAgo(a.created_at) + '</td>' +
          '<td>' + (a.resolved ? '<span class="badge badge-green">Resolved</span>' : '<button class="btn btn-sm btn-primary" onclick="resolveAlert(' + a.id + ')">Resolve</button>') + '</td></tr>';
      }).join('') + '</tbody></table>'
      : '<div class="empty-state">No unresolved alerts' + (severity ? ' for severity: ' + severity : '') + '</div>';
  } catch (e) { }
}

async function runAnomalyCheck() {
  try {
    const res = await api('/api/admin/run-anomaly-check', { method: 'POST', body: '{}' });
    showToast('⚡ Anomaly scan complete – ' + res.alerts_generated + ' new alert(s) generated', 'success');
    loadAdminAlerts();
  } catch (e) { showToast(e.message, 'error'); }
}
