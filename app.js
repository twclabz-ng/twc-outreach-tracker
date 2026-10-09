/* ============================================================================
 * TWC Labs Outreach — Client Controller
 * Backend: Google Apps Script Web App
 * ========================================================================== */

// ✅ YOUR DEPLOYED GAS WEB APP URL (already wired in)
const API_URL = 'https://script.google.com/macros/s/AKfycbzbMeYp0KgJhINRkEuzgihcM48LOD1vNPKgs2gL_7ehgW8ISRhUQUqcBMtZZSez057V/exec';

const state = {
  currentUser: null,
  activeOutreachId: 'OUTREACH-2026-001',
  activeView: null,
  patients: [],
  networkOnline: navigator.onLine,
  deferredInstallPrompt: null,
  bpChart: null,
  sugarChart: null
};

/* -------------------------------------------------------------------------
 * API BRIDGE — text/plain body avoids CORS preflight
 * ---------------------------------------------------------------------- */
async function api(action, payload = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload }),
      redirect: 'follow',
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      console.error('Non-JSON response:', text.substring(0, 300));
      throw new Error('Backend returned invalid JSON. Verify your GAS deployment access is set to "Anyone".');
    }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out. Check your connection.');
    if (err.message.includes('Failed to fetch')) {
      throw new Error('Cannot reach backend. Verify the GAS Web App URL and that access is set to "Anyone".');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/* -------------------------------------------------------------------------
 * SERVICE WORKER
 * ---------------------------------------------------------------------- */
async function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    console.log('✓ SW registered:', reg.scope);
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          sw.postMessage('SKIP_WAITING');
        }
      });
    });
  } catch (err) {
    console.warn('SW registration failed:', err);
  }
}

/* -------------------------------------------------------------------------
 * PWA INSTALL
 * ---------------------------------------------------------------------- */
function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    document.getElementById('pwaInstallBtn')?.classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    state.deferredInstallPrompt = null;
    document.getElementById('pwaInstallBtn')?.classList.add('hidden');
    document.getElementById('browserInstallBanner')?.classList.add('hidden');
    toast('App installed successfully', 'success');
  });

  if (!window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone) {
    document.getElementById('browserInstallBanner')?.classList.remove('hidden');
  }
}

async function triggerPwaInstall() {
  if (state.deferredInstallPrompt) {
    state.deferredInstallPrompt.prompt();
    const { outcome } = await state.deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') toast('Installing...', 'success');
    state.deferredInstallPrompt = null;
    return;
  }
  openModal('📲 Install TWC Outreach', installGuideHtml());
}

function installGuideHtml() {
  return `
    <div style="font-size:14px;line-height:1.6;">
      <p style="margin-top:0;color:var(--text-secondary);">Install for offline access and native feel.</p>
      <div class="card" style="margin:12px 0;padding:14px;background:var(--bg-grouped);">
        <strong style="font-size:13px;">🍎 iOS (Safari)</strong>
        <ol style="margin:8px 0 0;padding-left:20px;font-size:13px;">
          <li>Tap the <strong>Share</strong> icon ⬆️</li>
          <li>Scroll → <strong>Add to Home Screen</strong></li>
          <li>Tap <strong>Add</strong></li>
        </ol>
      </div>
      <div class="card" style="margin:12px 0;padding:14px;background:var(--bg-grouped);">
        <strong style="font-size:13px;">🤖 Android (Chrome)</strong>
        <ol style="margin:8px 0 0;padding-left:20px;font-size:13px;">
          <li>Tap <strong>⋮</strong> menu (top-right)</li>
          <li>Tap <strong>Install app</strong></li>
          <li>Confirm</li>
        </ol>
      </div>
    </div>`;
}

function dismissInstallBanner() {
  document.getElementById('browserInstallBanner')?.classList.add('hidden');
}

/* -------------------------------------------------------------------------
 * BOOT
 * ---------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  registerSW();
  initInstall();
  setupNetwork();
  checkSession();
  setTimeout(() => document.getElementById('splash')?.remove(), 2200);
});

function setupNetwork() {
  const update = (online) => {
    state.networkOnline = online;
    const b = document.getElementById('networkStatusBadge');
    if (b) {
      b.className = 'net-badge ' + (online ? 'net-online' : 'net-offline');
      b.innerHTML = `<span class="net-dot"></span> ${online ? 'Online' : 'Offline'}`;
    }
    document.getElementById('offlineOverlay')?.classList.toggle('hidden', online);
  };
  window.addEventListener('online', () => update(true));
  window.addEventListener('offline', () => update(false));
  update(navigator.onLine);
}

function checkSession() {
  const cached = sessionStorage.getItem('twc_user');
  if (cached) {
    try {
      state.currentUser = JSON.parse(cached);
      hideSplash(); renderApp();
      return;
    } catch (e) {}
  }
  showLogin();
}

function hideSplash() {
  document.getElementById('splash')?.remove();
  document.getElementById('app')?.classList.remove('hidden');
}

/* -------------------------------------------------------------------------
 * AUTH
 * ---------------------------------------------------------------------- */
function showLogin() {
  hideSplash();
  document.getElementById('authSection').classList.remove('hidden');
  document.getElementById('passwordChangeSection').classList.add('hidden');
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
}

