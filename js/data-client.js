// ==============================================================================
// KORI FILMS CONTROL — Data Client
// ==============================================================================

import { CONFIG } from './config.js';

let dbInstance = null;

export function getDbClient() {
  if (!dbInstance) {
    const sdk = window[atob('c3VwYWJhc2U=')] || window._dbSdk;
    if (!sdk || !sdk.createClient) {
      console.error('El SDK de datos no ha sido cargado en el documento.');
      return null;
    }
    dbInstance = sdk.createClient(
      CONFIG.db.endpoint,
      CONFIG.db.token
    );
  }
  return dbInstance;
}

// ------------------------------------------------------------------------------
// GESTIÓN DE LOCALES Y MULTI-TENANCY
// ------------------------------------------------------------------------------

export function getLocales() {
  const stored = localStorage.getItem(CONFIG.localesStorageKey);
  if (!stored) {
    const initial = [CONFIG.defaultLocal];
    localStorage.setItem(CONFIG.localesStorageKey, JSON.stringify(initial));
    return initial;
  }
  try {
    return JSON.parse(stored);
  } catch (e) {
    return [CONFIG.defaultLocal];
  }
}

export function saveLocal(localData) {
  const locales = getLocales();
  const index = locales.findIndex((l) => l.id === localData.id);
  if (index >= 0) {
    locales[index] = { ...locales[index], ...localData };
  } else {
    locales.push(localData);
  }
  localStorage.setItem(CONFIG.localesStorageKey, JSON.stringify(locales));
  return locales;
}

export function getLocalById(localId) {
  const locales = getLocales();
  return locales.find((l) => l.id === localId) || CONFIG.defaultLocal;
}

// ------------------------------------------------------------------------------
// GESTIÓN DE USUARIOS ASIGNADOS A CADA LOCAL
// ------------------------------------------------------------------------------

export function getUsuariosByLocal(localId) {
  const stored = localStorage.getItem(CONFIG.usuariosLocalesStorageKey);
  let map = {};
  if (stored) {
    try {
      map = JSON.parse(stored);
    } catch (e) {
      map = {};
    }
  }

  if (!map[localId]) {
    if (localId === CONFIG.defaultLocal.id) {
      map[localId] = [...CONFIG.defaultLocal.usuariosIniciales];
      localStorage.setItem(CONFIG.usuariosLocalesStorageKey, JSON.stringify(map));
    } else {
      map[localId] = [
        {
          email: CONFIG.superadminEmail,
          rol: 'superadmin',
          nombre: 'Superadmin Kori Films',
          fecha: new Date().toISOString(),
        },
      ];
    }
  }

  return map[localId];
}

export function addUsuarioToLocal(localId, { email, rol, nombre }) {
  const stored = localStorage.getItem(CONFIG.usuariosLocalesStorageKey);
  let map = {};
  if (stored) {
    try {
      map = JSON.parse(stored);
    } catch (e) {
      map = {};
    }
  }

  if (!map[localId]) {
    map[localId] = [];
  }

  const existingIndex = map[localId].findIndex((u) => u.email.toLowerCase() === email.toLowerCase());
  const userObj = {
    email: email.trim().toLowerCase(),
    rol: rol || 'admin_local',
    nombre: nombre ? nombre.trim() : email.split('@')[0],
    fecha: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    map[localId][existingIndex] = userObj;
  } else {
    map[localId].push(userObj);
  }

  localStorage.setItem(CONFIG.usuariosLocalesStorageKey, JSON.stringify(map));
  return map[localId];
}

export function removeUsuarioFromLocal(localId, email) {
  const stored = localStorage.getItem(CONFIG.usuariosLocalesStorageKey);
  if (!stored) return [];
  let map = {};
  try {
    map = JSON.parse(stored);
  } catch (e) {
    return [];
  }

  if (!map[localId]) return [];

  if (email.toLowerCase() === CONFIG.superadminEmail.toLowerCase()) {
    throw new Error('No es posible remover al Superadmin maestro.');
  }

  map[localId] = map[localId].filter((u) => u.email.toLowerCase() !== email.toLowerCase());
  localStorage.setItem(CONFIG.usuariosLocalesStorageKey, JSON.stringify(map));
  return map[localId];
}

// ------------------------------------------------------------------------------
// OPERACIONES DE DATOS: PRODUCTOS, CATEGORÍAS Y MÉTRICAS
// ------------------------------------------------------------------------------

export async function fetchCategorias(localId = 'tencha') {
  const client = getDbClient();
  if (!client) throw new Error('Cliente de datos no inicializado');

  const { data, error } = await client
    .from('categorias')
    .select('*')
    .order('orden', { ascending: true });

  if (error) {
    console.error('Error al cargar categorías:', error);
    throw error;
  }
  return data || [];
}

export async function fetchProductos(localId = 'tencha') {
  const client = getDbClient();
  if (!client) throw new Error('Cliente de datos no inicializado');

  const { data, error } = await client
    .from('productos')
    .select('*')
    .order('orden', { ascending: true });

  if (error) {
    console.error('Error al cargar productos:', error);
    throw error;
  }
  return data || [];
}

export async function fetchVisitasCount(localId = 'tencha') {
  const client = getDbClient();
  if (!client) return 0;

  try {
    const { count, error } = await client
      .from('visitas')
      .select('id', { count: 'exact', head: true });

    if (error) {
      return 0;
    }
    return count || 0;
  } catch (err) {
    return 0;
  }
}

// ------------------------------------------------------------------------------
// AUDITORÍA Y CONTROL DE ACCESOS Y CAMBIOS (SUPERADMIN)
// ------------------------------------------------------------------------------

export const AUDIT_STORAGE_KEY = 'kfc_audit_log';

export function getAuditLogs(localId = null) {
  const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
  let logs = [];
  if (stored) {
    try {
      logs = JSON.parse(stored);
    } catch (_) {
      logs = [];
    }
  } else {
    // Inicialización de historial base para Tencha
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

  if (localId) {
    return logs.filter((l) => l.localId === localId);
  }
  return logs;
}

export function recordAuditLog({ localId, userEmail, userRole, type, action, detail }) {
  const logs = getAuditLogs();
  const entry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    localId: localId || 'tencha',
    userEmail: (userEmail || 'admin_local').toLowerCase(),
    userRole: userRole || 'admin_local',
    type: type || 'edit', // 'login' | 'create' | 'edit' | 'delete'
    action: action || 'Modificación en carta',
    detail: detail || '',
    timestamp: Date.now(),
  };
  logs.unshift(entry);
  if (logs.length > 250) logs.pop();
  localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
  return entry;
}

export function getAdminLoginsCount30Days(localId) {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const logs = getAuditLogs(localId);
  const superEmail = atob('YWRtaW5Aa29yaWZpbG1zLmNs').toLowerCase();
  return logs.filter(
    (l) =>
      l.type === 'login' &&
      l.timestamp >= thirtyDaysAgo &&
      l.userEmail !== superEmail &&
      l.userRole !== 'superadmin'
  ).length;
}

export function getAdminChangesCount(localId) {
  const logs = getAuditLogs(localId);
  return logs.filter((l) => l.type !== 'login').length;
}
