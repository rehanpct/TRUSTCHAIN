// patch_html_v3.js – HTML and JS additions for all 6 features
const fs = require('fs');

// ═══════════════════════════════════════════
// STEP 1: index.html patches
// ═══════════════════════════════════════════
let html = fs.readFileSync('d:/Nirman/public/index.html', 'utf8');

// --- F4: Forgot Password link + reset form (after loginError div) ---
if (!html.includes('forgotPasswordSection')) {
    html = html.replace(
        '<div id="loginError" class="form-error"></div>',
        `<div id="loginError" class="form-error"></div>
                    <div style="text-align:right;margin-top:8px">
                        <a href="#" onclick="showForgotPassword(event)" style="font-size:0.8rem;color:var(--earth-clay);text-decoration:underline">Forgot Password?</a>
                    </div>`
    );

    // Insert forgot password & reset forms after the register form close
    html = html.replace(
        '<div class="demo-accounts">',
        `<!-- Forgot Password Form -->
                <div id="forgotPasswordSection" class="auth-form hidden" style="padding-top:0">
                    <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px">Enter your registered email to receive a reset token.</p>
                    <form onsubmit="submitForgotPassword(event)">
                        <div class="form-group">
                            <label>Registered Email</label>
                            <input type="email" id="fpEmail" placeholder="you@email.com" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-full">Send Reset Token</button>
                        <div id="fpMessage" class="form-error" style="margin-top:8px"></div>
                    </form>
                </div>
                <!-- Reset Password Form -->
                <div id="resetPasswordSection" class="auth-form hidden" style="padding-top:0">
                    <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px">Enter the reset token you received and your new password.</p>
                    <form onsubmit="submitResetPassword(event)">
                        <div class="form-group">
                            <label>Reset Token</label>
                            <input type="text" id="rpToken" placeholder="Paste token here" required style="font-family:monospace;font-size:0.8rem">
                        </div>
                        <div class="form-group">
                            <label>New Password</label>
                            <input type="password" id="rpNewPassword" placeholder="Min 6 characters" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-full">Reset Password</button>
                        <div id="rpMessage" class="form-error" style="margin-top:8px"></div>
                    </form>
                </div>
                <div class="demo-accounts">`
    );
    console.log('✅ Forgot password forms added to HTML');
}

// --- F1: Dealer Open/Close toggle in Shop module (after shopKPIs div) ---
if (!html.includes('shopStatusToggle')) {
    html = html.replace(
        '<div class="kpi-grid" id="shopKPIs"></div>',
        `<div class="kpi-grid" id="shopKPIs"></div>

                <div class="card" id="shopStatusToggle" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
                    <div>
                        <h3 class="card-title" style="margin-bottom:4px;border:none;padding-bottom:0">🔴 Shop Status Control</h3>
                        <p id="shopStatusLabel" style="color:var(--text-muted);font-size:0.85rem">Loading status...</p>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center">
                        <span id="shopStatusBadge" class="badge badge-green" style="font-size:0.85rem;padding:5px 14px">OPEN</span>
                        <button id="shopToggleBtn" class="btn btn-primary" onclick="toggleShopStatus()">Toggle Status</button>
                    </div>
                </div>`
    );
    console.log('✅ Shop status toggle added to HTML');
}

// --- F2: Family Members panel in shop module (before txResult closes) ---
if (!html.includes('familyMembersPanel')) {
    html = html.replace(
        '<div id="beneficiaryInfo" class="info-box hidden"></div>',
        `<div id="beneficiaryInfo" class="info-box hidden"></div>
                            <div id="familyMembersPanel" class="hidden" style="margin-top:12px">
                                <p style="font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:8px">👨‍👩‍👧‍👦 FAMILY MEMBERS</p>
                                <div id="familyMembersTable"></div>
                            </div>`
    );
    console.log('✅ Family members panel added to HTML');
}

// --- F1: Citizen view – CLOSED badge on shop stock cards ---
// Find citizen shop stock section
if (!html.includes('shopClosedBanner')) {
    html = html.replace(
        '<div id="citizenShopStock">',
        `<div id="shopClosedBanner" class="hidden" style="background:rgba(159,29,29,0.12);border:1px solid var(--critical);border-radius:8px;padding:12px 16px;margin-bottom:16px;color:var(--critical);font-weight:600">
                        🔴 This shop is currently CLOSED. Transactions are suspended.
                    </div>
                    <div id="citizenShopStock">`
    );
    console.log('✅ Shop closed banner added to citizen view');
}

