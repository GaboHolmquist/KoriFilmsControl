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
  getAuditLogs,
  getAdminLoginsCount30Days,
  getAdminChangesCount,
} from './data-client.js';

let activeLocalForUsersModal = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Proteger la página: exige sesión criptográfica válida y rol superadmin
  const session = await requireAuth({ requireSuperadmin: true });
  if (!session) return;

  // Cargar lista de cartas activas
  await loadHubData();

  // Configurar listeners de modales
  setupModalListeners();
});

async function loadHubData() {
  const loadingEl = document.getElementById('hub-loading');
  const contentEl = document.getElementById('hub-content');

  try {
    const locales = getLocales();
    renderLocalesList(locales);
  } catch (error) {
    showNotification('Error al cargar cartas activas', 'error');
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
  }
}

function renderLocalesList(locales) {
  const container = document.getElementById('locales-container');
  if (!container) return;

  container.innerHTML = '';

  locales.forEach((local) => {
    const usuarios = getUsuariosByLocal(local.id);
    const isTencha = local.id === 'tencha';
    const loginsCount = getAdminLoginsCount30Days(local.id);
    const changesCount = getAdminChangesCount(local.id);

    let loginsText = 'El administrador del restaurante aún no ha ingresado en los últimos 30 días.';
    if (loginsCount === 1) {
      loginsText = 'El administrador del restaurante ha ingresado <strong>1 vez</strong> en los últimos 30 días.';
    } else if (loginsCount > 1) {
      loginsText = `El administrador del restaurante ha ingresado <strong>${loginsCount} veces</strong> en los últimos 30 días.`;
    }

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

      <!-- Globo de Control de Accesos y Supervisión Superadmin -->
      <div class="local-audit-balloon">
        <div class="audit-balloon-header">
          <div class="audit-balloon-icon">🛡️</div>
          <div class="audit-balloon-info">
            <span class="audit-balloon-tag">Supervisión Superadmin</span>
            <p class="audit-balloon-text">${loginsText}</p>
          </div>
        </div>
        <div class="audit-balloon-footer">
          <button class="btn-audit-trigger" data-local-id="${local.id}" data-local-name="${local.nombre}">
            📜 Ver historial de cambios (${changesCount})
          </button>
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

  document.querySelectorAll('.btn-manage-users').forEach((btn) => {
    btn.addEventListener('click', () => {
      const localId = btn.getAttribute('data-local-id');
      openUsersModal(localId);
    });
  });

  document.querySelectorAll('.btn-audit-trigger').forEach((btn) => {
    btn.addEventListener('click', () => {
      const localId = btn.getAttribute('data-local-id');
      const localName = btn.getAttribute('data-local-name');
      openAuditModal(localId, localName);
    });
  });
}

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
  const closeUsersModalBtn = document.getElementById('close-users-modal-btn');
  const usersModal = document.getElementById('users-modal');
  if (closeUsersModalBtn && usersModal) {
    closeUsersModalBtn.addEventListener('click', () => {
      usersModal.classList.add('hidden');
      loadHubData();
    });
  }

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

  const btnNewLocal = document.getElementById('btn-new-local');
  const newLocalModal = document.getElementById('new-local-modal');
  const closeNewLocalModalBtn = document.getElementById('close-new-local-modal-btn');
  const newLocalForm = document.getElementById('new-local-form');

  const projectReadyModal = document.getElementById('project-ready-modal');
  const closeProjectReadyModalBtn = document.getElementById('close-project-ready-modal-btn');
  const closeProjectReadyFooterBtn = document.getElementById('close-project-ready-footer-btn');
  const copyPathBtn = document.getElementById('copy-path-btn');
  const copyCmdBtn = document.getElementById('copy-cmd-btn');
  const copyPromptBtn = document.getElementById('copy-prompt-btn');

  const closeProjectReady = () => {
    if (projectReadyModal) projectReadyModal.classList.add('hidden');
  };

  if (closeProjectReadyModalBtn) closeProjectReadyModalBtn.addEventListener('click', closeProjectReady);
  if (closeProjectReadyFooterBtn) closeProjectReadyFooterBtn.addEventListener('click', closeProjectReady);

  if (copyPathBtn) {
    copyPathBtn.addEventListener('click', () => {
      const input = document.getElementById('ready-project-path');
      if (input && input.value) {
        navigator.clipboard.writeText(input.value).then(() => {
          showNotification('Ruta copiada al portapapeles', 'success');
        });
      }
    });
  }

  if (copyCmdBtn) {
    copyCmdBtn.addEventListener('click', () => {
      const input = document.getElementById('ready-project-cmd');
      if (input && input.value) {
        navigator.clipboard.writeText(input.value).then(() => {
          showNotification('Comando terminal copiado', 'success');
        });
      }
    });
  }

  if (copyPromptBtn) {
    copyPromptBtn.addEventListener('click', () => {
      const textarea = document.getElementById('ready-project-prompt');
      if (textarea && textarea.value) {
        navigator.clipboard.writeText(textarea.value).then(() => {
          showNotification('Contexto para Antigravity copiado', 'success');
        });
      }
    });
  }

  const auditModal = document.getElementById('audit-modal');
  const closeAuditModalBtn = document.getElementById('close-audit-modal-btn');
  const closeAuditModalFooterBtn = document.getElementById('close-audit-modal-footer-btn');

  const closeAuditModal = () => {
    if (auditModal) auditModal.classList.add('hidden');
  };

  if (closeAuditModalBtn) closeAuditModalBtn.addEventListener('click', closeAuditModal);
  if (closeAuditModalFooterBtn) closeAuditModalFooterBtn.addEventListener('click', closeAuditModal);

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
      const tipo = document.getElementById('local-type-input').value.trim() || 'Restaurante / Cafetería';
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

      // Generar nombre de carpeta limpia en Documents
      const words = nombre.match(/[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g) || ['Carta'];
      const folderName = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
      const projectPath = `/Users/gabrielleholmquist/Documents/${folderName}`;
      const terminalCmd = `python3 /Users/gabrielleholmquist/Documents/KoriFilmsControl/scripts/generar_carta.py --nombre "${nombre}" --tipo "${tipo}" --ciudad "${ciudad}"`;

      const nuevoLocal = {
        id: slug,
        slug: slug,
        nombre: nombre,
        tipo: tipo,
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

      // Configurar y mostrar modal de proyecto y contexto Antigravity
      if (projectReadyModal) {
        const titleEl = document.getElementById('ready-modal-title');
        const pathEl = document.getElementById('ready-project-path');
        const cmdEl = document.getElementById('ready-project-cmd');
        const promptEl = document.getElementById('ready-project-prompt');

        if (titleEl) titleEl.textContent = `🎉 Proyecto Preparado: ${nombre}`;
        if (pathEl) pathEl.value = projectPath;
        if (cmdEl) cmdEl.value = terminalCmd;
        if (promptEl) {
          promptEl.value = buildAntigravityPrompt(nombre, tipo, ciudad, projectPath);
        }

        projectReadyModal.classList.remove('hidden');
      }

      showNotification(`Cliente ${nombre} registrado en modo local`, 'success');
    });
  }
}