function quickFillLogin(email, password) {
  document.getElementById('loginEmail').value = email;
  document.getElementById('loginPassword').value = password;
}

function togglePasswordVisibility(id) {
  const f = document.getElementById(id);
  f.type = f.type === 'password' ? 'text' : 'password';
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  const btn = document.getElementById('loginSubmitBtn');
  btn.disabled = true;
  btn.querySelector('.btn-label').textContent = 'Signing in...';

  try {
    const res = await api('authenticateUser', { email, password });
    if (!res.success) { toast(res.message || 'Invalid credentials', 'error'); return; }

    state.currentUser = res.user;
    if (res.mustChangePassword) {
      document.getElementById('authSection').classList.add('hidden');
      document.getElementById('passwordChangeSection').classList.remove('hidden');
    } else {
      sessionStorage.setItem('twc_user', JSON.stringify(res.user));
      document.getElementById('authSection').classList.add('hidden');
      renderApp();
    }
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-label').textContent = 'Sign In';
  }
}

async function handlePasswordChangeSubmit(e) {
  e.preventDefault();
  const newPwd = document.getElementById('newPasswordInput').value;
  const confirmPwd = document.getElementById('confirmPasswordInput').value;
  if (newPwd !== confirmPwd) { toast('Passwords do not match', 'error'); return; }
  if (newPwd.length < 8)     { toast('Password must be 8+ characters', 'error'); return; }

  try {
    const res = await api('changePassword', { email: state.currentUser.email, newPassword: newPwd });
    if (res.success) {
      toast('Password updated', 'success');
      sessionStorage.setItem('twc_user', JSON.stringify(state.currentUser));
      document.getElementById('passwordChangeSection').classList.add('hidden');
      renderApp();
    } else toast(res.message, 'error');
  } catch (err) { toast(err.message, 'error'); }
}

async function handleResetAdminPassword() {
  const email = prompt('Enter Super-Admin email to reset:', 'twzlabz@gmail.com');
  if (!email) return;
  try {
    const res = await api('resetSuperAdminCredentials', { email });
    toast(res.message, 'success');
    quickFillLogin(res.email, res.tempPassword);
  } catch (err) { toast(err.message, 'error'); }
}

function handleHeaderUserClick() {
  if (!state.currentUser) return;
  const confirmed = confirm(`Signed in as ${state.currentUser.email}\nRole: ${formatRole(state.currentUser.role)}\n\nSign out?`);
  if (confirmed) {
    sessionStorage.removeItem('twc_user');
    state.currentUser = null;
    location.reload();
  }
}

/* -------------------------------------------------------------------------
 * APP RENDER
 * ---------------------------------------------------------------------- */
function renderApp() {
  hideSplash();
  const role = state.currentUser.role;
  document.getElementById('userInitial').textContent = (state.currentUser.fullName || 'U')[0].toUpperCase();
  document.getElementById('userRoleLabel').textContent = formatRole(role);
  renderNav(role);

  const home = {
    super_admin: 'super_admin',
    coordinator: 'coordinator',
    nurse: 'nurse',
    lab_tech: 'lab',
    optometrist: 'eye',
    dentist: 'dental'
  }[role] || 'nurse';

  switchTab(home);
}

function renderNav(role) {
  const navs = {
    super_admin: [
      { k: 'super_admin', icon: '📊', label: 'Executive' },
      { k: 'coordinator', icon: '📋', label: 'Operations' },
      { k: 'nurse', icon: '🩺', label: 'Vitals' },
      { k: 'lab', icon: '🧪', label: 'Lab' }
    ],
    coordinator: [
      { k: 'coordinator', icon: '📋', label: 'Operations' },
      { k: 'nurse', icon: '🩺', label: 'Vitals' },
      { k: 'lab', icon: '🧪', label: 'Lab' },
      { k: 'eye', icon: '👁️', label: 'Eye' },
      { k: 'dental', icon: '🦷', label: 'Dental' }
    ],
    nurse:       [{ k: 'nurse',  icon: '🩺', label: 'Vitals' }],
    lab_tech:    [{ k: 'lab',    icon: '🧪', label: 'Lab' }],
    optometrist: [{ k: 'eye',    icon: '👁️', label: 'Eye' }],
    dentist:     [{ k: 'dental', icon: '🦷', label: 'Dental' }]
  };
  const defs = navs[role] || navs.nurse;

  const desktop = document.getElementById('desktopNavLinks');
  if (desktop) desktop.innerHTML = defs.map((d, i) =>
    `<button class="nav-btn ${i === 0 ? 'active' : ''}" data-tab="${d.k}" onclick="switchTab('${d.k}')">
       <span>${d.icon}</span> ${d.label}
     </button>`
  ).join('');

  const mobile = document.getElementById('mobileBottomNav');
  if (mobile) mobile.innerHTML = defs.map((d, i) =>
    `<button class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="${d.k}" onclick="switchTab('${d.k}')">
       <span class="tab-icon">${d.icon}</span>
       <span class="tab-label">${d.label}</span>
     </button>`
  ).join('');
}

