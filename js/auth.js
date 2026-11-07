// ==============================================================================
// KORI FILMS CONTROL — Control de Autenticación & Anti-Fuerza Bruta
// ==============================================================================

import { CONFIG } from './config.js';
import { getDbClient, recordAuditLog } from './data-client.js';
import { isSuperadmin, getAssignedLocalForUser } from './auth-guard.js';

let countdownInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Verificar si ya existe una sesión criptográfica activa real
  const client = getDbClient();
  if (client) {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (session && session.user && session.user.email) {
        redirectUser(session.user.email);
        return;
      } else {
        localStorage.removeItem(CONFIG.sessionStorageKey);
      }
    } catch (_) {
      localStorage.removeItem(CONFIG.sessionStorageKey);
    }
  }

  // Verificar estado de bloqueo por fuerza bruta al cargar
  checkLockoutStatus();

  // Configurar formulario
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  // Toggle de visibilidad de contraseña
  const togglePasswordBtn = document.getElementById('toggle-password-btn');
  const passwordInput = document.getElementById('password-input');
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Ver contraseña');
      const icon = togglePasswordBtn.querySelector('svg');
      if (icon) {
        icon.style.opacity = isPassword ? '1' : '0.6';
      }
    });
  }

  // Botón Volver / Cerrar (X) que devuelve a la página anterior
  const closeBtn = document.getElementById('auth-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.history.length > 1 && document.referrer) {
        window.history.back();
      } else {
        window.location.href = '../';
      }
    });
  }
});

// ------------------------------------------------------------------------------
// LÓGICA ANTI-FUERZA BRUTA (Bloqueo de 1 minuto al 4to intento)
// ------------------------------------------------------------------------------

export function getFailedAttempts() {
  const attempts = localStorage.getItem(CONFIG.security.storageKeyAttempts);
  return attempts ? parseInt(attempts, 10) : 0;
}

export function getLockoutUntil() {
  const until = localStorage.getItem(CONFIG.security.storageKeyLockoutUntil);
  return until ? parseInt(until, 10) : 0;
}

export function registerFailedAttempt() {
  const currentAttempts = getFailedAttempts() + 1;
  localStorage.setItem(CONFIG.security.storageKeyAttempts, currentAttempts.toString());

  if (currentAttempts >= CONFIG.security.maxFailedAttempts) {
    const lockoutUntil = Date.now() + CONFIG.security.lockoutDurationMs;
    localStorage.setItem(CONFIG.security.storageKeyLockoutUntil, lockoutUntil.toString());
    startLockoutTimer(lockoutUntil);
    return { locked: true, attempts: currentAttempts };
  }

  const remaining = CONFIG.security.maxFailedAttempts - currentAttempts;
  return { locked: false, attempts: currentAttempts, remaining };
}

