// ==============================================================================
// KORI FILMS CONTROL — Master Hub Controller (Superadmin)
// ==============================================================================

import { requireAuth } from './auth-guard.js';
import {
  getLocales,
  saveLocal,
  getUsuariosByLocal,
  addUsuarioToLocal,
  removeUsuarioFromLocal,
  fetchProductos,
  fetchCategorias,
  fetchVisitasCount,
} from './supabase-client.js';

let activeLocalForUsersModal = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Proteger la página: solo superadmin
  const session = requireAuth({ requireSuperadmin: true });
  if (!session) return;

  // Cargar datos iniciales
  await loadHubData();

  // Configurar listeners de modales
  setupModalListeners();
});

async function loadHubData() {
  const loadingEl = document.getElementById('hub-loading');
  const contentEl = document.getElementById('hub-content');

  try {
    const locales = getLocales();

    // Obtener métricas reales de Supabase para Tencha
    const [productos, categorias, totalVisitas] = await Promise.all([
      fetchProductos('tencha').catch(() => []),
      fetchCategorias('tencha').catch(() => []),
      fetchVisitasCount('tencha').catch(() => 0),
    ]);

    const totalProductos = productos.length;
    const disponibles = productos.filter((p) => p.disponible !== false).length;
    const pausados = totalProductos - disponibles;

    // Actualizar KPIs superiores
    renderKPICards({
      totalLocales: locales.length,
      totalProductos,
      disponibles,
      pausados,
      totalCategorias: categorias.length,
      totalVisitas,
    });

    // Renderizar lista de locales gastronómicos
    renderLocalesList(locales, { totalProductos, disponibles, pausados, categoriasCount: categorias.length });
  } catch (error) {
    console.error('Error cargando datos del Hub:', error);
    showNotification('Error al cargar datos de Supabase', 'error');
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
  }
}

function renderKPICards({ totalLocales, totalProductos, disponibles, pausados, totalCategorias, totalVisitas }) {
  const kpiLocales = document.getElementById('kpi-locales-count');
  const kpiProductos = document.getElementById('kpi-productos-count');
  const kpiDisponibles = document.getElementById('kpi-disponibles-count');
  const kpiPausados = document.getElementById('kpi-pausados-count');
  const kpiVisitas = document.getElementById('kpi-visitas-count');

  if (kpiLocales) kpiLocales.textContent = totalLocales;
  if (kpiProductos) kpiProductos.textContent = totalProductos;
  if (kpiDisponibles) kpiDisponibles.textContent = disponibles;
  if (kpiPausados) kpiPausados.textContent = pausados;
  if (kpiVisitas) kpiVisitas.textContent = totalVisitas.toLocaleString('es-CL');
}