function switchTab(key) {
  state.activeView = key;
  ['superAdminView','coordinatorView','nurseView','labView','eyeView','dentalView']
    .forEach(id => document.getElementById(id)?.classList.add('hidden'));

  document.querySelectorAll('[data-tab]').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === key)
  );

  const renderers = {
    super_admin: renderSuperAdmin,
    coordinator: renderCoordinator,
    nurse: renderNurse,
    lab: renderLab,
    eye: renderEye,
    dental: renderDental
  };
  try { renderers[key]?.(); } catch (err) { console.error(err); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* -------------------------------------------------------------------------
 * GREETING
 * ---------------------------------------------------------------------- */
function greetingCard() {
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const u = state.currentUser;
  return `
    <div class="greet-card">
      <p class="greet-hi">${greet},</p>
      <h2 class="greet-name">${escapeHtml(u.fullName)}</h2>
      <div class="greet-meta">
        <span>🏥 ${escapeHtml(u.assignedSite || 'All Sites')}</span>
        <span>📅 ${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <span>🔐 ${formatRole(u.role)}</span>
      </div>
    </div>`;
}

/* -------------------------------------------------------------------------
 * SUPER ADMIN
 * ---------------------------------------------------------------------- */
function renderSuperAdmin() {
  const v = document.getElementById('superAdminView');
  v.classList.remove('hidden');
  v.innerHTML = `
    ${greetingCard()}
    <div class="dash-head">
      <div>
        <h1>Executive Surveillance</h1>
        <p class="sub">Real-time epidemiological dashboard across all outreach sites</p>
      </div>
      <div class="dash-actions">
        <button class="btn btn-sm btn-primary" onclick="openInviteModal()">➕ Invite</button>
        <button class="btn btn-sm btn-secondary" onclick="openUserDirectory()">👥 Users</button>
        <button class="btn btn-sm btn-secondary" onclick="generateReport()">✨ AI Report</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat"><span class="stat-label">Enrolled</span><span class="stat-value" id="kpi-enrolled">—</span><span class="stat-sub">Total patients</span></div>
      <div class="stat danger"><span class="stat-label">HTN Alert</span><span class="stat-value danger" id="kpi-htn">—</span><span class="stat-sub">Stage 2 + Crisis</span></div>
      <div class="stat warning"><span class="stat-label">Diabetic</span><span class="stat-value warning" id="kpi-diabetic">—</span><span class="stat-sub">≥ 200 mg/dL</span></div>
      <div class="stat success"><span class="stat-label">Referrals</span><span class="stat-value" id="kpi-referrals">—</span><span class="stat-sub">Issued slips</span></div>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <h3>Blood Pressure Stratification</h3>
        <div class="chart-wrap"><canvas id="chart-bp"></canvas></div>
      </div>
      <div class="chart-card">
        <h3>Glycemic Control Profile</h3>
        <div class="chart-wrap"><canvas id="chart-sugar"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Patient Registry</h3>
        <button class="btn btn-xs btn-secondary" onclick="loadAdmin()">🔄 Refresh</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th>Patient</th><th>Age/Sex</th><th>Vitals</th><th>Lab</th><th>Eye</th><th>Dental</th>
          </tr></thead>
          <tbody id="admin-tbody"><tr><td colspan="6" class="text-center muted">Loading...</td></tr></tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Administration</h3></div>
      <div class="grid-2">
        <button class="btn btn-secondary" onclick="clearTestData()">🗑️ Clear Test Data</button>
        <button class="btn btn-secondary" onclick="openAuditLog()">📜 Audit Log</button>
      </div>
    </div>`;
  loadAdmin();
}

async function loadAdmin() {
  try {
    const [patients, metrics] = await Promise.all([
      api('getPatientsForOutreach', { outreachId: '' }),
      api('getAggregatedMetrics', { outreachId: '' })
    ]);
    state.patients = patients;

    document.getElementById('kpi-enrolled').textContent = patients.length;
    const htn = metrics.bloodPressureProfile.stage2HTN + metrics.bloodPressureProfile.hypertensiveCrisis;
    document.getElementById('kpi-htn').textContent = htn;
    document.getElementById('kpi-diabetic').textContent = metrics.glycemicControlProfile.diabeticOrCritical;
    document.getElementById('kpi-referrals').textContent = metrics.referralsIssued;

    renderTable('admin-tbody', patients);
    drawBpChart(metrics);
    drawSugarChart(metrics);
  } catch (err) {
    console.error(err);
    toast('Load failed: ' + err.message, 'error');
  }
}

function renderTable(tbodyId, patients) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!patients.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center muted" style="padding:24px;">No records yet</td></tr>`;
    return;
  }
  tbody.innerHTML = patients.slice(0, 50).map(p => `
    <tr>
      <td>
        <div class="td-name">${escapeHtml(p.fullName)}</div>
        <div class="td-id">${p.id}</div>
      </td>
      <td>${p.age}y · ${p.gender[0]}</td>
      <td><span class="badge badge-${p.status.vitals}">${p.status.vitals}</span></td>
      <td><span class="badge badge-${p.status.lab}">${p.status.lab}</span></td>
      <td><span class="badge badge-${p.status.eye}">${p.status.eye}</span></td>
      <td><span class="badge badge-${p.status.dental}">${p.status.dental}</span></td>
    </tr>`).join('');
}

