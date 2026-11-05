// ==============================================================================
// KORI FILMS CONTROL — Supabase Data Client
// ==============================================================================

import { CONFIG } from './config.js';

// Inicializar cliente Supabase desde la ventana global (cargado vía CDN)
let supabaseInstance = null;

export function getSupabase() {
  if (!supabaseInstance) {
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      console.error('El script de Supabase no ha sido cargado en el documento.');
      return null;
    }
    supabaseInstance = window.supabase.createClient(
      CONFIG.db.endpoint,
      CONFIG.db.token
    );
  }
  return supabaseInstance;
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

  // Si no hay usuarios guardados para el local por defecto, inicializar con los predeterminados
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

  // Evitar duplicados por email
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

  // No permitir eliminar al superadmin
  if (email.toLowerCase() === CONFIG.superadminEmail.toLowerCase()) {
    throw new Error('No es posible remover al Superadmin maestro.');
  }

  map[localId] = map[localId].filter((u) => u.email.toLowerCase() !== email.toLowerCase());
  localStorage.setItem(CONFIG.usuariosLocalesStorageKey, JSON.stringify(map));
  return map[localId];
}

// ------------------------------------------------------------------------------
// OPERACIONES CON SUPABASE: PRODUCTOS, CATEGORÍAS Y MÉTRICAS
// ------------------------------------------------------------------------------

export async function fetchCategorias(localId = 'tencha') {
  const client = getSupabase();
  if (!client) throw new Error('Cliente Supabase no inicializado');

  const { data, error } = await client
    .from('categorias')
    .select('*')
    .order('orden', { ascending: true });

  if (error) {
    console.error('Error al cargar categorías de Supabase:', error);
    throw error;
  }
  return data || [];
}

export async function fetchProductos(localId = 'tencha') {
  const client = getSupabase();
  if (!client) throw new Error('Cliente Supabase no inicializado');

  const { data, error } = await client
    .from('productos')
    .select('*')
    .order('orden', { ascending: true });

  if (error) {
    console.error('Error al cargar productos de Supabase:', error);
    throw error;
  }
  return data || [];
}

export async function updateProductoDisponibilidad(id, disponible) {
  const client = getSupabase();
  if (!client) throw new Error('Cliente Supabase no inicializado');

  const { data, error } = await client
    .from('productos')
    .update({ disponible })
    .eq('id', id)
    .select();

  if (error) {
    console.error(`Error actualizando disponibilidad de producto ${id}:`, error);
    throw error;
  }
  return data;
}

export async function updateProductoPrecio(id, precio) {
  const client = getSupabase();
  if (!client) throw new Error('Cliente Supabase no inicializado');

  const numPrecio = Number(precio);
  if (isNaN(numPrecio) || numPrecio < 0) {
    throw new Error('El precio debe ser un número positivo');
  }

  const { data, error } = await client
    .from('productos')
    .update({ precio: numPrecio })
    .eq('id', id)
    .select();

  if (error) {
    console.error(`Error actualizando precio de producto ${id}:`, error);
    throw error;
  }
  return data;
}

export async function updateProductoDetalle(id, campos) {
  const client = getSupabase();
  if (!client) throw new Error('Cliente Supabase no inicializado');

  const { data, error } = await client
    .from('productos')
    .update(campos)
    .eq('id', id)
    .select();

  if (error) {
    console.error(`Error actualizando detalles de producto ${id}:`, error);
    throw error;
  }
  return data;
}

export async function createProducto(nuevoProducto) {
  const client = getSupabase();
  if (!client) throw new Error('Cliente Supabase no inicializado');

  const { data, error } = await client
    .from('productos')
    .insert([nuevoProducto])
    .select();

  if (error) {
    console.error('Error al crear producto en Supabase:', error);
    throw error;
  }
  return data;
}

export async function deleteProducto(id) {
  const client = getSupabase();
  if (!client) throw new Error('Cliente Supabase no inicializado');

  const { data, error } = await client
    .from('productos')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(`Error al eliminar producto ${id}:`, error);
    throw error;
  }
  return data;
}

export async function fetchVisitasCount(localId = 'tencha') {
  const client = getSupabase();
  if (!client) return 0;

  try {
    const { count, error } = await client
      .from('visitas')
      .select('id', { count: 'exact', head: true });

    if (error) {
      console.warn('No se pudo obtener el conteo de visitas:', error);
      return 0;
    }
    return count || 0;
  } catch (err) {
    console.warn('Error fetching visitas:', err);
    return 0;
  }
}