function openAuditModal(localId, localName) {
  const modal = document.getElementById('audit-modal');
  const titleEl = document.getElementById('audit-modal-title');
  const subtitleEl = document.getElementById('audit-modal-subtitle');
  const timelineEl = document.getElementById('audit-modal-timeline');

  if (titleEl) titleEl.textContent = `Historial: ${localName}`;
  if (subtitleEl) subtitleEl.textContent = `Registro de ingresos y cambios para ${localName}`;

  if (timelineEl) {
    const logs = getAuditLogs(localId);
    if (!logs || logs.length === 0) {
      timelineEl.innerHTML = '<p class="text-muted" style="padding: 1.5rem 0; text-align: center;">Aún no se han registrado eventos para esta carta.</p>';
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

          let badgeClass = 'audit-badge-edit';
          let badgeText = 'Modificó';
          if (item.type === 'login') {
            badgeClass = 'audit-badge-login';
            badgeText = 'Ingreso';
          } else if (item.type === 'create') {
            badgeClass = 'audit-badge-create';
            badgeText = 'Creó';
          } else if (item.type === 'delete') {
            badgeClass = 'audit-badge-delete';
            badgeText = 'Eliminó';
          }

          return `
            <div class="audit-event-item">
              <div class="audit-event-header">
                <span class="audit-badge ${badgeClass}">${badgeText}</span>
                <span class="audit-event-time">${dateStr}</span>
              </div>
              <div class="audit-event-detail">${item.detail || item.action}</div>
              <div class="audit-event-user">👤 ${item.userEmail || 'admin_local'}</div>
            </div>
          `;
        })
        .join('');
    }
  }

  if (modal) modal.classList.remove('hidden');
}

function buildAntigravityPrompt(nombre, tipo, ciudad, rutaDestino) {
  return `Hola. Estamos iniciando el proyecto de la Carta Digital Interactiva para **${nombre}** (${tipo} en ${ciudad}).

Este proyecto fue generado a partir de la plantilla estandarizada de alta conversión de **Kori Films** (con la misma ingeniería y arquitectura de la carta de Tencha Matchería).

📍 **Ubicación del Workspace:** \`${rutaDestino}\`

### 📐 Arquitectura del Proyecto
1. **Fuente de la verdad:** Toda la carta se controla desde \`data/menu.json\` (categorías, productos, precios, disponibilidad y recomendados).
2. **Estructura limpia inicial:** El proyecto arranca en modo local con 2 categorías y 2 productos por categoría en blanco como base para ingestar la información.
3. **Formatos multimedia recomendados:**
   - Fotos: Proporción 4:5 vertical (720x900px), optimizadas en formato WebP en \`productos/<categoria>/<producto>/foto.webp\`.
   - Videos en bucle: Video vertical sin audio (H.264 / 720p) en \`productos/<categoria>/<producto>/animacion.mp4\`.
4. **Motor interactivo (\`js/main.js\`):**
   - Carrusel automático de recomendados con dots sincronizados.
   - Autoplay por franja de scroll (Viewport Band Focus: reproduce sutilmente el video al entrar en pantalla).
   - Barra sticky de navegación rápida entre categorías.
   - Popups modales táctiles para ver detalles, ingredientes y variantes.
   - Paleta de diseño basada en variables en \`css/style.css\`.
5. **Respaldo:** Cuenta con \`checkpoint/checkpoint.py\` para respaldar localmente en cualquier momento.

### 🎯 Nuestro Objetivo en este Chat:
1. Guiarme en definir los nombres reales de las categorías y productos de **${nombre}**.
2. Adaptar la paleta de colores y el estilo visual según la identidad de la marca.
3. Subir e ingestar las fotos y videos reales en sus respectivas carpetas.
4. Mantener la carta funcionando en modo local hasta que definamos el nombre del repositorio y la autorización para desplegarla en GitHub Pages / Producción.

Comencemos revisando qué categorías y productos vamos a cargar primero.`;
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

// Prevenir zoom-out y gestos de pellizco accidentales en Mac trackpad y pantallas táctiles
window.addEventListener('wheel', (e) => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

let lastTouchEndHub = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEndHub <= 300) {
    e.preventDefault();
  }
  lastTouchEndHub = now;
}, false);