function drawBpChart(m) {
  const ctx = document.getElementById('chart-bp');
  if (!ctx || !window.Chart) return;
  state.bpChart?.destroy();
  state.bpChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Normal', 'Stage 1', 'Stage 2', 'Crisis'],
      datasets: [{
        data: [m.bloodPressureProfile.normal, m.bloodPressureProfile.stage1HTN,
               m.bloodPressureProfile.stage2HTN, m.bloodPressureProfile.hypertensiveCrisis],
        backgroundColor: ['#10B981', '#0EA5E9', '#F59E0B', '#EF4444'],
        borderWidth: 0, spacing: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, padding: 10, usePointStyle: true } } }
    }
  });
}

function drawSugarChart(m) {
  const ctx = document.getElementById('chart-sugar');
  if (!ctx || !window.Chart) return;
  state.sugarChart?.destroy();
  state.sugarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Normal', 'Pre-Diab', 'Diabetic'],
      datasets: [{
        data: [m.glycemicControlProfile.normal, m.glycemicControlProfile.preDiabetic,
               m.glycemicControlProfile.diabeticOrCritical],
        backgroundColor: ['#10B981', '#F59E0B', '#EF4444'],
        borderRadius: 8, borderSkipped: false, barThickness: 44
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
        x: { grid: { display: false }, ticks: { font: { size: 10 } } }
      }
    }
  });
}

async function clearTestData() {
  if (!confirm('Delete ALL test patients, vitals, diagnostics, and referrals?\n\nThis cannot be undone.')) return;
  try {
    const res = await api('clearTestData', { adminEmail: state.currentUser.email });
    toast(res.message, res.success ? 'success' : 'error');
    loadAdmin();
  } catch (err) { toast(err.message, 'error'); }
}

async function generateReport() {
  showLoader(true, 'Consulting Gemini AI...');
  try {
    const res = await api('generatePwCExecutiveReportGAS', { outreachId: '' });
    openModal('Executive AI Report', `<pre class="report-pre">${escapeHtml(res.report)}</pre>`);
  } catch (err) { toast(err.message, 'error'); }
  finally { showLoader(false); }
}

/* -------------------------------------------------------------------------
 * COORDINATOR
 * ---------------------------------------------------------------------- */
function renderCoordinator() {
  const v = document.getElementById('coordinatorView');
  v.classList.remove('hidden');
  v.innerHTML = `
    ${greetingCard()}
    <div class="dash-head">
      <div><h1>Operations Command</h1><p class="sub">Enrollment, triage &amp; referral coordination</p></div>
      <div class="dash-actions">
        <button class="btn btn-sm btn-primary" onclick="openEnrollModal()">➕ Enroll</button>
        <button class="btn btn-sm btn-secondary" onclick="openInviteModal()">✉️ Invite</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat"><span class="stat-label">Enrolled</span><span class="stat-value" id="co-total">—</span><span class="stat-sub">All patients</span></div>
      <div class="stat"><span class="stat-label">Awaiting Vitals</span><span class="stat-value" id="co-vitals">—</span><span class="stat-sub">Pending</span></div>
      <div class="stat"><span class="stat-label">Awaiting Lab</span><span class="stat-value" id="co-lab">—</span><span class="stat-sub">Pending</span></div>
      <div class="stat"><span class="stat-label">Referrals</span><span class="stat-value" id="co-ref">—</span><span class="stat-sub">Issued</span></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Patient Intake Queue</h3>
        <button class="btn btn-xs btn-secondary" onclick="loadCoordinator()">🔄 Refresh</button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Patient</th><th>Phone</th><th>Vitals</th><th>Lab</th><th>Eye</th><th>Dental</th><th></th></tr></thead>
          <tbody id="coord-tbody"><tr><td colspan="7" class="text-center muted">Loading...</td></tr></tbody>
        </table>
      </div>
    </div>`;
  loadCoordinator();
}

async function loadCoordinator() {
  try {
    const [patients, metrics] = await Promise.all([
      api('getPatientsForOutreach', { outreachId: '' }),
      api('getAggregatedMetrics', { outreachId: '' })
    ]);
    state.patients = patients;

    document.getElementById('co-total').textContent = patients.length;
    document.getElementById('co-vitals').textContent = patients.filter(p => p.status.vitals === 'pending').length;
    document.getElementById('co-lab').textContent = patients.filter(p => p.status.lab === 'pending').length;
    document.getElementById('co-ref').textContent = metrics.referralsIssued;

    const tbody = document.getElementById('coord-tbody');
    if (!patients.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center muted" style="padding:24px;">No patients enrolled yet</td></tr>`;
      return;
    }
    tbody.innerHTML = patients.slice(0, 50).map(p => `
      <tr>
        <td><div class="td-name">${escapeHtml(p.fullName)}</div><div class="td-id">${p.id}</div></td>
        <td>${escapeHtml(p.phone || '—')}</td>
        <td><span class="badge badge-${p.status.vitals}">${p.status.vitals}</span></td>
        <td><span class="badge badge-${p.status.lab}">${p.status.lab}</span></td>
        <td><span class="badge badge-${p.status.eye}">${p.status.eye}</span></td>
        <td><span class="badge badge-${p.status.dental}">${p.status.dental}</span></td>
        <td><button class="btn btn-xs btn-primary" onclick="openReferral('${p.id}','${escapeAttr(p.fullName)}')">Refer</button></td>
      </tr>`).join('');
  } catch (err) { toast(err.message, 'error'); }
}

