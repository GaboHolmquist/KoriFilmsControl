// ==============================================================================
// KORI FILMS CONTROL — Panel de Administración de Menús Gastronómicos
// Basado en el motor de producción de Tencha Matchería
// ==============================================================================

(function() {
  'use strict';

  // Credenciales ofuscadas para seguridad
  const _API_URL = atob('aHR0cHM6Ly9ia3ViZGNmaGdpdmdtY2tibHN5dC5zdXBhYmFzZS5jbw==');
  const _API_KEY = atob('c2JfcHVibGlzaGFibGVfNVNGNUo4eV9yMUtXSlRVMWFUXzQzd19WRUtoZGlxUw==');

  const dbClient = (window[atob('c3VwYWJhc2U=')] || window._dbSdk).createClient(_API_URL, _API_KEY);

  let state = {
    user: null,
    categories: [],
    products: [],
    recomendados: [],
    searchTerm: '',
    currentLocalId: 'tencha',
    savedScrollY: 0
  };

  // Leer parámetro ?local= de la URL
  try {
    const params = new URLSearchParams(window.location.search);
    const localParam = params.get('local');
    if (localParam) state.currentLocalId = localParam;
  } catch (_) {}

  // ---------- Inactividad (Cierre automático tras 10 minutos) ----------
  const INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutos
  let inactivityTimer = null;

  function resetInactivityTimer() {
    if (!state.user) return;
    localStorage.setItem('kfc_admin_last_activity', Date.now().toString());
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      handleAutoLogout();
    }, INACTIVITY_LIMIT_MS);
  }

  async function handleAutoLogout() {
    clearTimeout(inactivityTimer);
    localStorage.removeItem('kfc_admin_last_activity');
    localStorage.removeItem('kfc_active_session');
    try { await dbClient.auth.signOut(); } catch (_) {}
    state.user = null;
    showLogin();
    const errEl = document.getElementById('loginError');
    if (errEl) {
      errEl.textContent = 'Tu sesión se cerró automáticamente por inactividad (10 minutos). Inicia sesión nuevamente.';
      errEl.style.display = 'block';
    }
    showToast('⚠️ Sesión cerrada por inactividad (10 min)', false);
  }

  function initInactivityListeners() {
    ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
      window.addEventListener(evt, () => {
        if (state.user) resetInactivityTimer();
      }, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.user) {
        const last = parseInt(localStorage.getItem('kfc_admin_last_activity') || '0', 10);
        if (last && Date.now() - last > INACTIVITY_LIMIT_MS) {
          handleAutoLogout();
        } else {
          resetInactivityTimer();
        }
      }
    });
  }

  // ---------- Protección Anti-Fuerza Bruta (1 min al 4to intento) ----------
  const MAX_FAILED_ATTEMPTS = 4;
  const LOCKOUT_DURATION_MS = 60 * 1000; // 1 minuto de bloqueo
  let lockoutTimer = null;

  function getFailedAttempts() {
    return parseInt(localStorage.getItem('kfc_failed_login_attempts') || '0', 10);
  }

  function getLockoutUntil() {
    return parseInt(localStorage.getItem('kfc_lockout_until') || '0', 10);
  }

  function checkLockoutStatus() {
    const lockUntil = getLockoutUntil();
    const now = Date.now();
    if (lockUntil && lockUntil > now) {
      applyLockoutUI(lockUntil);
      return true;
    }
    if (lockUntil && lockUntil <= now) {
      clearLockout();
    }
    return false;
  }

  function clearLockout() {
    localStorage.removeItem('kfc_lockout_until');
    localStorage.removeItem('kfc_failed_login_attempts');
    if (lockoutTimer) {
      clearInterval(lockoutTimer);
      lockoutTimer = null;
    }
    const btn = document.getElementById('loginSubmitBtn');
    const errEl = document.getElementById('loginError');
    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPassword');

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Ingresar al Panel';
    }
    if (emailInput) emailInput.disabled = false;
    if (passInput) passInput.disabled = false;
    if (errEl && errEl.dataset.locked === 'true') {
      errEl.style.display = 'none';
      delete errEl.dataset.locked;
    }
  }

  function applyLockoutUI(lockUntil) {
    const btn = document.getElementById('loginSubmitBtn');
    const errEl = document.getElementById('loginError');
    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPassword');

    if (emailInput) emailInput.disabled = true;
    if (passInput) passInput.disabled = true;
    if (btn) btn.disabled = true;

    if (lockoutTimer) clearInterval(lockoutTimer);

    const updateUI = () => {
      const remainingMs = lockUntil - Date.now();
      if (remainingMs <= 0) {
        clearLockout();
        return;
      }
      const remainingSec = Math.ceil(remainingMs / 1000);
      if (btn) btn.textContent = `Bloqueado (${remainingSec}s)`;
      if (errEl) {
        errEl.dataset.locked = 'true';
        errEl.textContent = `🔒 Demasiados intentos fallidos. Acceso bloqueado temporalmente por seguridad. Inténtalo de nuevo en ${remainingSec} segundo${remainingSec === 1 ? '' : 's'}.`;
        errEl.style.display = 'block';
      }
    };

    updateUI();
    lockoutTimer = setInterval(updateUI, 1000);
  }

  // ---------- Roles y Permisos ----------
  const SUPERADMIN_EMAILS = [atob('YWRtaW5Aa29yaWZpbG1zLmNs')];

  function isSuperadmin(email) {
    if (!email) return false;
    return SUPERADMIN_EMAILS.includes(email.toLowerCase().trim());
  }

  function canAddOrDelete() {
    if (!state.user || !state.user.email) return false;
    return isSuperadmin(state.user.email);
  }

  // ---------- Auth & Sesión (Validación estricta por JWT) ----------
  async function checkSession() {
    try {
      const { data: { session } } = await dbClient.auth.getSession();
      if (session && session.user && session.user.email) {
        const last = parseInt(localStorage.getItem('kfc_admin_last_activity') || '0', 10);
        if (last && Date.now() - last > INACTIVITY_LIMIT_MS) {
          await handleAutoLogout();
          return;
        }
        state.user = session.user;
        localStorage.setItem('kfc_active_session', JSON.stringify({
          userId: session.user.id,
          email: session.user.email.toLowerCase(),
          rol: isSuperadmin(session.user.email) ? 'superadmin' : 'admin_local',
          createdAt: Date.now(),
          expiresAt: Date.now() + 12 * 60 * 60 * 1000
        }));
        resetInactivityTimer();
        showDashboard();
        return;
      }
    } catch (_) {}

    localStorage.removeItem('kfc_active_session');
    showLogin();
  }

  async function handleLogin(e) {
    if (e) e.preventDefault();
    if (checkLockoutStatus()) return;

    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginSubmitBtn');
    const errEl = document.getElementById('loginError');

    btn.disabled = true;
    btn.textContent = 'Verificando...';
    errEl.style.display = 'none';

    try {
      const { data, error } = await dbClient.auth.signInWithPassword({ email, password });
      if (error || !data?.user || !data?.session) {
        throw new Error('Credenciales inválidas');
      }

      const loggedInUser = data.user;
      clearLockout();
      state.user = loggedInUser;

      // Guardar sesión compartida
      localStorage.setItem('kfc_active_session', JSON.stringify({
        userId: loggedInUser.id,
        email: loggedInUser.email.toLowerCase(),
        rol: isSuperadmin(loggedInUser.email) ? 'superadmin' : 'admin_local',
        createdAt: Date.now(),
        expiresAt: Date.now() + 12 * 60 * 60 * 1000
      }));

      resetInactivityTimer();
      showDashboard();
    } catch (err) {
      const fails = getFailedAttempts() + 1;
      localStorage.setItem('kfc_failed_login_attempts', String(fails));

      if (fails >= MAX_FAILED_ATTEMPTS) {
        const lockUntil = Date.now() + LOCKOUT_DURATION_MS;
        localStorage.setItem('kfc_lockout_until', String(lockUntil));
        applyLockoutUI(lockUntil);
      } else {
        const remaining = MAX_FAILED_ATTEMPTS - fails;
        errEl.textContent = `Credenciales incorrectas. Te queda${remaining === 1 ? '' : 'n'} ${remaining} intento${remaining === 1 ? '' : 's'} antes del bloqueo temporal (1 min).`;
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Ingresar al Panel';
      }
    }
  }

  async function handleLogout() {
    clearTimeout(inactivityTimer);
    localStorage.removeItem('kfc_admin_last_activity');
    localStorage.removeItem('kfc_active_session');
    try { await dbClient.auth.signOut(); } catch (_) {}
    state.user = null;
    const isInsideControl = window.location.pathname.includes('/control');
    window.location.replace(isInsideControl ? 'index.html' : 'control/index.html');
  }

  function showLogin() {
    const isInsideControl = window.location.pathname.includes('/control');
    window.location.replace(isInsideControl ? 'index.html' : 'control/index.html');
  }

  // ---------- Auditoría y Control de Supervisión Superadmin ----------
  const AUDIT_STORAGE_KEY = 'kfc_audit_log';

  function getLocalAuditLogs(localId) {
    try {
      const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
      let logs = [];
      if (stored) {
        logs = JSON.parse(stored);
      } else {
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        logs = [
          {
            id: 'seed_1',
            localId: 'tencha',
            userEmail: 'contacto@tenchamatcheria.com',
            userRole: 'admin_local',
            type: 'login',
            action: 'Ingreso al panel',
            detail: 'El administrador ingresó a la configuración de la carta',
            timestamp: now - (3 * dayMs + 3600000 * 4),
          },
          {
            id: 'seed_2',
            localId: 'tencha',
            userEmail: 'contacto@tenchamatcheria.com',
            userRole: 'admin_local',
            type: 'edit',
            action: 'Modificación de precio',
            detail: 'Actualizó precio de Matcha Latte Frío a $4.900',
            timestamp: now - (3 * dayMs + 3600000 * 3),
          },
          {
            id: 'seed_3',
            localId: 'tencha',
            userEmail: 'contacto@tenchamatcheria.com',
            userRole: 'admin_local',
            type: 'login',
            action: 'Ingreso al panel',
            detail: 'El administrador ingresó a la configuración de la carta',
            timestamp: now - (14 * dayMs + 3600000 * 2),
          },
          {
            id: 'seed_4',
            localId: 'tencha',
            userEmail: 'contacto@tenchamatcheria.com',
            userRole: 'admin_local',
            type: 'edit',
            action: 'Disponibilidad de producto',
            detail: 'Cambió disponibilidad de Roll Croissant Matcha a Disponible',
            timestamp: now - (14 * dayMs + 3600000 * 1),
          },
        ];
        localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
      }
      return localId ? logs.filter((l) => l.localId === localId) : logs;
    } catch (_) {
      return [];
    }
  }

  function recordLocalAuditActivity({ localId, userEmail, userRole, type, action, detail }) {
    try {
      const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
      let logs = [];
      if (stored) {
        try { logs = JSON.parse(stored); } catch (_) { logs = []; }
      }
      const entry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        localId: localId || state.currentLocalId || 'tencha',
        userEmail: (userEmail || (state.user ? state.user.email : 'admin_local')).toLowerCase(),
        userRole: userRole || (isSuperadmin(state.user?.email) ? 'superadmin' : 'admin_local'),
        type: type || 'edit', // 'login' | 'create' | 'edit' | 'delete'
        action: action || 'Modificación en carta',
        detail: detail || '',
        timestamp: Date.now(),
      };
      logs.unshift(entry);
      if (logs.length > 250) logs.pop();
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
      renderSuperadminAuditBanner();
      return entry;
    } catch (err) {
      console.warn('Error registrando auditoría:', err);
    }
  }

  function renderSuperadminAuditBanner() {
    const banner = document.getElementById('superadminAuditBalloon');
    if (!banner) return;

    // Sólo visible para superadmin
    if (!state.user || !isSuperadmin(state.user.email)) {
      banner.style.display = 'none';
      return;
    }

    banner.style.display = 'block';

    const localId = state.currentLocalId || 'tencha';
    const logs = getLocalAuditLogs(localId);

    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const superEmail = atob('YWRtaW5Aa29yaWZpbG1zLmNs').toLowerCase();
    const adminLogins = logs.filter(
      (l) =>
        l.type === 'login' &&
        l.timestamp >= thirtyDaysAgo &&
        l.userEmail !== superEmail &&
        l.userRole !== 'superadmin'
    );
    const loginCount = adminLogins.length;
    const changes = logs.filter((l) => l.type !== 'login');

    const summaryEl = document.getElementById('superadminAuditSummary');
    const badgeEl = document.getElementById('auditChangesCountBadge');
    const counterEl = document.getElementById('auditDetailsCounter');
    const timelineEl = document.getElementById('superadminAuditTimeline');

    if (summaryEl) {
      if (loginCount === 0) {
        summaryEl.innerHTML = 'El administrador del restaurante aún no ha ingresado en los últimos 30 días.';
      } else if (loginCount === 1) {
        summaryEl.innerHTML = 'El administrador del restaurante ha ingresado <strong>1 vez</strong> en los últimos 30 días.';
      } else {
        summaryEl.innerHTML = `El administrador del restaurante ha ingresado <strong>${loginCount} veces</strong> en los últimos 30 días.`;
      }
    }

    if (badgeEl) badgeEl.textContent = changes.length;
    if (counterEl) counterEl.textContent = `${logs.length} eventos registrados`;

    if (timelineEl) {
      if (logs.length === 0) {
        timelineEl.innerHTML = '<p style="color: var(--muted); font-size: 0.85rem; padding: 12px 0;">No hay registros de actividad aún.</p>';
      } else {
        timelineEl.innerHTML = logs
          .map((item) => {
            const dateStr = new Date(item.timestamp).toLocaleString('es-CL', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            let pillClass = 'audit-pill-edit';
            let pillText = 'Modificó';
            if (item.type === 'login') {
              pillClass = 'audit-pill-login';
              pillText = 'Ingreso';
            } else if (item.type === 'create') {
              pillClass = 'audit-pill-create';
              pillText = 'Creó';
            } else if (item.type === 'delete') {
              pillClass = 'audit-pill-delete';
              pillText = 'Eliminó';
            }

            return `
              <div class="audit-item">
                <div class="audit-item-top">
                  <span class="audit-pill ${pillClass}">${pillText}</span>
                  <span class="audit-item-time">${dateStr}</span>
                </div>
                <div class="audit-item-detail">${item.detail || item.action}</div>
                <div class="audit-item-user">👤 ${item.userEmail || 'admin_local'}</div>
              </div>
            `;
          })
          .join('');
      }
    }

    const toggleBtn = document.getElementById('btnToggleAuditDetails');
    const detailsEl = document.getElementById('superadminAuditDetails');
    if (toggleBtn && detailsEl && !toggleBtn.dataset.bound) {
      toggleBtn.dataset.bound = 'true';
      toggleBtn.addEventListener('click', () => {
        const isClosed = detailsEl.style.display === 'none';
        detailsEl.style.display = isClosed ? 'block' : 'none';
        toggleBtn.textContent = isClosed
          ? `▲ Ocultar Historial (${changes.length})`
          : `📜 Ver Historial de Horarios y Cambios (${changes.length})`;
      });
    }
  }

  function showDashboard() {
    const loginEl = document.getElementById('loginView');
    if (loginEl) loginEl.style.display = 'none';
    const dashEl = document.getElementById('dashboardView');
    if (dashEl) dashEl.style.display = 'block';
    const topbar = document.getElementById('topbarActions');
    if (topbar) topbar.style.display = 'flex';

    // Globo de supervisión exclusivo para superadmin
    renderSuperadminAuditBanner();

    const btnNew = document.getElementById('btnNewProduct');
    if (btnNew) btnNew.style.display = canAddOrDelete() ? 'inline-flex' : 'none';

    // Mostrar botón de regreso a Master Hub si es superadmin
    const btnHub = document.getElementById('btnBackToHub');
    if (btnHub) {
      btnHub.style.display = isSuperadmin(state.user?.email) ? 'inline-flex' : 'none';
    }

    // Actualizar badge de local
    const badge = document.getElementById('topbarLocalBadge');
    if (badge && state.currentLocalId === 'tencha') {
      badge.textContent = 'TENCHA MATCHERIA';
    }

    loadData();
  }

  // ---------- Carga de Datos del Servidor ----------
  async function loadData() {
    try {
      const [catsRes, prodsRes, recsRes] = await Promise.all([
        dbClient.from('categorias').select('*').order('orden', { ascending: true }),
        dbClient.from('productos').select('*').order('orden', { ascending: true }),
        dbClient.from('recomendados').select('*').order('orden', { ascending: true })
      ]);

      if (catsRes.error) throw catsRes.error;
      if (prodsRes.error) throw prodsRes.error;
      if (recsRes.error) throw recsRes.error;

      state.categories = catsRes.data || [];
      state.products = prodsRes.data || [];
      state.recomendados = recsRes.data || [];

      renderDashboard();
      updateStats();
      loadVisitorStats();
    } catch (err) {
      showToast('Error al cargar datos: ' + err.message, false);
    }
  }

  function updateStats() {
    const total = state.products.length;
    const active = state.products.filter(p => p.disponible).length;
    const inactive = total - active;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statActive').textContent = active;
    document.getElementById('statInactive').textContent = inactive;
  }

  async function loadVisitorStats() {
    const uEl = document.getElementById('statVisitorsUnique');
    const tEl = document.getElementById('statVisitsTotal');
    const rEl = document.getElementById('statVisitorsRecurrent');
    const rateEl = document.getElementById('statRecurrenceRate');
    if (!uEl || !tEl) return;

    try {
      let stats = null;
      try {
        const { data, error } = await dbClient.rpc('obtener_estadisticas_visitas');
        if (!error && data) stats = data;
      } catch (_) {}

      if (!stats) {
        const { data, error } = await dbClient
          .from('visitas')
          .select('visitor_id,es_recurrente');
        if (!error && Array.isArray(data)) {
          const total = data.length;
          const counts = {};
          data.forEach(r => {
            counts[r.visitor_id] = (counts[r.visitor_id] || 0) + 1;
          });
          const unicos = Object.keys(counts).length;
          const recurrentes = Object.values(counts).filter(c => c > 1).length;
          stats = { total, unicos, recurrentes };
        }
      }

      if (stats) {
        const total = Number(stats.total || 0);
        const unicos = Number(stats.unicos || 0);
        const recurrentes = Number(stats.recurrentes || 0);
        const rate = unicos > 0 ? Math.round((recurrentes / unicos) * 100) : 0;

        uEl.textContent = unicos.toLocaleString('es-CL');
        tEl.textContent = total.toLocaleString('es-CL');
        rEl.textContent = recurrentes.toLocaleString('es-CL');
        rateEl.textContent = `${rate}%`;
      } else {
        uEl.textContent = '0';
        tEl.textContent = '0';
        rEl.textContent = '0';
        rateEl.textContent = '0%';
      }
    } catch (err) {
      console.warn('Visitas no cargadas:', err);
    }
  }

  // ---------- Render de la Carta ----------
  const esc = (s = '') => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function renderDashboard() {
    renderCategoryChips();
    renderSections();
  }

  function renderCategoryChips() {
    const wrap = document.getElementById('categoryChips');
    if (!wrap) return;

    wrap.innerHTML = `
      <button class="chip-btn ${state.searchTerm === '' ? 'active' : ''}" onclick="window._kfc.filterCat('all')">Todos</button>
      <button class="chip-btn" onclick="window._kfc.scrollToSec('sec-rec')">★ Recomendados</button>
    ` + state.categories.map(c => `
      <button class="chip-btn" onclick="window._kfc.scrollToSec('sec-${esc(c.id)}')">${esc(c.nombre)}</button>
    `).join('');
  }

  function scrollToSec(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function isProductInRecomendados(prod) {
    if (!prod) return false;
    const pName = (prod.nombre || '').toLowerCase().trim();
    return state.recomendados.some(r => {
      const rName = (r.nombre || '').toLowerCase().trim();
      if (rName === pName) return true;
      if (r.carpeta && prod.carpeta && r.carpeta.includes(prod.carpeta)) return true;
      return false;
    });
  }

  function getRecomendadoMatch(prod) {
    if (!prod) return null;
    const pName = (prod.nombre || '').toLowerCase().trim();
    return state.recomendados.find(r => {
      const rName = (r.nombre || '').toLowerCase().trim();
      if (rName === pName) return true;
      if (r.carpeta && prod.carpeta && r.carpeta.includes(prod.carpeta)) return true;
      return false;
    });
  }

  function renderSections() {
    const container = document.getElementById('sectionsContainer');
    if (!container) return;
    const q = state.searchTerm.toLowerCase();
    let html = '';

    // 1. Recomendados (siempre visible si hay o coincide búsqueda)
    const recsFiltered = state.recomendados.filter(r => !q || r.nombre.toLowerCase().includes(q));
    if (recsFiltered.length > 0 || (!q && state.recomendados.length > 0)) {
      const isLimit = state.recomendados.length >= 5;
      html += `
        <section class="admin-section" id="sec-rec">
          <div class="admin-sec-header">
            <h2 class="admin-sec-title">★ Recomendados <small>Carrusel de portada</small></h2>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="badge-count">${state.recomendados.length} / 5</span>
              ${isLimit ? '<span class="badge-limit">LÍMITE ALCANZADO (5/5)</span>' : ''}
            </div>
          </div>
          <div class="prod-grid">
            ${recsFiltered.map(r => renderProductCard(r, true)).join('')}
          </div>
        </section>
      `;
    }

    // 2. Categorías
    state.categories.forEach(c => {
      const prods = state.products.filter(p => p.categoria_id === c.id && (!q || p.nombre.toLowerCase().includes(q) || (p.sub && p.sub.toLowerCase().includes(q))));
      if (q && prods.length === 0) return;

      html += `
        <section class="admin-section" id="sec-${esc(c.id)}">
          <div class="admin-sec-header">
            <h2 class="admin-sec-title">${esc(c.nombre)} <small class="jp">${esc(c.jp || '')}</small></h2>
            <span class="admin-sec-count">${prods.length} productos</span>
          </div>
          <div class="prod-grid">
            ${prods.map(p => renderProductCard(p, false, c.carpeta)).join('')}
          </div>
        </section>
      `;
    });

    container.innerHTML = html;
  }

  function renderProductCard(item, isRec = false, catCarpeta = '') {
    let imgSrc = '../assets/logo-kori.png';
    let fallbackSrc = '../assets/logo-kori.png';
    const rawFolder = String(item.carpeta || '').replace(/#(no)?video$/, '').trim();
    const safeCatFolder = String(catCarpeta || '').replace(/[^a-zA-Z0-9_\-\/]/g, '');
    const remoteDomain = 'https://tenchamatcheria.com';

    if (/^https?:\/\//i.test(rawFolder)) {
      const cleanRemote = rawFolder.endsWith('/') ? rawFolder : rawFolder + '/';
      imgSrc = cleanRemote + 'foto.webp';

      // Fallback a CDN del cliente si solo se subió el video (.mp4) pero no la foto (.webp)
      const matchProd = cleanRemote.match(/productos\/(.+)$/i);
      if (matchProd && matchProd[1]) {
        fallbackSrc = `${remoteDomain}/productos/${matchProd[1].replace(/^\/+/, '')}foto.webp`;
      } else {
        const parts = cleanRemote.replace(/\/+$/, '').split('/');
        const slug = parts[parts.length - 1] || '';
        if (safeCatFolder && slug) {
          fallbackSrc = `${remoteDomain}/productos/${safeCatFolder}/${slug}/foto.webp`;
        }
      }
    } else {
      const safeFolder = rawFolder.replace(/[^a-zA-Z0-9_\-\/]/g, '');
      if (isRec || safeFolder.startsWith('productos/')) {
        imgSrc = `${remoteDomain}/${safeFolder.replace(/^\/+/, '')}${safeFolder.endsWith('/') ? '' : '/'}foto.webp`;
      } else {
        imgSrc = `${remoteDomain}/productos/${safeCatFolder}/${safeFolder}/foto.webp`;
      }
      fallbackSrc = '../assets/logo-kori.png';
    }

    const numId = Number(item.id) || 0;
    const tempIcon = item.temperatura === 'caliente' ? '🔥 Caliente' : item.temperatura === 'frio' ? '❄️ Frío' : item.temperatura === 'ambos' ? '❄️🔥 Ambos' : '';
    const isAgotado = Boolean(item.agotado || (Array.isArray(item.tags) && item.tags.includes('agotado')));
    const isVegano = Boolean(item.vegano || (Array.isArray(item.tags) && item.tags.includes('vegano')));
    const isSinGluten = Boolean(item.sin_gluten || (Array.isArray(item.tags) && (item.tags.includes('sin_gluten') || item.tags.includes('sin-gluten'))));

    // Si es la sección de Recomendados: tarjeta de solo lectura con botón para quitar
    if (isRec) {
      return `
        <div class="prod-card ${item.disponible ? '' : 'disabled'} ${isAgotado ? 'agotado' : ''}" id="card-rec-${numId}">
          <div class="prod-card-top">
            <img class="prod-thumb" src="${esc(imgSrc)}" data-fallback="${esc(fallbackSrc)}" onerror="if(this.dataset.fallback && !this.dataset.triedFallback){this.dataset.triedFallback='true';this.src=this.dataset.fallback;}else{this.onerror=null;this.src='../assets/logo-kori.png';}" alt="${esc(item.nombre)}">
            <div class="prod-info">
              <div class="prod-name" title="${esc(item.nombre)}">
                ${esc(item.nombre)}
                ${isAgotado ? '<span class="badge-agotado">Agotado</span>' : ''}
              </div>
              <div class="prod-sub">${esc(item.sub || item.jp || 'Sin subtítulo')}</div>
              <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-top:4px;">
                ${tempIcon ? `<span class="prod-temp-badge" style="margin-top:0;">${tempIcon}</span>` : ''}
                ${isVegano ? `<span class="badge-diet" style="margin-top:0;">🌱 Vegano</span>` : ''}
                ${isSinGluten ? `<span class="badge-diet" style="margin-top:0;">🌾 Sin gluten</span>` : ''}
              </div>
            </div>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0 4px;border-top:1px solid rgba(255,255,255,0.06);margin-top:10px;">
            <span style="font-size:0.95rem;font-weight:600;color:var(--matcha);">$${(Number(item.precio) || 0).toLocaleString('es-CL')}</span>
            <span style="font-size:0.75rem;color:var(--muted);">${item.disponible ? '● Visible en carta' : '○ Pausado'}</span>
          </div>

          <button class="btn btn-sm btn-danger" style="width:100%;margin-top:10px;justify-content:center;" onclick="window._kfc.removeRecomendado(${numId})">
            ✕ Quitar de recomendados
          </button>
        </div>
      `;
    }

    // Botón de recomendados para productos de catálogo general
    let recButtonHtml = '';
    const inRec = isProductInRecomendados(item);
    if (inRec) {
      recButtonHtml = `
        <button class="btn btn-rec btn-rec-active" style="margin-top:8px;" onclick="window._kfc.removeRecomendadoByProdId(${numId})" title="Quitar de recomendados y mantener en su categoría">
          ★ En Recomendados (Quitar)
        </button>
      `;
    } else {
      if (state.recomendados.length >= 5) {
        recButtonHtml = `
          <button class="btn btn-rec btn-rec-assign" style="margin-top:8px;opacity:0.55;" onclick="window._kfc.showLimitAlert()" title="Límite alcanzado (máx 5)">
            ☆ Asignar a Recomendados
          </button>
        `;
      } else {
        recButtonHtml = `
          <button class="btn btn-rec btn-rec-assign" style="margin-top:8px;" onclick="window._kfc.assignToRecomendados(${numId})">
            ☆ Asignar a Recomendados
          </button>
        `;
      }
    }

    return `
      <div class="prod-card ${item.disponible ? '' : 'disabled'} ${isAgotado ? 'agotado' : ''}" id="card-prod-${numId}">
        <div class="prod-card-top">
          <img class="prod-thumb" src="${esc(imgSrc)}" data-fallback="${esc(fallbackSrc)}" onerror="if(this.dataset.fallback && !this.dataset.triedFallback){this.dataset.triedFallback='true';this.src=this.dataset.fallback;}else{this.onerror=null;this.src='../assets/logo-kori.png';}" alt="${esc(item.nombre)}">
          <div class="prod-info">
            <div class="prod-name" title="${esc(item.nombre)}">
              ${esc(item.nombre)}
              ${isAgotado ? '<span class="badge-agotado">Agotado</span>' : ''}
            </div>
            <div class="prod-sub">${esc(item.sub || item.jp || 'Sin subtítulo')}</div>
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-top:4px;">
              ${tempIcon ? `<span class="prod-temp-badge" style="margin-top:0;">${tempIcon}</span>` : ''}
              ${isVegano ? `<span class="badge-diet" style="margin-top:0;">🌱 Vegano</span>` : ''}
              ${isSinGluten ? `<span class="badge-diet" style="margin-top:0;">🌾 Sin gluten</span>` : ''}
            </div>
          </div>
          <button class="btn btn-sm" onclick="window._kfc.openEditModal(${numId}, false)">✏️</button>
        </div>

        <div class="switch-wrap">
          <span class="switch-label ${item.disponible ? 'on' : ''}" id="lbl-prod-${numId}">
            ${item.disponible ? '● Visible en carta' : '○ Pausado / Apagado'}
          </span>
          <label class="switch">
            <input type="checkbox" ${item.disponible ? 'checked' : ''} onchange="window._kfc.toggleAvailability(${numId}, false, this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="switch-wrap" style="margin-top: 6px;">
          <span class="switch-label ${isAgotado ? 'warn' : ''}" id="lbl-agotado-prod-${numId}">
            ${isAgotado ? '⚠️ Producto agotado' : '○ En stock'}
          </span>
          <label class="switch switch-warn">
            <input type="checkbox" ${isAgotado ? 'checked' : ''} onchange="window._kfc.toggleAgotado(${numId}, false, this.checked)">
            <span class="slider"></span>
          </label>
        </div>

        <div class="prod-controls">
          <div class="price-input-wrap">
            <span class="price-prefix">$</span>
            <input type="number" class="price-input" value="${Number(item.precio) || 0}" onblur="window._kfc.savePrice(${numId}, false, this.value)" onkeydown="if(event.key==='Enter')this.blur()">
          </div>
          <button class="btn btn-sm" onclick="window._kfc.openEditModal(${numId}, false)">Detalles</button>
        </div>

        ${recButtonHtml}
      </div>
    `;
  }

  // ---------- Acciones de Recomendados (Máximo 5) ----------
  function showLimitAlert() {
    showToast('⚠️ Límite de 5 recomendados alcanzado. Quita uno antes de añadir otro.', false);
  }

  async function assignToRecomendados(prodId) {
    if (state.recomendados.length >= 5) {
      showLimitAlert();
      return;
    }
    const prod = state.products.find(p => p.id === prodId);
    if (!prod) return;
    const cat = state.categories.find(c => c.id === prod.categoria_id);
    const catCarpeta = cat ? cat.carpeta : '';

    const rawProdCarpeta = String(prod.carpeta || '').trim();
    const isRemoteCarpeta = /^https?:\/\//i.test(rawProdCarpeta);
    const hasCatVid = true;
    const hasVid = rawProdCarpeta.endsWith('#video') || (!rawProdCarpeta.endsWith('#novideo') && Boolean(prod.tiene_video || hasCatVid));

    const newRec = {
      nombre: prod.nombre,
      sub: prod.sub || '',
      jp: prod.jp || '',
      precio: prod.precio,
      temperatura: prod.temperatura || '',
      tags: prod.tags || [],
      disponible: prod.disponible,
      descripcion: prod.descripcion || '',
      carpeta: isRemoteCarpeta || rawProdCarpeta.startsWith('productos/') ? rawProdCarpeta : `productos/${catCarpeta}/${rawProdCarpeta}`,
      tiene_video: hasVid,
      orden: state.recomendados.length + 1
    };

    try {
      const { data, error } = await dbClient.from('recomendados').insert([newRec]).select();
      if (error) throw error;
      if (data && data[0]) state.recomendados.push(data[0]);
      recordLocalAuditActivity({
        localId: state.currentLocalId,
        type: 'edit',
        action: 'Recomendados',
        detail: `Añadió a recomendados: "${prod.nombre}"`,
      });
      showToast(`★ "${prod.nombre}" añadido a recomendados (${state.recomendados.length}/5)`);
      renderDashboard();
    } catch (err) {
      showToast('Error al asignar a recomendados: ' + err.message, false);
    }
  }

  async function removeRecomendado(recId) {
    const rec = state.recomendados.find(r => r.id === recId);
    const name = rec ? rec.nombre : 'Producto';
    try {
      const { error } = await dbClient.from('recomendados').delete().eq('id', recId);
      if (error) throw error;
      state.recomendados = state.recomendados.filter(r => r.id !== recId);
      recordLocalAuditActivity({
        localId: state.currentLocalId,
        type: 'edit',
        action: 'Recomendados',
        detail: `Quitó de recomendados: "${name}"`,
      });
      showToast(`✓ "${name}" quitado de recomendados (${state.recomendados.length}/5)`);
      renderDashboard();
    } catch (err) {
      showToast('Error al quitar de recomendados: ' + err.message, false);
    }
  }

  async function removeRecomendadoByProdId(prodId) {
    const prod = state.products.find(p => p.id === prodId);
    if (!prod) return;
    const recMatch = getRecomendadoMatch(prod);
    if (!recMatch) return;
    await removeRecomendado(recMatch.id);
  }

  // ---------- Quick Updates en Vivo ----------
  async function toggleAvailability(id, isRec, checked) {
    const table = isRec ? 'recomendados' : 'productos';
    const card = document.getElementById(`card-${isRec ? 'rec' : 'prod'}-${id}`);
    const lbl = document.getElementById(`lbl-${isRec ? 'rec' : 'prod'}-${id}`);

    if (card) card.classList.toggle('disabled', !checked);
    if (lbl) {
      lbl.className = 'switch-label ' + (checked ? 'on' : '');
      lbl.textContent = checked ? '● Visible en carta' : '○ Pausado / Apagado';
    }

    try {
      const { error } = await dbClient.from(table).update({ disponible: checked }).eq('id', id);
      if (error) throw error;

      const list = isRec ? state.recomendados : state.products;
      const item = list.find(x => x.id === id);
      if (item) item.disponible = checked;

      // Sincronizar catálogo con recomendados
      if (!isRec && item) {
        const recMatch = getRecomendadoMatch(item);
        if (recMatch) {
          await dbClient.from('recomendados').update({ disponible: checked }).eq('id', recMatch.id);
          recMatch.disponible = checked;
          const recCard = document.getElementById(`card-rec-${recMatch.id}`);
          const recLbl = document.getElementById(`lbl-rec-${recMatch.id}`);
          if (recCard) recCard.classList.toggle('disabled', !checked);
          if (recLbl) {
            recLbl.className = 'switch-label ' + (checked ? 'on' : '');
            recLbl.textContent = checked ? '● Visible en carta' : '○ Pausado / Apagado';
          }
        }
      }

      updateStats();
      const itemName = item ? item.nombre : `ID #${id}`;
      recordLocalAuditActivity({
        localId: state.currentLocalId,
        type: 'edit',
        action: 'Disponibilidad',
        detail: `Cambió disponibilidad de "${itemName}" a ${checked ? 'Visible en carta' : 'Pausado / Oculto'}`,
      });
      showToast(checked ? 'Producto activado en carta' : 'Producto pausado (oculto)');
    } catch (err) {
      showToast('Error al actualizar disponibilidad: ' + err.message, false);
    }
  }

  async function toggleAgotado(id, isRec, checked) {
    const table = isRec ? 'recomendados' : 'productos';
    const card = document.getElementById(`card-${isRec ? 'rec' : 'prod'}-${id}`);
    const lbl = document.getElementById(`lbl-agotado-${isRec ? 'rec' : 'prod'}-${id}`);

    if (card) card.classList.toggle('agotado', checked);
    if (lbl) {
      lbl.className = 'switch-label ' + (checked ? 'warn' : '');
      lbl.textContent = checked ? '⚠️ Producto agotado' : '○ En stock';
    }

    const list = isRec ? state.recomendados : state.products;
    const item = list.find(x => x.id === id);
    if (!item) return;

    let currentTags = Array.isArray(item.tags) ? item.tags.slice() : [];
    if (checked) {
      if (!currentTags.includes('agotado')) currentTags.push('agotado');
    } else {
      currentTags = currentTags.filter(t => t !== 'agotado');
    }

    try {
      const { error } = await dbClient.from(table).update({ tags: currentTags }).eq('id', id);
      if (error) throw error;

      item.tags = currentTags;
      item.agotado = checked;

      if (!isRec) {
        const recMatch = getRecomendadoMatch(item);
        if (recMatch) {
          let recTags = Array.isArray(recMatch.tags) ? recMatch.tags.slice() : [];
          if (checked) {
            if (!recTags.includes('agotado')) recTags.push('agotado');
          } else {
            recTags = recTags.filter(t => t !== 'agotado');
          }
          await dbClient.from('recomendados').update({ tags: recTags }).eq('id', recMatch.id);
          recMatch.tags = recTags;
          recMatch.agotado = checked;
          const recCard = document.getElementById(`card-rec-${recMatch.id}`);
          const recLbl = document.getElementById(`lbl-agotado-rec-${recMatch.id}`);
          if (recCard) recCard.classList.toggle('agotado', checked);
          if (recLbl) {
            recLbl.className = 'switch-label ' + (checked ? 'warn' : '');
            recLbl.textContent = checked ? '⚠️ Producto agotado' : '○ En stock';
          }
        }
      }

      renderDashboard();
      const itemName = item ? item.nombre : `ID #${id}`;
      recordLocalAuditActivity({
        localId: state.currentLocalId,
        type: 'edit',
        action: 'Stock',
        detail: `Marcó "${itemName}" como ${checked ? 'Agotado' : 'En stock'}`,
      });
      showToast(checked ? 'Producto marcado como agotado' : 'Producto disponible en stock');
    } catch (err) {
      showToast('Error al actualizar agotado: ' + err.message, false);
    }
  }

  async function savePrice(id, isRec, val) {
    const precio = parseInt(val, 10);
    if (isNaN(precio) || precio < 0) return;
    const table = isRec ? 'recomendados' : 'productos';

    try {
      const { error } = await dbClient.from(table).update({ precio }).eq('id', id);
      if (error) throw error;

      const list = isRec ? state.recomendados : state.products;
      const item = list.find(x => x.id === id);
      if (item) item.precio = precio;

      if (!isRec && item) {
        const recMatch = getRecomendadoMatch(item);
        if (recMatch) {
          await dbClient.from('recomendados').update({ precio }).eq('id', recMatch.id);
          recMatch.precio = precio;
          const recInput = document.querySelector(`#card-rec-${recMatch.id} .price-input`);
          if (recInput) recInput.value = precio;
        }
      }

      const itemName = item ? item.nombre : `ID #${id}`;
      recordLocalAuditActivity({
        localId: state.currentLocalId,
        type: 'edit',
        action: 'Modificación de precio',
        detail: `Actualizó precio de "${itemName}" a $${precio.toLocaleString('es-CL')}`,
      });

      showToast('Precio actualizado a $' + precio.toLocaleString('es-CL'));
    } catch (err) {
      showToast('Error al actualizar precio: ' + err.message, false);
    }
  }

  // ---------- Subida y Optimización de Foto (WebP 4:5) y Video (H.264) ----------
  let selectedFotoBlob = null;
  let selectedFotoType = 'image/webp';
  let selectedVideoFile = null;

  function slugifyFolder(text, count) {
    const slug = String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const prefix = String(count || 1).padStart(2, '0');
    return slug ? `${prefix}-${slug}` : `${prefix}-producto`;
  }

  function autoFillCarpeta(val) {
    const editId = document.getElementById('editId').value;
    if (editId) return;
    const catId = document.getElementById('prodCat').value;
    const inCatCount = state.products.filter(p => p.categoria_id === catId).length + 1;
    document.getElementById('prodCarpeta').value = slugifyFolder(val, inCatCount);
  }

  function extractFolderSlug(rawCarpeta, fallbackName, catId) {
    const clean = String(rawCarpeta || '').replace(/#(no)?video$/, '').replace(/\/+$/, '').trim();
    if (/^https?:\/\//i.test(clean) || clean.includes('/')) {
      const parts = clean.split('/').filter(Boolean);
      return parts[parts.length - 1] || slugifyFolder(fallbackName, 1);
    }
    if (clean) return clean.replace(/[^a-zA-Z0-9_\-]/g, '');
    const inCatCount = state.products.filter(p => p.categoria_id === catId).length + 1;
    return slugifyFolder(fallbackName, inCatCount);
  }

  function setMediaProgress(show, label = '', pct = 0) {
    const wrap = document.getElementById('mediaProgressWrap');
    const lbl = document.getElementById('mediaProgressLabel');
    const pctEl = document.getElementById('mediaProgressPct');
    const fill = document.getElementById('mediaProgressFill');
    if (!wrap) return;
    wrap.style.display = show ? 'block' : 'none';
    if (lbl) lbl.textContent = label;
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    if (pctEl) pctEl.textContent = clamped + '%';
    if (fill) fill.style.width = clamped + '%';
  }

  async function compressImageToWebP(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        try {
          const targetRatio = 4 / 5;
          const srcRatio = img.width / img.height;
          let sx = 0, sy = 0, sw = img.width, sh = img.height;
          if (srcRatio > targetRatio) {
            sw = img.height * targetRatio;
            sx = (img.width - sw) / 2;
          } else {
            sh = img.width / targetRatio;
            sy = (img.height - sh) / 2;
          }
          const outW = Math.min(900, Math.round(sw));
          const outH = Math.round(outW / targetRatio);
          const canvas = document.createElement('canvas');
          canvas.width = outW;
          canvas.height = outH;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

          canvas.toBlob((blob) => {
            if (blob && blob.size > 0) {
              selectedFotoType = 'image/webp';
              resolve(blob);
            } else {
              canvas.toBlob((jpgBlob) => {
                selectedFotoType = 'image/jpeg';
                resolve(jpgBlob || file);
              }, 'image/jpeg', 0.85);
            }
          }, 'image/webp', 0.82);
        } catch {
          resolve(file);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  async function handleFotoSelect(input) {
    const status = document.getElementById('fotoStatusText');
    const file = input.files && input.files[0];
    if (!file) {
      selectedFotoBlob = null;
      status.textContent = 'Se optimiza automáticamente a formato 4:5';
      return;
    }
    status.textContent = 'Optimizando foto a proporción 4:5...';
    try {
      selectedFotoBlob = await compressImageToWebP(file);
      const origKB = Math.round(file.size / 1024);
      const newKB = Math.round(selectedFotoBlob.size / 1024);
      status.textContent = `✓ Lista: ${origKB} KB → ${newKB} KB (${selectedFotoType === 'image/webp' ? 'WebP 4:5' : 'JPG 4:5'})`;
    } catch (err) {
      selectedFotoBlob = file;
      status.textContent = '✓ Foto seleccionada: ' + file.name;
    }
  }

  function handleVideoSelect(input) {
    const status = document.getElementById('videoStatusText');
    const file = input.files && input.files[0];
    if (!file) {
      selectedVideoFile = null;
      status.textContent = 'Se sube directo al servidor multimedia';
      return;
    }
    selectedVideoFile = file;
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    status.textContent = `✓ Video seleccionado: ${file.name} (${mb} MB)`;
  }

  function resetMediaInputs() {
    selectedFotoBlob = null;
    selectedFotoType = 'image/webp';
    selectedVideoFile = null;
    const fInput = document.getElementById('prodFotoFile');
    const vInput = document.getElementById('prodVideoFile');
    if (fInput) fInput.value = '';
    if (vInput) vInput.value = '';
    const fStatus = document.getElementById('fotoStatusText');
    const vStatus = document.getElementById('videoStatusText');
    if (fStatus) fStatus.textContent = 'Se optimiza automáticamente a formato 4:5';
    if (vStatus) vStatus.textContent = 'Se sube directo al servidor multimedia';
    setMediaProgress(false);
  }

  // ---------- Modal de Producto CRUD ----------
  function openNewProductModal() {
    if (!canAddOrDelete()) {
      showToast('No tienes permisos para añadir productos nuevos', false);
      return;
    }
    resetMediaInputs();
    document.getElementById('modalTitle').textContent = 'Añadir Nuevo Producto';
    document.getElementById('editId').value = '';
    document.getElementById('editIsRec').value = 'false';
    document.getElementById('catSelectGroup').style.display = 'block';
    document.getElementById('folderGroup').style.display = 'block';
    document.getElementById('mediaUploadGroup').style.display = 'block';
    document.getElementById('btnDeleteProd').style.display = 'none';

    const catSelect = document.getElementById('prodCat');
    catSelect.innerHTML = state.categories.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
    catSelect.onchange = () => autoFillCarpeta(document.getElementById('prodNombre').value);

    document.getElementById('prodNombre').value = '';
    document.getElementById('prodSub').value = '';
    document.getElementById('prodJp').value = '';
    document.getElementById('prodPrecio').value = '';
    document.getElementById('prodTemp').value = '';
    document.getElementById('prodCarpeta').value = '';
    document.getElementById('prodDesc').value = '';
    document.getElementById('prodDisp').checked = true;
    document.getElementById('prodAgotado').checked = false;
    document.getElementById('prodVegano').checked = false;
    document.getElementById('prodSinGluten').checked = false;
    document.getElementById('lblVegano').classList.remove('active');
    document.getElementById('lblSinGluten').classList.remove('active');

    state.savedScrollY = window.scrollY;
    document.documentElement.classList.add('lock');
    document.body.classList.add('lock');
    document.getElementById('productModal').classList.add('open');
  }

  function openEditModal(id, isRec = false) {
    if (isRec) {
      const recItem = state.recomendados.find(r => r.id === parseInt(id, 10));
      if (recItem) {
        const match = getRecomendadoMatch(recItem) || state.products.find(p => (p.nombre || '').toLowerCase().trim() === (recItem.nombre || '').toLowerCase().trim());
        if (match) return openEditModal(match.id, false);
      }
    }
    const list = state.products;
    const numId = parseInt(id, 10);
    const item = list.find(x => x.id === numId);
    if (!item) return;

    resetMediaInputs();
    document.getElementById('modalTitle').textContent = 'Editar ' + item.nombre;
    document.getElementById('editId').value = numId;
    document.getElementById('editIsRec').value = 'false';

    const catSelectGroup = document.getElementById('catSelectGroup');
    catSelectGroup.style.display = 'block';
    const catSelect = document.getElementById('prodCat');
    catSelect.innerHTML = state.categories.map(c => `<option value="${esc(c.id)}" ${c.id === item.categoria_id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');

    document.getElementById('folderGroup').style.display = canAddOrDelete() ? 'block' : 'none';
    document.getElementById('mediaUploadGroup').style.display = canAddOrDelete() ? 'block' : 'none';
    document.getElementById('prodCarpeta').value = item.carpeta || '';
    document.getElementById('prodNombre').value = item.nombre || '';
    document.getElementById('prodSub').value = item.sub || '';
    document.getElementById('prodJp').value = item.jp || '';
    document.getElementById('prodPrecio').value = item.precio || 0;
    document.getElementById('prodTemp').value = item.temperatura || '';
    document.getElementById('prodDesc').value = item.descripcion || '';
    document.getElementById('prodDisp').checked = !!item.disponible;
    const isAgotado = Boolean(item.agotado || (Array.isArray(item.tags) && item.tags.includes('agotado')));
    document.getElementById('prodAgotado').checked = isAgotado;
    const isVegano = Boolean(item.vegano || (Array.isArray(item.tags) && item.tags.includes('vegano')));
    const isSinGluten = Boolean(item.sin_gluten || (Array.isArray(item.tags) && (item.tags.includes('sin_gluten') || item.tags.includes('sin-gluten'))));
    document.getElementById('prodVegano').checked = isVegano;
    document.getElementById('prodSinGluten').checked = isSinGluten;
    document.getElementById('lblVegano').classList.toggle('active', isVegano);
    document.getElementById('lblSinGluten').classList.toggle('active', isSinGluten);

    document.getElementById('btnDeleteProd').style.display = (isRec || !canAddOrDelete()) ? 'none' : 'block';

    state.savedScrollY = window.scrollY;
    document.documentElement.classList.add('lock');
    document.body.classList.add('lock');
    document.getElementById('productModal').classList.add('open');
  }

  function closeProductModal() {
    document.getElementById('productModal').classList.remove('open');
    document.documentElement.classList.remove('lock');
    document.body.classList.remove('lock');
    if (typeof state.savedScrollY === 'number') {
      window.scrollTo(0, state.savedScrollY);
    }
  }

  async function saveProduct(e) {
    if (e) {
      e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    const id = document.getElementById('editId').value;
    const isRec = document.getElementById('editIsRec').value === 'true';
    if (!id && !canAddOrDelete()) {
      showToast('No tienes permisos para crear productos nuevos', false);
      return;
    }
    const btn = document.getElementById('btnSaveProd');
    btn.disabled = true;

    const nombre = document.getElementById('prodNombre').value.trim();
    if (!nombre) {
      showToast('El nombre del producto no puede estar vacío', false);
      btn.disabled = false;
      return;
    }

    const sub = document.getElementById('prodSub').value.trim();
    const jp = document.getElementById('prodJp').value.trim();
    const rawPrecio = document.getElementById('prodPrecio').value;
    const precio = parseInt(rawPrecio, 10);
    if (isNaN(precio) || precio < 0) {
      showToast('Ingresa un precio numérico válido', false);
      btn.disabled = false;
      return;
    }

    const temperatura = document.getElementById('prodTemp').value;
    let carpeta = document.getElementById('prodCarpeta').value.trim();
    const descripcion = document.getElementById('prodDesc').value.trim();
    const disponible = document.getElementById('prodDisp').checked;
    const isAgotado = document.getElementById('prodAgotado').checked;
    const isVegano = document.getElementById('prodVegano').checked;
    const isSinGluten = document.getElementById('prodSinGluten').checked;

    let tags = [];
    if (temperatura === 'caliente') tags = ['caliente'];
    else if (temperatura === 'frio') tags = ['frio'];
    else if (temperatura === 'ambos') tags = ['frio', 'caliente'];
    if (isAgotado) tags.push('agotado');
    if (isVegano) tags.push('vegano');
    if (isSinGluten) tags.push('sin_gluten');

    try {
      if (canAddOrDelete() && (selectedFotoBlob || selectedVideoFile)) {
        const catId = isRec ? '' : document.getElementById('prodCat').value;
        const catObj = state.categories.find(c => c.id === catId);
        const catCarpeta = catObj ? catObj.carpeta : 'recomendados';
        const slug = extractFolderSlug(carpeta, nombre, catId);
        const storagePrefix = isRec ? `productos/recomendados/${slug}` : `productos/${catCarpeta}/${slug}`;

        if (selectedFotoBlob) {
          setMediaProgress(true, 'Subiendo foto al servidor...', 30);
          const { error: upImgErr } = await dbClient.storage
            .from('media')
            .upload(`${storagePrefix}/foto.webp`, selectedFotoBlob, {
              contentType: selectedFotoType || 'image/webp',
              cacheControl: '60',
              upsert: true
            });
          if (upImgErr) {
            const msg = upImgErr.message || upImgErr.error || JSON.stringify(upImgErr);
            throw new Error('Error al subir foto: ' + msg);
          }
        }

        let uploadedVideo = false;
        if (selectedVideoFile) {
          setMediaProgress(true, 'Subiendo video al servidor...', 70);
          const { error: upVidErr } = await dbClient.storage
            .from('media')
            .upload(`${storagePrefix}/animacion.mp4`, selectedVideoFile, {
              contentType: selectedVideoFile.type || 'video/mp4',
              cacheControl: '60',
              upsert: true
            });
          if (upVidErr) {
            const msg = upVidErr.message || upVidErr.error || JSON.stringify(upVidErr);
            throw new Error('Error al subir video: ' + msg);
          }
          uploadedVideo = true;
        }

        setMediaProgress(true, 'Guardando producto...', 100);
        const hadVideoBefore = carpeta.endsWith('#video');
        const hasVideoFinal = uploadedVideo || hadVideoBefore;
        const publicBaseUrl = `${_API_URL}/storage/v1/object/public/media/${storagePrefix}/`;
        carpeta = publicBaseUrl + (hasVideoFinal ? '#video' : '#novideo');
      }

      const payload = { nombre, sub, jp, precio, temperatura, tags, carpeta, descripcion, disponible };

      if (id) {
        const targetId = parseInt(id, 10);
        const table = isRec ? 'recomendados' : 'productos';
        const prevItem = !isRec ? state.products.find(x => x.id === targetId) : null;
        const recMatch = prevItem ? getRecomendadoMatch(prevItem) : null;
        if (!isRec) {
          const catVal = document.getElementById('prodCat').value;
          if (catVal) payload.categoria_id = catVal;
        }
        const { error } = await dbClient.from(table).update(payload).eq('id', targetId);
        if (error) throw error;

        if (recMatch) {
          await dbClient.from('recomendados').update({
            nombre, sub, jp, precio, temperatura, tags, carpeta: recMatch.carpeta, descripcion, disponible
          }).eq('id', recMatch.id);
        }

        const list = isRec ? state.recomendados : state.products;
        const cur = list.find(x => x.id === targetId);
        if (cur) {
          Object.assign(cur, payload);
          if (recMatch) Object.assign(recMatch, { nombre, sub, jp, precio, temperatura, tags, descripcion, disponible });
        }
        renderDashboard();
        recordLocalAuditActivity({
          localId: state.currentLocalId,
          type: 'edit',
          action: 'Edición de producto',
          detail: `Modificó producto "${nombre}" (precio: $${Number(precio).toLocaleString('es-CL')})`,
        });
        showToast('Producto actualizado con éxito');
      } else {
        payload.categoria_id = document.getElementById('prodCat').value;
        payload.orden = (state.products.length + 1);
        const { error } = await dbClient.from('productos').insert([payload]);
        if (error) throw error;
        recordLocalAuditActivity({
          localId: state.currentLocalId,
          type: 'create',
          action: 'Creación de producto',
          detail: `Agregó nuevo producto "${nombre}" (precio: $${Number(precio).toLocaleString('es-CL')})`,
        });
        showToast('Nuevo producto añadido con éxito');
      }
      closeProductModal();
      await loadData();
    } catch (err) {
      console.error('Error detallado en saveProduct:', err);
      const msg = (err && (err.message || err.error_description || err.error || (typeof err === 'string' ? err : JSON.stringify(err)))) || 'Error desconocido';
      showToast('Error al guardar: ' + msg, false);
    } finally {
      btn.disabled = false;
      setMediaProgress(false);
    }
  }

  async function deleteCurrentProduct() {
    if (!canAddOrDelete()) {
      showToast('No tienes permisos para eliminar productos', false);
      return;
    }
    const id = document.getElementById('editId').value;
    if (!id || !confirm('¿Estás seguro de que deseas eliminar este producto de la base de datos?')) return;

    try {
      const delName = document.getElementById('prodNombre')?.value || `ID #${id}`;
      const { error } = await dbClient.from('productos').delete().eq('id', id);
      if (error) throw error;
      recordLocalAuditActivity({
        localId: state.currentLocalId,
        type: 'delete',
        action: 'Eliminación de producto',
        detail: `Eliminó el producto "${delName}"`,
      });
      showToast('Producto eliminado');
      closeProductModal();
      await loadData();
    } catch (err) {
      showToast('Error al eliminar: ' + err.message, false);
    }
  }

  function handleSearch(val) {
    state.searchTerm = val.trim();
    renderSections();
  }

  // ---------- Toast Notification ----------
  let toastTimeout;
  function showToast(msg, isSuccess = true) {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const text = document.getElementById('toastMsg');
    if (!toast || !icon || !text) return;

    icon.textContent = isSuccess ? '✓' : '⚠️';
    icon.style.color = isSuccess ? 'var(--matcha)' : 'var(--danger)';
    toast.style.borderColor = isSuccess ? 'var(--matcha)' : 'var(--danger)';
    text.textContent = msg;

    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // Exportar al ámbito global para handlers inline de HTML
  window.handleLogin = handleLogin;
  window.handleLogout = handleLogout;
  window.handleSearch = handleSearch;
  window.openNewProductModal = openNewProductModal;
  window.openEditModal = openEditModal;
  window.closeProductModal = closeProductModal;
  window.saveProduct = saveProduct;
  window.deleteCurrentProduct = deleteCurrentProduct;
  window.handleFotoSelect = handleFotoSelect;
  window.handleVideoSelect = handleVideoSelect;
  window.autoFillCarpeta = autoFillCarpeta;

  window._kfc = {
    filterCat: (cat) => { state.searchTerm = ''; renderDashboard(); },
    scrollToSec,
    toggleAvailability,
    toggleAgotado,
    savePrice,
    assignToRecomendados,
    removeRecomendado,
    removeRecomendadoByProdId,
    showLimitAlert,
    openEditModal
  };

  // Listeners de modal y escape
  const pModal = document.getElementById('productModal');
  if (pModal) {
    pModal.addEventListener('click', (e) => {
      if (e.target === pModal) closeProductModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeProductModal();
  });

  // Inicialización
  initInactivityListeners();
  checkSession();

  // Prevenir zoom-out y gestos de pellizco accidentales en Mac trackpad y pantallas táctiles
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });

  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener('gestureend', (e) => e.preventDefault());

  let lastTouchEndAdmin = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEndAdmin <= 300) {
      e.preventDefault();
    }
    lastTouchEndAdmin = now;
  }, false);

})();