// --- F5: Admin alerts severity filter ---
if (!html.includes('alertSeverityFilter')) {
    html = html.replace(
        '<h3 class="card-title">🚨 System Alerts</h3>',
        `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
                        <h3 class="card-title" style="border:none;padding:0;margin:0">🚨 System Alerts</h3>
                        <div style="display:flex;gap:8px;align-items:center">
                            <select id="alertSeverityFilter" class="select-styled" style="max-width:140px" onchange="loadAdminAlerts()">
                                <option value="">All Severities</option>
                                <option value="high">🔴 High</option>
                                <option value="medium">🟡 Medium</option>
                                <option value="low">🟢 Low</option>
                            </select>
                            <button class="btn btn-sm btn-primary" onclick="runAnomalyCheck()">⚡ Run Check</button>
                        </div>
                    </div>`
    );
    console.log('✅ Alert severity filter added to admin panel');
}

// --- F3: Farmer supply input form (after farmerKpiGrid) ---
if (!html.includes('farmerSupplyForm')) {
    html = html.replace(
        '<div id="farmerKpiGrid" class="kpi-grid"></div>',
        `<div id="farmerKpiGrid" class="kpi-grid"></div>

                <div class="card">
                    <h3 class="card-title">📦 Submit New Supply</h3>
                    <form id="farmerSupplyForm" onsubmit="submitFarmerSupply(event)">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Commodity</label>
                                <select id="fsyCommodity" class="select-styled" required>
                                    <option value="rice">Rice</option>
                                    <option value="wheat">Wheat</option>
                                    <option value="sugar">Sugar</option>
                                    <option value="maida">Maida</option>
                                    <option value="atta">Atta</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Quantity (kg)</label>
                                <input type="number" id="fsyQty" min="1" step="0.1" placeholder="e.g. 500" required>
                            </div>
                            <div class="form-group">
                                <label>Moisture Level (%)</label>
                                <input type="number" id="fsyMoisture" min="0" max="30" step="0.1" placeholder="e.g. 12.5" required>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary">📤 Submit Supply & Generate QR</button>
                    </form>
                    <div id="fsyResult" class="hidden" style="margin-top:16px"></div>
                </div>`
    );
    console.log('✅ Farmer supply form added to HTML');
}

fs.writeFileSync('d:/Nirman/public/index.html', html, 'utf8');
console.log('✅ index.html updated\n');

// ═══════════════════════════════════════════
// STEP 2: app.js additions
// ═══════════════════════════════════════════
let js = fs.readFileSync('d:/Nirman/public/app.js', 'utf8');

const NEW_JS = `

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
            members.map(function(m) {
                return '<tr><td><strong>' + m.name + '</strong></td><td>' + m.age + ' yrs</td><td>' + m.relationship + '</td><td style="font-family:monospace">' + m.aadhaar_masked + '</td></tr>';
            }).join('') + '</tbody></table>';
    } catch (e) {}
}

// ─── F3: Farmer Supply Submission ───
async function submitFarmerSupply(e) {
    e.preventDefault();
    const commodity = document.getElementById('fsyCommodity').value;
    const quantity = parseFloat(document.getElementById('fsyQty').value);
    const moisture_level = parseFloat(document.getElementById('fsyMoisture').value);
    const btn = e.target.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
    try {
        const res = await api('/api/farmer/supply', { method: 'POST', body: JSON.stringify({ commodity, quantity, moisture_level }) });
        const result = document.getElementById('fsyResult');
        result.classList.remove('hidden');
        result.innerHTML = '<div class="info-box" style="border-color:var(--safe)">' +
            '<div class="info-box-row"><span class="info-box-label">Batch ID</span><span class="info-box-value" style="font-family:monospace">' + res.batch_id + '</span></div>' +
            '<div class="info-box-row"><span class="info-box-label">Accepted</span><span class="info-box-value">' + res.accepted + ' kg</span></div>' +
            '<div class="info-box-row"><span class="info-box-label">Rejected</span><span class="info-box-value" style="color:' + (res.rejected > 0 ? 'var(--critical)' : 'inherit') + '">' + res.rejected + ' kg' + (res.rejected > 0 ? ' (moisture > 14%)' : '') + '</span></div>' +
            '<div class="info-box-row"><span class="info-box-label">Amount Earned</span><span class="info-box-value" style="color:var(--safe)">₹' + fmt(res.earned) + '</span></div>' +
            (res.autoRestocks && res.autoRestocks.length ? '<div class="info-box-row"><span class="info-box-label">Auto-Restock</span><span class="info-box-value">' + res.autoRestocks.map(function(r){return r.shop+': '+r.qty+' kg';}).join(', ') + '</span></div>' : '') +
            '</div>';
        showToast('✅ Supply submitted! Batch: ' + res.batch_id, 'success');
        if (btn) { btn.disabled = false; btn.textContent = '📤 Submit Supply & Generate QR'; }
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
        setTimeout(function() {
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
        const sevBadge = function(s) { return s === 'high' ? 'badge-red' : s === 'medium' ? 'badge-yellow' : 'badge-blue'; };
        el.innerHTML = alerts.length
            ? '<table><thead><tr><th>Type</th><th>Severity</th><th>Entity</th><th>Message</th><th>Time</th><th>Action</th></tr></thead><tbody>' +
              alerts.map(function(a) {
                  return '<tr><td><span class="badge badge-yellow" style="font-size:0.65rem">' + a.alert_type.replace(/_/g,' ') + '</span></td>' +
                      '<td><span class="badge ' + sevBadge(a.severity) + '">' + a.severity + '</span></td>' +
                      '<td>' + (a.entity_type || '') + ' #' + (a.entity_id || '') + '</td>' +
                      '<td style="max-width:280px;font-size:0.82rem">' + a.message + '</td>' +
                      '<td style="white-space:nowrap">' + timeAgo(a.created_at) + '</td>' +
                      '<td>' + (a.resolved ? '<span class="badge badge-green">Resolved</span>' : '<button class="btn btn-sm btn-primary" onclick="resolveAlert(' + a.id + ')">Resolve</button>') + '</td></tr>';
              }).join('') + '</tbody></table>'
            : '<div class="empty-state">No unresolved alerts' + (severity ? ' for severity: ' + severity : '') + '</div>';
    } catch (e) {}
}

async function runAnomalyCheck() {
    try {
        const res = await api('/api/admin/run-anomaly-check', { method: 'POST', body: '{}' });
        showToast('⚡ Anomaly scan complete – ' + res.alerts_generated + ' new alert(s) generated', 'success');
        loadAdminAlerts();
    } catch (e) { showToast(e.message, 'error'); }
}
`;