function openEnrollModal() {
  openModal('Enroll New Patient (NDPA)', `
    <form onsubmit="submitEnrollment(event)">
      <div class="field"><label>Full Name *</label><input type="text" id="e-name" required placeholder="e.g. Babatunde Alabi"></div>
      <div class="row">
        <div class="field"><label>Age *</label><input type="number" id="e-age" required min="1" max="120" placeholder="45"></div>
        <div class="field"><label>Gender *</label>
          <select id="e-gender" required><option value="Male">Male</option><option value="Female">Female</option></select>
        </div>
      </div>
      <div class="field"><label>Phone *</label><input type="tel" id="e-phone" required placeholder="0802 345 6789"></div>
      <div class="field">
        <label style="display:flex;gap:10px;font-weight:400;align-items:flex-start;">
          <input type="checkbox" id="e-consent" required checked style="width:auto;margin-top:3px;">
          <span style="font-size:12px;line-height:1.5;">
            <strong>NDPA Consent:</strong> Patient has been informed of their rights under the Nigeria Data Protection Act 2023 and consents to processing of clinical data for screening and referral.
          </span>
        </label>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Confirm Enrollment</button>
    </form>`);
}

async function submitEnrollment(e) {
  e.preventDefault();
  const payload = {
    fullName: document.getElementById('e-name').value.trim(),
    age: document.getElementById('e-age').value,
    gender: document.getElementById('e-gender').value,
    phone: document.getElementById('e-phone').value.trim(),
    outreachId: state.activeOutreachId,
    consentNDPA: document.getElementById('e-consent').checked,
    coordinatorEmail: state.currentUser.email
  };
  try {
    const res = await api('registerPatient', payload);
    closeModal();
    toast(`Enrolled: ${payload.fullName} (${res.patientId})`, 'success');
    loadCoordinator();
  } catch (err) { toast(err.message, 'error'); }
}

function openReferral(patientId, patientName) {
  openModal('Issue Referral Slip', `
    <form onsubmit="submitReferral(event, '${patientId}')">
      <p style="margin:0 0 14px;font-size:13px;">
        <strong>Patient:</strong> ${escapeHtml(patientName)} <span class="td-id">${patientId}</span>
      </p>
      <div class="field"><label>Urgency *</label>
        <select id="r-urgency" required>
          <option value="routine">Routine (within 14 days)</option>
          <option value="urgent">Urgent (within 48 hours)</option>
          <option value="emergency">Emergency (immediate)</option>
        </select>
      </div>
      <div class="field"><label>Target Facility *</label><input type="text" id="r-facility" required placeholder="e.g. LASUTH Ikeja"></div>
      <div class="field"><label>Primary Reason *</label><input type="text" id="r-reason" required placeholder="e.g. Stage 2 HTN BP 164/102"></div>
      <button type="submit" class="btn btn-primary btn-block">Issue Referral Slip</button>
    </form>`);
}

async function submitReferral(e, patientId) {
  e.preventDefault();
  const payload = {
    patientId,
    outreachId: state.activeOutreachId,
    urgency: document.getElementById('r-urgency').value,
    targetFacility: document.getElementById('r-facility').value,
    primaryReason: document.getElementById('r-reason').value,
    referringClinician: state.currentUser.fullName,
    referringRole: state.currentUser.role
  };
  try {
    const res = await api('issueReferralSlip', payload);
    closeModal();
    toast(`Referral ${res.slipId} · Code: ${res.verificationCode}`, 'success');
  } catch (err) { toast(err.message, 'error'); }
}

/* -------------------------------------------------------------------------
 * STATION NAV
 * ---------------------------------------------------------------------- */
function stationNav(active) {
  const r = state.currentUser.role;
  const isAdmin = ['super_admin','coordinator'].includes(r);
  const pills = [];
  if (isAdmin || r === 'nurse')       pills.push({ k: 'nurse',  icon: '🩺', label: 'Vitals' });
  if (isAdmin || r === 'lab_tech')    pills.push({ k: 'lab',    icon: '🧪', label: 'Lab' });
  if (isAdmin || r === 'optometrist') pills.push({ k: 'eye',    icon: '👁️', label: 'Eye' });
  if (isAdmin || r === 'dentist')     pills.push({ k: 'dental', icon: '🦷', label: 'Dental' });
  return `<div class="station-subnav">${pills.map(p =>
    `<button class="station-pill ${active === p.k ? 'active' : ''}" onclick="switchTab('${p.k}')">${p.icon} ${p.label}</button>`
  ).join('')}</div>`;
}

/* -------------------------------------------------------------------------
 * NURSE
 * ---------------------------------------------------------------------- */
