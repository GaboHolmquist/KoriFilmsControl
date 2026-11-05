// ==============================================================================
// KORI FILMS CONTROL — Configuración Central
// Dominio: control.korifilms.cl
// ==============================================================================

export const CONFIG = {
  // Configuración de Supabase
  supabase: {
    url: 'https://bkubdcfhgivgmckblsyt.supabase.co',
    anonKey: 'sb_publishable_5SF5J8y_r1KWJTU1aT_43w_VEKhdiqS',
  },

  // Superadministrador maestro
  superadminEmail: 'admin@korifilms.cl',

  // Configuración de Seguridad Anti-Fuerza Bruta
  security: {
    maxFailedAttempts: 4,     // Bloqueo al 4to intento fallido
    lockoutDurationMs: 60000, // 1 minuto (60 segundos)
    storageKeyAttempts: 'kfc_failed_login_attempts',
    storageKeyLockoutUntil: 'kfc_lockout_until',
  },

  // Clave de almacenamiento de sesión activa
  sessionStorageKey: 'kfc_active_session',
  
  // Clave de almacenamiento para gestión de locales multi-tenant
  localesStorageKey: 'kfc_registered_locales',
  usuariosLocalesStorageKey: 'kfc_usuarios_locales',

  // Local por defecto / Primer cliente
  defaultLocal: {
    id: 'tencha',
    slug: 'tencha',
    nombre: 'Tencha Matchería',
    dominio: 'tenchamatcheria.com',
    urlCarta: 'https://tenchamatcheria.com/',
    tipo: 'Cafetería & Matcha Bar',
    ciudad: 'Santiago, Chile',
    activo: true,
    tablas: {
      productos: 'productos',
      categorias: 'categorias',
      visitas: 'visitas',
      recomendados: 'recomendados',
    },
    usuariosIniciales: [
      {
        email: 'admin@korifilms.cl',
        rol: 'superadmin',
        nombre: 'Superadmin Kori Films',
      },
      {
        email: 'contacto@tencha.cl',
        rol: 'admin_local',
        nombre: 'Administrador Tencha',
      },
    ],
  },
};