function renderLocalesList(locales, tenchaStats) {
  const container = document.getElementById('locales-container');
  if (!container) return;

  container.innerHTML = '';

  locales.forEach((local) => {
    const usuarios = getUsuariosByLocal(local.id);
    const isTencha = local.id === 'tencha';
    const totalProd = isTencha ? tenchaStats.totalProductos : 0;
    const disp = isTencha ? tenchaStats.disponibles : 0;
    const paus = isTencha ? tenchaStats.pausados : 0;
    const catCount = isTencha ? tenchaStats.categoriasCount : 0;

    const card = document.createElement('div');
    card.className = 'local-card';
    card.innerHTML = `
      <div class="local-card-header">
        <div class="local-brand">
          <div class="local-avatar ${isTencha ? 'avatar-matcha' : 'avatar-default'}">
            ${isTencha ? '🍵' : '🍽️'}
          </div>
          <div>
            <div class="local-title-row">
              <h3 class="local-name">${local.nombre}</h3>
              <span class="status-chip ${local.activo ? 'status-active' : 'status-inactive'}">
                ${local.activo ? '● Activo' : '○ Inactivo'}
              </span>
            </div>
            <p class="local-meta">${local.tipo} • ${local.ciudad || 'Chile'}</p>
          </div>
        </div>
      </div>

      <div class="local-stats-row">
        <div class="local-stat-item">
          <span class="local-stat-num">${totalProd}</span>
          <span class="local-stat-lbl">Productos</span>
        </div>
        <div class="local-stat-item">
          <span class="local-stat-num text-success">${disp}</span>
          <span class="local-stat-lbl">En Carta</span>
        </div>
        <div class="local-stat-item">
          <span class="local-stat-num ${paus > 0 ? 'text-warning' : ''}">${paus}</span>
          <span class="local-stat-lbl">Pausados</span>
        </div>
        <div class="local-stat-item">
          <span class="local-stat-num">${catCount}</span>
          <span class="local-stat-lbl">Categorías</span>
        </div>
        <div class="local-stat-item">
          <span class="local-stat-num text-accent">${usuarios.length}</span>
          <span class="local-stat-lbl">Usuarios</span>
        </div>
      </div>

      <div class="local-users-preview">
        <span class="users-label">Accesos autorizados:</span>
        <div class="user-pill-list">
          ${usuarios
            .map(
              (u) =>
                `<span class="user-pill ${u.rol === 'superadmin' ? 'user-pill-super' : ''}" title="${u.email}">
                  ${u.email}
                </span>`
            )
            .join('')}
        </div>
      </div>

      <div class="local-actions">
        <a href="menu.html?local=${encodeURIComponent(local.id)}" class="btn btn-primary btn-block">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path>
          </svg>
          Administrar Carta
        </a>
        <button class="btn btn-secondary btn-manage-users" data-local-id="${local.id}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          Gestionar Usuarios
        </button>
        ${
          isTencha || local.urlCarta
            ? `<a href="${local.urlCarta || 'https://tenchamatcheria.com/'}" target="_blank" class="btn btn-sm btn-outline" style="grid-column: 1 / -1; justify-content: center; font-size: 0.8rem; margin-top: 4px;">
                Ver Carta Digital en Vivo (${local.dominio || 'tenchamatcheria.com'}) ↗
              </a>`
            : ''
        }
      </div>
    `;

    container.appendChild(card);
  });

  // Listener para botones de gestionar usuarios
  document.querySelectorAll('.btn-manage-users').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const localId = btn.getAttribute('data-local-id');
      openUsersModal(localId);
    });
  });
}

// ------------------------------------------------------------------------------
// MODAL DE GESTIÓN DE USUARIOS
// ------------------------------------------------------------------------------

function openUsersModal(localId) {
  activeLocalForUsersModal = localId;
  const locales = getLocales();
  const local = locales.find((l) => l.id === localId) || { nombre: localId };

  const modal = document.getElementById('users-modal');
  const titleEl = document.getElementById('users-modal-local-name');
  if (titleEl) titleEl.textContent = local.nombre;

  renderUsersInModal(localId);

  if (modal) modal.classList.remove('hidden');
}

function renderUsersInModal(localId) {
  const listEl = document.getElementById('modal-users-list');
  if (!listEl) return;

  const usuarios = getUsuariosByLocal(localId);
  listEl.innerHTML = '';

  if (usuarios.length === 0) {
    listEl.innerHTML = '<p class="text-muted">No hay usuarios asignados a este local.</p>';
    return;
  }

  usuarios.forEach((u) => {
    const isSuper = u.rol === 'superadmin';
    const row = document.createElement('div');
    row.className = 'user-row-item';
    row.innerHTML = `
      <div class="user-row-info">
        <span class="user-email-text">${u.email}</span>
        <span class="badge ${isSuper ? 'badge-superadmin' : 'badge-client'}">
          ${isSuper ? 'SUPERADMIN' : 'ADMIN LOCAL'}
        </span>
      </div>
      <div class="user-row-action">
        ${
          !isSuper
            ? `<button class="btn-icon-danger btn-remove-user" data-email="${u.email}" title="Remover acceso">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"></path>
                </svg>
              </button>`
            : '<span class="text-xs text-muted">Acceso Maestro</span>'
        }
      </div>
    `;
    listEl.appendChild(row);
  });

  // Listeners para eliminar usuario
  listEl.querySelectorAll('.btn-remove-user').forEach((btn) => {
    btn.addEventListener('click', () => {
      const email = btn.getAttribute('data-email');
      if (confirm(`¿Estás seguro de revocar el acceso a ${email}?`)) {
        try {
          removeUsuarioFromLocal(localId, email);
          renderUsersInModal(localId);
          renderLocalesList(getLocales(), {});
          showNotification(`Acceso revocado para ${email}`, 'success');
        } catch (e) {
          alert(e.message);
        }
      }
    });
  });
}