export function resetSecurityState() {
  localStorage.removeItem(CONFIG.security.storageKeyAttempts);
  localStorage.removeItem(CONFIG.security.storageKeyLockoutUntil);
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function checkLockoutStatus() {
  const lockoutUntil = getLockoutUntil();
  if (lockoutUntil && Date.now() < lockoutUntil) {
    startLockoutTimer(lockoutUntil);
  } else if (lockoutUntil && Date.now() >= lockoutUntil) {
    resetSecurityState();
    hideLockoutAlert();
  }
}

function startLockoutTimer(lockoutUntil) {
  const alertEl = document.getElementById('lockout-alert');
  const timerEl = document.getElementById('lockout-timer');
  const submitBtn = document.getElementById('submit-btn');
  const emailInput = document.getElementById('email-input');
  const passwordInput = document.getElementById('password-input');

  if (submitBtn) submitBtn.disabled = true;
  if (emailInput) emailInput.disabled = true;
  if (passwordInput) passwordInput.disabled = true;

  if (alertEl) {
    alertEl.classList.remove('hidden');
  }

  if (countdownInterval) clearInterval(countdownInterval);

  const updateCountdown = () => {
    const now = Date.now();
    const remainingMs = lockoutUntil - now;

    if (remainingMs <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      resetSecurityState();
      hideLockoutAlert();
      if (submitBtn) submitBtn.disabled = false;
      if (emailInput) emailInput.disabled = false;
      if (passwordInput) passwordInput.disabled = false;
      showInfo('El bloqueo de seguridad ha finalizado. Puedes volver a intentar ingresar.');
      return;
    }

    const remainingSec = Math.ceil(remainingMs / 1000);
    if (timerEl) {
      timerEl.textContent = `${remainingSec}s`;
    }
  };

  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
}

function hideLockoutAlert() {
  const alertEl = document.getElementById('lockout-alert');
  if (alertEl) {
    alertEl.classList.add('hidden');
  }
}

// ------------------------------------------------------------------------------
// PROCESAMIENTO DE LOGIN (AUTENTICACIÓN ESTRICTA CON SERVIDOR)
// ------------------------------------------------------------------------------

async function handleLoginSubmit(e) {
  e.preventDefault();

  const lockoutUntil = getLockoutUntil();
  if (lockoutUntil && Date.now() < lockoutUntil) {
    return;
  }

  const emailInput = document.getElementById('email-input');
  const passwordInput = document.getElementById('password-input');
  const submitBtn = document.getElementById('submit-btn');
  const submitText = document.getElementById('submit-text');
  const submitSpinner = document.getElementById('submit-spinner');

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!email || !password) {
    showError('Por favor ingresa tu correo y contraseña.');
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  if (submitText) submitText.textContent = 'Verificando acceso...';
  if (submitSpinner) submitSpinner.classList.remove('hidden');
  clearMessages();

  try {
    const client = getDbClient();
    if (!client) {
      throw new Error('Servicio de autenticación no disponible.');
    }

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (!error && data?.user && data?.session) {
      resetSecurityState();

      const authUser = data.user;
      const session = {
        userId: authUser.id,
        email: authUser.email.toLowerCase(),
        rol: isSuperadmin(authUser.email) ? 'superadmin' : 'admin_local',
        nombre: isSuperadmin(authUser.email) ? 'Kori Films Admin' : authUser.email.split('@')[0],
        createdAt: Date.now(),
        expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      };

      localStorage.setItem(CONFIG.sessionStorageKey, JSON.stringify(session));
      localStorage.setItem('kfc_admin_last_activity', Date.now().toString());

      if (!isSuperadmin(authUser.email)) {
        const local = getAssignedLocalForUser(authUser.email);
        recordAuditLog({
          localId: local ? local.id : 'tencha',
          userEmail: authUser.email,
          userRole: 'admin_local',
          type: 'login',
          action: 'Ingreso al panel',
          detail: 'El administrador ingresó a la configuración de la carta',
        });
      }

      if (submitText) submitText.textContent = '¡Acceso concedido!';
      showSuccess('Acceso exitoso. Redirigiendo a la plataforma...');

      setTimeout(() => {
        redirectUser(authUser.email);
      }, 600);
      return;
    }

    // Credenciales inválidas: registrar intento fallido
    const failResult = registerFailedAttempt();

    if (failResult.locked) {
      showError('Demasiados intentos fallidos. Sistema bloqueado por 1 minuto.');
    } else {
      showError(
        `Credenciales incorrectas. Te quedan ${failResult.remaining} ${
          failResult.remaining === 1 ? 'intento' : 'intentos'
        } antes del bloqueo temporal.`
      );
    }
  } catch (err) {
    showError('Ocurrió un error al verificar tus credenciales.');
  } finally {
    const isLocked = getLockoutUntil() && Date.now() < getLockoutUntil();
    if (!isLocked && submitBtn) {
      submitBtn.disabled = false;
      if (submitText) submitText.textContent = 'Ingresar al Panel';
      if (submitSpinner) submitSpinner.classList.add('hidden');
    }
  }
}

// ------------------------------------------------------------------------------
// REDIRECCIÓN SEGÚN ROL
// ------------------------------------------------------------------------------

export function redirectUser(email) {
  if (isSuperadmin(email)) {
    window.location.href = 'hub.html';
  } else {
    const local = getAssignedLocalForUser(email);
    window.location.href = `menu.html?local=${local.id}`;
  }
}

function showError(msg) {
  const msgEl = document.getElementById('login-message');
  if (msgEl) {
    msgEl.textContent = msg;
    msgEl.className = 'auth-message error-message';
    msgEl.classList.remove('hidden');
  }
}

function showSuccess(msg) {
  const msgEl = document.getElementById('login-message');
  if (msgEl) {
    msgEl.textContent = msg;
    msgEl.className = 'auth-message success-message';
    msgEl.classList.remove('hidden');
  }
}

function showInfo(msg) {
  const msgEl = document.getElementById('login-message');
  if (msgEl) {
    msgEl.textContent = msg;
    msgEl.className = 'auth-message info-message';
    msgEl.classList.remove('hidden');
  }
}

function clearMessages() {
  const msgEl = document.getElementById('login-message');
  if (msgEl) {
    msgEl.textContent = '';
    msgEl.classList.add('hidden');
  }
}