// Append to end of file
if (!js.includes('toggleShopStatus')) {
    js += NEW_JS;
    fs.writeFileSync('d:/Nirman/public/app.js', js, 'utf8');
    console.log('✅ app.js updated with new functions');
} else {
    console.log('ℹ app.js already patched');
}

// ═══════════════════════════════════════════
// STEP 3: Hook family members into existing lookupBeneficiary
// ═══════════════════════════════════════════
js = fs.readFileSync('d:/Nirman/public/app.js', 'utf8');

// After lookupBeneficiary renders the beneficiaryInfo div, call loadFamilyMembers
if (!js.includes('loadFamilyMembers(rc)')) {
    js = js.replace(
        "document.getElementById('beneficiaryInfo').classList.remove('hidden');",
        "document.getElementById('beneficiaryInfo').classList.remove('hidden');\n        const rc = document.getElementById('txRationCard').value.trim().toUpperCase();\n        loadFamilyMembers(rc);"
    );
    fs.writeFileSync('d:/Nirman/public/app.js', js, 'utf8');
    console.log('✅ loadFamilyMembers hooked into lookupBeneficiary');
} else {
    console.log('ℹ loadFamilyMembers already hooked');
}

// ═══════════════════════════════════════════
// STEP 4: Hook shop status into loadShopModule
// ═══════════════════════════════════════════
js = fs.readFileSync('d:/Nirman/public/app.js', 'utf8');

if (!js.includes('updateShopStatusUI(shop.is_open')) {
    // Find where shop data is loaded and add status UI update
    js = js.replace(
        "renderRiskMeter('shopRiskMeter',",
        "updateShopStatusUI(shop.is_open !== undefined ? shop.is_open : 1);\n        _currentShopIsOpen = shop.is_open;\n        renderRiskMeter('shopRiskMeter',"
    );
    fs.writeFileSync('d:/Nirman/public/app.js', js, 'utf8');
    console.log('✅ Shop status UI hooked into loadShop');
} else {
    console.log('ℹ Shop status already hooked');
}

// ═══════════════════════════════════════════
// STEP 5: loadAdminModule – use loadAdminAlerts for the alerts panel
// ═══════════════════════════════════════════
js = fs.readFileSync('d:/Nirman/public/app.js', 'utf8');

// Replace the inline alert render in loadAdminModule with a call to loadAdminAlerts()
if (!js.includes('loadAdminAlerts()') && js.includes('adminAlertsTable')) {
    // After rendering the batch table, call loadAdminAlerts
    js = js.replace(
        '    // Live Batch Tracking\n    renderBatchTable(batches || [], \'adminBatchTable\');',
        '    // Live Batch Tracking\n    renderBatchTable(batches || [], \'adminBatchTable\');\n    // Admin Alerts (uses filter)\n    loadAdminAlerts();'
    );
    fs.writeFileSync('d:/Nirman/public/app.js', js, 'utf8');
    console.log('✅ loadAdminAlerts called from loadAdminModule');
}

console.log('\n🎉 Phase 2 (HTML + JS) complete');
