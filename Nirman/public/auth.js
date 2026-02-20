// ═══════════════════════════════════════════════════════════════
// TrustChain PDS – Authentication Module
// ═══════════════════════════════════════════════════════════════

const API = '';
let token = localStorage.getItem('tc_token');
let currentUser = null;

// ─── API HELPER ──────────────────────────────────────────────
async function api(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API}${endpoint}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API Error');
    return data;
}

// ─── TAB SWITCH ──────────────────────────────────────────────
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
    event.target.classList.add('active');
    document.getElementById('loginError').textContent = '';
    document.getElementById('regError').textContent = '';
}

// ─── LOGIN ───────────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    try {
        const data = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        token = data.token;
        currentUser = data.user;
        localStorage.setItem('tc_token', token);
        localStorage.setItem('tc_user', JSON.stringify(currentUser));
        enterApp();
    } catch (err) {
        document.getElementById('loginError').textContent = err.message;
    }
}

// ─── REGISTER ────────────────────────────────────────────────
async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const role = document.getElementById('regRole').value;
    try {
        const data = await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password, role })
        });
        token = data.token;
        currentUser = data.user;
        localStorage.setItem('tc_token', token);
        localStorage.setItem('tc_user', JSON.stringify(currentUser));
        enterApp();
    } catch (err) {
        document.getElementById('regError').textContent = err.message;
    }
}

// ─── QUICK LOGIN ─────────────────────────────────────────────
async function quickLogin(email) {
    try {
        const data = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password: 'password123' })
        });
        token = data.token;
        currentUser = data.user;
        localStorage.setItem('tc_token', token);
        localStorage.setItem('tc_user', JSON.stringify(currentUser));
        enterApp();
    } catch (err) {
        document.getElementById('loginError').textContent = err.message;
    }
}

// ─── LOGOUT ──────────────────────────────────────────────────
function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('tc_token');
    localStorage.removeItem('tc_user');
    document.getElementById('authPage').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
}

// ─── ENTER APP ───────────────────────────────────────────────
function enterApp() {
    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('userName').textContent = currentUser.name;
    const badge = document.getElementById('userRole');
    badge.textContent = currentUser.role.replace(/_/g, ' ');
    badge.setAttribute('data-role', currentUser.role);
    setupRoleTabs();
    initApp();
}

// ─── AUTO LOGIN ──────────────────────────────────────────────
(function checkAuth() {
    const saved = localStorage.getItem('tc_user');
    if (token && saved) {
        currentUser = JSON.parse(saved);
        enterApp();
    }
})();
