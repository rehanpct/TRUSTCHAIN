const fs = require('fs');
let html = fs.readFileSync('d:/Nirman/public/index.html', 'utf8');

if (html.includes('farmerSupplyForm')) {
    console.log('Supply form already present in HTML');
    process.exit(0);
}

const SUPPLY_FORM = `
                <!-- === FARMER SUPPLY ENTRY FORM === -->
                <div class="card">
                    <h3 class="card-title">📦 Submit New Supply</h3>
                    <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px">Enter the commodity details you are delivering to the warehouse. Net quantity is auto-calculated from gross weight minus tare.</p>
                    <form id="farmerSupplyForm" onsubmit="submitFarmerSupply(event)">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Commodity</label>
                                <select id="fsyCommodity" class="select-styled" required>
                                    <option value="rice">&#127807; Rice</option>
                                    <option value="wheat">&#127807; Wheat</option>
                                    <option value="sugar">Sugar</option>
                                    <option value="maida">Maida</option>
                                    <option value="atta">Atta</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Gross Weight (kg) <small style="color:var(--text-muted)">— total incl. sacks</small></label>
                                <input type="number" id="fsyWeight" min="1" step="0.1" placeholder="e.g. 520" required oninput="calcFarmerNet()">
                            </div>
                            <div class="form-group">
                                <label>Tare / Sack Weight (kg) <small style="color:var(--text-muted)">— auto-deducted</small></label>
                                <input type="number" id="fsyTare" min="0" step="0.1" placeholder="e.g. 0.5" value="0" oninput="calcFarmerNet()">
                            </div>
                            <div class="form-group">
                                <label>Net Quantity (kg) <small style="color:var(--text-muted)">— editable</small></label>
                                <input type="number" id="fsyQty" min="1" step="0.1" placeholder="Auto-filled from above" required>
                            </div>
                            <div class="form-group">
                                <label>Moisture Level (%) <span id="moistureBadge" style="font-size:0.75rem;margin-left:6px"></span></label>
                                <input type="number" id="fsyMoisture" min="0" max="30" step="0.1" placeholder="e.g. 12.5" required oninput="updateMoistureBadge()">
                            </div>
                        </div>
                        <div id="fsyPreview" class="info-box hidden" style="margin-bottom:14px;font-size:0.85rem"></div>
                        <button type="submit" class="btn btn-primary">Submit Supply &amp; Generate QR Batch</button>
                    </form>
                    <div id="fsyResult" class="hidden" style="margin-top:16px"></div>
                </div>`;

// Find the end of the farmer module section (before batches section)
const batchesMarker = '<!-- \u2550\u2550\u2550 BATCH DISPATCH';
const idx = html.indexOf(batchesMarker);
if (idx < 0) {
    console.log('ERROR: Could not find BATCH DISPATCH marker');
    process.exit(1);
}

// Look backwards from batches marker to find the closing </section>
const beforeBatches = html.slice(0, idx);
const lastSectionClose = beforeBatches.lastIndexOf('</section>');
if (lastSectionClose < 0) {
    console.log('ERROR: Could not find closing </section> before batches');
    process.exit(1);
}

// Insert the supply form just before the </section>
html = beforeBatches.slice(0, lastSectionClose) + SUPPLY_FORM + '\n            </section>' + html.slice(lastSectionClose + '</section>'.length);
fs.writeFileSync('d:/Nirman/public/index.html', html, 'utf8');
console.log('Supply form with weight field added to farmer module section');