function renderNurse() {
  const v = document.getElementById('nurseView');
  v.classList.remove('hidden');
  v.innerHTML = `
    ${greetingCard()}
    <div class="dash-head"><div><h1>Nurse Station</h1><p class="sub">Vital signs capture &amp; BMI triage</p></div></div>
    ${stationNav('nurse')}
    <div class="station-grid">
      <div class="card">
        <h3>Capture Vitals</h3>
        <p class="card-sub">All fields marked * are required</p>
        <form onsubmit="submitVitals(event)">
          <div class="field"><label>Patient *</label>
            <select id="n-patient" required><option value="">— Select patient —</option></select>
          </div>
          <div class="row">
            <div class="field"><label>Systolic mmHg *</label><input type="number" id="n-sys" required min="60" max="260" placeholder="120"></div>
            <div class="field"><label>Diastolic mmHg *</label><input type="number" id="n-dia" required min="40" max="160" placeholder="80"></div>
          </div>
          <div class="row">
            <div class="field"><label>Weight kg *</label><input type="number" id="n-wt" step="0.1" required min="10" max="300" placeholder="70" oninput="previewBmi()"></div>
            <div class="field"><label>Height cm *</label><input type="number" id="n-ht" step="0.5" required min="50" max="250" placeholder="175" oninput="previewBmi()"></div>
          </div>
          <div class="bmi-box"><span>BMI</span><strong id="n-bmi">—</strong><span class="badge badge-neutral" id="n-bmi-cat">Not set</span></div>
          <button type="submit" class="btn btn-primary btn-block">Save Vitals</button>
        </form>
      </div>
      <div class="card">
        <h3>Awaiting Vitals</h3>
        <p class="card-sub">Tap a patient to load into form</p>
        <div class="queue-list" id="n-queue"></div>
      </div>
    </div>`;
  loadQueue('n-patient', 'n-queue', 'vitals');
}

function previewBmi() {
  const wt = parseFloat(document.getElementById('n-wt').value);
  const ht = parseFloat(document.getElementById('n-ht').value);
  if (!(wt > 0 && ht > 0)) return;
  const bmi = +(wt / ((ht/100)**2)).toFixed(1);
  document.getElementById('n-bmi').textContent = bmi;
  const b = document.getElementById('n-bmi-cat');
  if (bmi < 18.5)      { b.className = 'badge badge-pending';   b.textContent = 'Underweight'; }
  else if (bmi < 25)   { b.className = 'badge badge-completed'; b.textContent = 'Normal'; }
  else if (bmi < 30)   { b.className = 'badge badge-pending';   b.textContent = 'Overweight'; }
  else                 { b.className = 'badge badge-danger';    b.textContent = 'Obese'; }
}

async function submitVitals(e) {
  e.preventDefault();
  const pid = document.getElementById('n-patient').value;
  if (!pid) return;
  const payload = {
    patientId: pid,
    outreachId: state.activeOutreachId,
    bloodPressureSys: document.getElementById('n-sys').value,
    bloodPressureDia: document.getElementById('n-dia').value,
    weightKg: document.getElementById('n-wt').value,
    heightCm: document.getElementById('n-ht').value,
    recordedByEmail: state.currentUser.email
  };
  try {
    const res = await api('recordVitalSigns', payload);
    toast(`Saved · BMI ${res.bmi} (${res.bmiCategory})`, 'success');
    renderNurse();
  } catch (err) { toast(err.message, 'error'); }
}

/* -------------------------------------------------------------------------
 * LAB
 * ---------------------------------------------------------------------- */
function renderLab() {
  const v = document.getElementById('labView');
  v.classList.remove('hidden');
  v.innerHTML = `
    ${greetingCard()}
    <div class="dash-head"><div><h1>Laboratory</h1><p class="sub">Blood glucose screening</p></div></div>
    ${stationNav('lab')}
    <div class="station-grid">
      <div class="card">
        <h3>Record Glucose</h3>
        <p class="card-sub">Fasting and random blood sugar</p>
        <form onsubmit="submitLab(event)">
          <div class="field"><label>Patient *</label>
            <select id="l-patient" required><option value="">— Select patient —</option></select>
          </div>
          <div class="row">
            <div class="field"><label>Test Type *</label>
              <select id="l-type" required>
                <option value="Random">Random (RBS)</option>
                <option value="Fasting">Fasting (FBS)</option>
              </select>
            </div>
            <div class="field"><label>Unit *</label>
              <select id="l-unit" required>
                <option value="mg/dL">mg/dL</option>
                <option value="mmol/L">mmol/L</option>
              </select>
            </div>
          </div>
          <div class="field"><label>Value *</label>
            <input type="number" id="l-value" step="0.1" required min="10" max="800" placeholder="e.g. 110">
          </div>
          <button type="submit" class="btn btn-primary btn-block">Save Result</button>
        </form>
      </div>
      <div class="card">
        <h3>Awaiting Lab</h3>
        <div class="queue-list" id="l-queue"></div>
      </div>
    </div>`;
  loadQueue('l-patient', 'l-queue', 'lab');
}

async function submitLab(e) {
  e.preventDefault();
  const pid = document.getElementById('l-patient').value;
  if (!pid) return;
  const payload = {
    patientId: pid,
    outreachId: state.activeOutreachId,
    testType: document.getElementById('l-type').value,
    unit: document.getElementById('l-unit').value,
    value: document.getElementById('l-value').value,
    recordedByEmail: state.currentUser.email
  };
  try {
    const res = await api('recordDiagnostics', payload);
    toast(`Saved · ${res.category} (${res.valInMgDl} mg/dL)`, 'success');
    renderLab();
  } catch (err) { toast(err.message, 'error'); }
}

/* -------------------------------------------------------------------------
 * EYE
 * ---------------------------------------------------------------------- */
