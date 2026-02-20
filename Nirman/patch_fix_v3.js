// patch_fix_v3.js – Fix route ordering and remaining issues
const fs = require('fs');

// ════════════════════════════════════════════════
// FIX 1: server.js – move V3 routes before catch-all
// ════════════════════════════════════════════════
let sv = fs.readFileSync('d:/Nirman/server.js', 'utf8');

// Extract the V3 block (everything between "// ═══ V3 FEATURE ROUTES ═══" and "async function start()")
const v3Start = sv.indexOf('// ═══ V3 FEATURE ROUTES ═══');
const v3End = sv.indexOf('async function start()');

if (v3Start > 0 && v3End > 0 && v3Start > 644 * 50) {
    const v3Block = sv.slice(v3Start, v3End);
    // Remove the V3 block from current position
    sv = sv.slice(0, v3Start) + sv.slice(v3End);
    // Insert BEFORE the catch-all handler
    const catchAllMarker = "app.get('*', (req, res) =>";
    const catchAllIdx = sv.indexOf(catchAllMarker);
    if (catchAllIdx >= 0) {
        sv = sv.slice(0, catchAllIdx) + '\n' + v3Block + '\n' + sv.slice(catchAllIdx);
        console.log('✅ V3 routes moved before catch-all handler');
    } else {
        console.log('⚠ Could not find catch-all handler');
    }
} else {
    console.log('ℹ V3 routes already before catch-all or not found, skipping reorder');
}

fs.writeFileSync('d:/Nirman/server.js', sv, 'utf8');

// ════════════════════════════════════════════════
// FIX 2: index.html – farmer form and family member panel anchors
// ════════════════════════════════════════════════
let html = fs.readFileSync('d:/Nirman/public/index.html', 'utf8');

// Check where farmerKpiGrid and farmerSupplyForm are  
const hasKpiGrid = html.includes('farmerKpiGrid');
const hasSupplyForm = html.includes('farmerSupplyForm');
console.log('farmerKpiGrid in HTML:', hasKpiGrid, '| farmerSupplyForm in HTML:', hasSupplyForm);

// Check family members panel position
const hasFamilyPanel = html.includes('familyMembersPanel');
console.log('familyMembersPanel in HTML:', hasFamilyPanel);

// If farmer supply form not in HTML, add it differently
if (!hasSupplyForm) {
    // Look for the farmer module section (module-farmer)
    if (html.includes('id="module-farmer"')) {
        // Find the farmer KPI cards div or just the module header and insert after
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
                        <button type="submit" class="btn btn-primary">📤 Submit Supply &amp; Generate QR</button>
                    </form>
                    <div id="fsyResult" class="hidden" style="margin-top:16px"></div>
                </div>`
        );
        console.log('✅ Farmer supply form added to farmer module');
    }
}

fs.writeFileSync('d:/Nirman/public/index.html', html, 'utf8');
console.log('✅ index.html fixed');

// ════════════════════════════════════════════════
// FIX 3: app.js – fix loadFamilyMembers hook (remove 'hidden' class condition)
// ════════════════════════════════════════════════
let js = fs.readFileSync('d:/Nirman/public/app.js', 'utf8');

// Verify hook exists
const hasFamilyHook = js.includes('loadFamilyMembers(rc)');
console.log('loadFamilyMembers hook in app.js:', hasFamilyHook);

// Check if beneficiaryInfo hidden is actually removed in a different way
if (!hasFamilyHook) {
    // Insert the hook via a different pattern
    const lookupPattern = "classList.remove('hidden')";
    const lookupCtx = "beneficiaryInfo";
    // Find the exact context
    const idx = js.indexOf("document.getElementById('beneficiaryInfo').classList.remove('hidden')");
    if (idx >= 0) {
        js = js.slice(0, idx + "document.getElementById('beneficiaryInfo').classList.remove('hidden')".length) +
            ";\n        const rc = document.getElementById('txRationCard').value.trim().toUpperCase();\n        if (rc) loadFamilyMembers(rc);" +
            js.slice(idx + "document.getElementById('beneficiaryInfo').classList.remove('hidden')".length);
        fs.writeFileSync('d:/Nirman/public/app.js', js, 'utf8');
        console.log('✅ Family member hook added fresh');
    } else {
        console.log('⚠ Could not find beneficiaryInfo hidden removal in app.js');
    }
} else {
    console.log('ℹ Family member hook already present');
}

console.log('\n🎉 All fixes applied');