function setupModalListeners() {
  // Modal de usuarios: cerrar
  const closeUsersModalBtn = document.getElementById('close-users-modal-btn');
  const usersModal = document.getElementById('users-modal');
  if (closeUsersModalBtn && usersModal) {
    closeUsersModalBtn.addEventListener('click', () => {
      usersModal.classList.add('hidden');
      loadHubData();
    });
  }

  // Formulario para agregar usuario a local
  const addUserForm = document.getElementById('add-user-form');
  if (addUserForm) {
    addUserForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!activeLocalForUsersModal) return;

      const emailInput = document.getElementById('new-user-email');
      const roleSelect = document.getElementById('new-user-role');
      const email = emailInput.value.trim().toLowerCase();
      const rol = roleSelect ? roleSelect.value : 'admin_local';

      if (!email || !email.includes('@')) {
        alert('Por favor ingresa un email válido');
        return;
      }

      addUsuarioToLocal(activeLocalForUsersModal, { email, rol });
      emailInput.value = '';
      renderUsersInModal(activeLocalForUsersModal);
      showNotification(`Usuario ${email} agregado exitosamente`, 'success');
    });
  }

  // Modal para agregar nuevo local
  const btnNewLocal = document.getElementById('btn-new-local');
  const newLocalModal = document.getElementById('new-local-modal');
  const closeNewLocalModalBtn = document.getElementById('close-new-local-modal-btn');
  const newLocalForm = document.getElementById('new-local-form');

  if (btnNewLocal && newLocalModal) {
    btnNewLocal.addEventListener('click', () => {
      newLocalModal.classList.remove('hidden');
    });
  }

  if (closeNewLocalModalBtn && newLocalModal) {
    closeNewLocalModalBtn.addEventListener('click', () => {
      newLocalModal.classList.add('hidden');
    });
  }

  if (newLocalForm) {
    newLocalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nombre = document.getElementById('local-name-input').value.trim();
      const tipo = document.getElementById('local-type-input').value.trim();
      const ciudad = document.getElementById('local-city-input').value.trim() || 'Santiago, Chile';
      const adminEmail = document.getElementById('local-admin-email-input').value.trim().toLowerCase();

      if (!nombre) {
        alert('Ingresa el nombre del restaurante');
        return;
      }

      const slug = nombre
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

      const nuevoLocal = {
        id: slug,
        slug: slug,
        nombre: nombre,
        tipo: tipo || 'Restaurante / Cafetería',
        ciudad: ciudad,
        activo: true,
        tablas: {
          productos: 'productos',
          categorias: 'categorias',
          visitas: 'visitas',
          recomendados: 'recomendados',
        },
      };

      saveLocal(nuevoLocal);

      if (adminEmail && adminEmail.includes('@')) {
        addUsuarioToLocal(slug, {
          email: adminEmail,
          rol: 'admin_local',
          nombre: adminEmail.split('@')[0],
        });
      }

      newLocalForm.reset();
      newLocalModal.classList.add('hidden');
      loadHubData();
      showNotification(`Nuevo cliente ${nombre} creado con éxito`, 'success');
    });
  }
}

function showNotification(text, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