function renderEye() {
  const v = document.getElementById('eyeView');
  v.classList.remove('hidden');
  v.innerHTML = `
    ${greetingCard()}
    <div class="dash-head"><div><h1>Eye Clinic</h1><p class="sub">Visual acuity &amp; ophthalmic screening</p></div></div>
    ${stationNav('eye')}
    <div class="station-grid">
      <div class="card">
        <h3>Eye Examination</h3>
        <form onsubmit="submitEye(event)">
          <div class="field"><label>Patient *</label>
            <select id="ey-patient" required><option value="">— Select patient —</option></select>
          </div>
          <div class="row">
            <div class="field"><label>Acuity OD (right)</label><input type="text" id="ey-od" placeholder="6/6" required></div>
            <div class="field"><label>Acuity OS (left)</label><input type="text" id="ey-os" placeholder="6/6" required></div>
          </div>
          <div class="field"><label>Diagnosis / Observations</label>
            <input type="text" id="ey-diag" placeholder="e.g. Presbyopia">
          </div>
          <button type="submit" class="btn btn-primary btn-block">Save Eye Record</button>
        </form>
      </div>
      <div class="card">
        <h3>Awaiting Eye</h3>
        <div class="queue-list" id="ey-queue"></div>
      </div>
    </div>`;
  loadQueue('ey-patient', 'ey-queue', 'eye');
}

async function submitEye(e) {
  e.preventDefault();
  const pid = document.getElementById('ey-patient').value;
  if (!pid) return;
  const payload = {
    patientId: pid, outreachId: state.activeOutreachId,
    visualAcuityOD: document.getElementById('ey-od').value,
    visualAcuityOS: document.getElementById('ey-os').value,
    presumptiveDiagnosis: document.getElementById('ey-diag').value,
    recordedByEmail: state.currentUser.email
  };
  try {
    await api('recordEyeCheck', payload);
    toast('Eye record saved', 'success');
    renderEye();
  } catch (err) { toast(err.message, 'error'); }
}

/* -------------------------------------------------------------------------
 * DENTAL
 * ---------------------------------------------------------------------- */
function renderDental() {
  const v = document.getElementById('dentalView');
  v.classList.remove('hidden');
  v.innerHTML = `
    ${greetingCard()}
    <div class="dash-head"><div><h1>Dental Clinic</h1><p class="sub">Oral health screening</p></div></div>
    ${stationNav('dental')}
    <div class="station-grid">
      <div class="card">
        <h3>Dental Examination</h3>
        <form onsubmit="submitDental(event)">
          <div class="field"><label>Patient *</label>
            <select id="d-patient" required><option value="">— Select patient —</option></select>
          </div>
          <div class="field"><label>Oral Hygiene</label>
            <select id="d-hygiene" required>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Poor">Poor</option>
            </select>
          </div>
          <div class="field">
            <label style="display:flex;gap:10px;font-weight:400;align-items:center;">
              <input type="checkbox" id="d-caries" style="width:auto;"> Caries (cavities) present
            </label>
          </div>
          <div class="field"><label>Clinical Notes</label>
            <textarea id="d-notes" rows="3" placeholder="Periodontal findings..."></textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Save Dental Record</button>
        </form>
      </div>
      <div class="card">
        <h3>Awaiting Dental</h3>
        <div class="queue-list" id="d-queue"></div>
      </div>
    </div>`;
  loadQueue('d-patient', 'd-queue', 'dental');
}

async function submitDental(e) {
  e.preventDefault();
  const pid = document.getElementById('d-patient').value;
  if (!pid) return;
  const payload = {
    patientId: pid, outreachId: state.activeOutreachId,
    oralHygieneScore: document.getElementById('d-hygiene').value,
    cariesPresent: document.getElementById('d-caries').checked,
    recommendations: document.getElementById('d-notes').value,
    recordedByEmail: state.currentUser.email
  };
  try {
    await api('recordDentalCheck', payload);
    toast('Dental record saved', 'success');
    renderDental();
  } catch (err) { toast(err.message, 'error'); }
}

/* -------------------------------------------------------------------------
 * QUEUE LOADER
 * ---------------------------------------------------------------------- */
async function loadQueue(selectId, listId, stationKey) {
  try {
    const patients = await api('getPatientsForOutreach', { outreachId: '' });
    state.patients = patients;

    const select = document.getElementById(selectId);
    const list = document.getElementById(listId);
    if (!select || !list) return;

    const pending = patients.filter(p => p.status[stationKey] !== 'completed');
    list.innerHTML = pending.length
      ? pending.map(p => `
          <div class="queue-item" onclick="selectPatient('${selectId}','${p.id}')">
            <div class="queue-info">
              <span class="queue-name">${escapeHtml(p.fullName)}</span>
              <span class="queue-meta">${p.id} · ${p.age}y ${p.gender[0]}</span>
            </div>
            <span class="badge badge-pending">Start</span>
          </div>`).join('')
      : `<p class="muted text-sm text-center" style="padding:20px;">All patients cleared for this station ✓</p>`;

    select.innerHTML = '<option value="">— Select patient —</option>' +
      patients.map(p => `<option value="${p.id}">${p.id} · ${escapeHtml(p.fullName)} (${p.status[stationKey]})</option>`).join('');
  } catch (err) { toast(err.message, 'error'); }
}

