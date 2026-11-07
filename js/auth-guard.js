// ==============================================================================
// KORI FILMS CONTROL — Auth Guard & Role-Based Routing
// ==============================================================================

import { CONFIG } from './config.js';
import { getDbClient, getUsuariosByLocal, getLocales } from './data-client.js';

export function getCurrentSession() {
  const sessionData = localStorage.getItem(CONFIG.sessionStorageKey);
  if (!sessionData) return null;
  try {
    const session = JSON.parse(sessionData);
    if (session.expiresAt && Date.now() > session.expiresAt) {
      logout();
      return null;
    }
    return session;
  } catch (e) {
    return null;
  }
}

export function isSuperadmin(email) {
  if (!email) return false;
  return email.trim().toLowerCase() === CONFIG.superadminEmail.toLowerCase();
}

export function getAssignedLocalForUser(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const locales = getLocales();

  for (const local of locales) {
    const usuarios = getUsuariosByLocal(local.id);
    const match = usuarios.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (match) {
      return local;
    }
  }
  return CONFIG.defaultLocal;
}

/**
 * Protege la página actual exigiendo sesión criptográfica válida y rol requerido
 */
export async function requireAuth({ requireSuperadmin = false } = {}) {
  const client = getDbClient();
  let verifiedEmail = null;
  let verifiedId = null;

  if (client) {
    try {
      const { data: { session: serverSession } } = await client.auth.getSession();
      if (serverSession && serverSession.user && serverSession.user.email) {
        verifiedEmail = serverSession.user.email.toLowerCase();
        verifiedId = serverSession.user.id;
      }
    } catch (_) {}
  }

  // Si no hay sesión real verificada por token JWT, cerrar y redirigir al login
  if (!verifiedEmail) {
    localStorage.removeItem(CONFIG.sessionStorageKey);
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`index.html?returnUrl=${returnUrl}`);
    return null;
  }

  const session = {
    userId: verifiedId,
    email: verifiedEmail,
    rol: isSuperadmin(verifiedEmail) ? 'superadmin' : 'admin_local',
  };

  const superadmin = isSuperadmin(session.email);

  if (requireSuperadmin && !superadmin) {
    const assignedLocal = getAssignedLocalForUser(session.email);
    window.location.replace(`menu.html?local=${assignedLocal.id}`);
    return null;
  }

  updateNavbarUserInfo(session, superadmin);
  return session;
}

export async function logout() {
  localStorage.removeItem(CONFIG.sessionStorageKey);
  localStorage.removeItem('kfc_admin_last_activity');
  const client = getDbClient();
  if (client) {
    try { await client.auth.signOut(); } catch (_) {}
  }
  window.location.replace('index.html');
}

function updateNavbarUserInfo(session, superadmin) {
  const userEmailEl = document.getElementById('navbar-user-email');
  const userRoleBadgeEl = document.getElementById('navbar-user-badge');
  const logoutBtn = document.getElementById('navbar-logout-btn');

  if (userEmailEl) {
    userEmailEl.textContent = session.email;
  }

  if (userRoleBadgeEl) {
    if (superadmin) {
      userRoleBadgeEl.textContent = 'SUPERADMIN';
      userRoleBadgeEl.className = 'badge badge-superadmin';
    } else {
      userRoleBadgeEl.textContent = 'LOCAL ADMIN';
      userRoleBadgeEl.className = 'badge badge-client';
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }
}
