// ==============================================================================
// KORI FILMS CONTROL — Auth Guard & Role-Based Routing
// ==============================================================================

import { CONFIG } from './config.js';
import { getUsuariosByLocal, getLocales } from './supabase-client.js';

export function getCurrentSession() {
  const sessionData = localStorage.getItem(CONFIG.sessionStorageKey);
  if (!sessionData) return null;
  try {
    const session = JSON.parse(sessionData);
    // Verificar si expiró la sesión (por ejemplo 12 horas)
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

/**
 * Determina a qué local tiene acceso un usuario no-superadmin
 */
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
  // Si no está registrado en ningún otro, por defecto asignado a Tencha
  return CONFIG.defaultLocal;
}

/**
 * Protege la página actual según el rol del usuario
 */
export function requireAuth({ requireSuperadmin = false } = {}) {
  const session = getCurrentSession();

  if (!session) {
    // Redirigir al login si no hay sesión
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `index.html?returnUrl=${returnUrl}`;
    return null;
  }

  const superadmin = isSuperadmin(session.email);

  // Si la página requiere superadmin (como hub.html) y el usuario no lo es:
  if (requireSuperadmin && !superadmin) {
    console.warn('Acceso denegado: Usuario sin permisos de Superadmin. Redirigiendo a su local.');
    const assignedLocal = getAssignedLocalForUser(session.email);
    window.location.href = `menu.html?local=${assignedLocal.id}`;
    return null;
  }

  // Renderizar información de usuario en la barra si los elementos existen
  updateNavbarUserInfo(session, superadmin);

  return session;
}

export function logout() {
  localStorage.removeItem(CONFIG.sessionStorageKey);
  window.location.href = 'index.html';
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