function selectPatient(selectId, patientId) {
  const s = document.getElementById(selectId);
  if (s) {
    s.value = patientId;
    s.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/* -------------------------------------------------------------------------
 * INVITE / USERS
 * ---------------------------------------------------------------------- */
function openInviteModal() {
  const canInviteSA = state.currentUser.role === 'super_admin';
  openModal('Invite Personnel', `
    <form onsubmit="submitInvite(event)">
      <div class="field"><label>Full Name *</label><input type="text" id="i-name" required placeholder="e.g. Nurse Ada Obi"></div>
      <div class="field"><label>Email *</label><input type="email" id="i-email" required placeholder="ada@twcmedcrm.org"></div>
      <div class="field"><label>Role *</label>
        <select id="i-role" required>
          <option value="">— Select role —</option>
          <option value="nurse">🩺 Nurse</option>
          <option value="lab_tech">🧪 Lab Technician</option>
          <option value="optometrist">👁️ Optometrist</option>
          <option value="dentist">🦷 Dentist</option>
          <option value="coordinator">📋 Coordinator</option>
          ${canInviteSA ? '<option value="super_admin">👑 Super-Admin</option>' : ''}
        </select>
      </div>
      <div class="field"><label>Assigned Site</label><input type="text" id="i-site" value="All Sites"></div>
      <p class="muted text-xs" style="margin:0 0 14px;">Invitee receives a temporary password and must change it on first login (NDPA §39).</p>
      <button type="submit" class="btn btn-primary btn-block">Send Invitation</button>
    </form>`);
}

async function submitInvite(e) {
  e.preventDefault();
  const payload = {
    fullName: document.getElementById('i-name').value.trim(),
    email: document.getElementById('i-email').value.trim(),
    role: document.getElementById('i-role').value,
    assignedSite: document.getElementById('i-site').value.trim() || 'All Sites',
    invitedBy: state.currentUser.email
  };
  try {
    const res = await api('inviteUser', payload);
    closeModal();
    toast(res.message, res.success ? 'success' : 'error');
  } catch (err) { toast(err.message, 'error'); }
}

async function openUserDirectory() {
  showLoader(true, 'Loading users...');
  try {
    const res = await api('getUsers', { requestingEmail: state.currentUser.email });
    showLoader(false);
    if (!res.success) { toast(res.message, 'error'); return; }
    const canToggle = state.currentUser.role === 'super_admin';
    const rows = res.users.map(u => `
      <tr>
        <td>
          <div class="td-name">${escapeHtml(u.fullName)}</div>
          <div class="td-id">${escapeHtml(u.email)}</div>
        </td>
        <td>${formatRole(u.role)}</td>
        <td><span class="badge badge-${u.status === 'Active' ? 'completed' : 'danger'}">${u.status}</span></td>
        <td>
          ${canToggle && u.email !== state.currentUser.email
            ? `<button class="btn btn-xs btn-secondary" onclick="toggleUser('${escapeAttr(u.email)}')">Toggle</button>`
            : ''}
        </td>
      </tr>`).join('');
    openModal('User Directory', `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>User</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`);
  } catch (err) { showLoader(false); toast(err.message, 'error'); }
}

async function toggleUser(email) {
  try {
    const res = await api('toggleUserStatus', { targetEmail: email, requestingEmail: state.currentUser.email });
    toast(res.message, res.success ? 'success' : 'error');
    closeModal();
    openUserDirectory();
  } catch (err) { toast(err.message, 'error'); }
}

function openAuditLog() {
  openModal('Audit Log (NDPA §39)', `
    <p class="muted text-sm" style="margin:0 0 12px;">
      All access and modifications are logged per NDPA 2023 §39 (records of processing activities).
      Full log is stored in the <strong>Audit_Logs</strong> sheet.
    </p>
    <button class="btn btn-secondary btn-block" onclick="closeModal()">Close</button>`);
}

/* -------------------------------------------------------------------------
 * UI UTILITIES
 * ---------------------------------------------------------------------- */
function openModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('universalModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('universalModal').classList.add('hidden');
  document.body.style.overflow = '';
}

function showLoader(show, msg) {
  const el = document.getElementById('loader');
  if (!el) return;
  if (show) {
    document.getElementById('loaderMessage').textContent = msg || 'Processing...';
    el.classList.remove('hidden');
  } else el.classList.add('hidden');
}

let toastTimer;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

function formatRole(role) {
  return ({
    super_admin: 'Super-Admin', coordinator: 'Coordinator', nurse: 'Nurse',
    lab_tech: 'Lab Tech', optometrist: 'Eye Specialist', dentist: 'Dentist'
  })[role] || role;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, "\\'"); }

document.addEventListener('input', (e) => {
  if (e.target.id === 'newPasswordInput') {
    const v = e.target.value;
    const el = document.getElementById('pwdStrength');
    if (!el) return;
    let score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    el.className = 'pwd-strength ' + (score < 2 ? 'weak' : score < 4 ? 'medium' : 'strong');
  }
});

window.addEventListener('load', () => {
  const params = new URLSearchParams(location.search);
  const view = params.get('view');
  const action = params.get('action');
  if (view && state.currentUser) switchTab(view);
  if (action === 'register' && state.currentUser &&
      ['coordinator','super_admin'].includes(state.currentUser.role)) {
    openEnrollModal();
  }
});
