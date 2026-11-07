// ==============================================================================
// KORI FILMS CONTROL — Configuración Central
// ==============================================================================

export const CONFIG = {
  // Credenciales del motor de datos
  db: {
    endpoint: atob('aHR0cHM6Ly9ia3ViZGNmaGdpdmdtY2tibHN5dC5zdXBhYmFzZS5jbw=='),
    token: atob('c2JfcHVibGlzaGFibGVfNVNGNUo4eV9yMUtXSlRVMWFUXzQzd19WRUtoZGlxUw=='),
  },

  // Superadministrador maestro (ofuscado)
  superadminEmail: atob('YWRtaW5Aa29yaWZpbG1zLmNs'),

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
        email: atob('YWRtaW5Aa29yaWZpbG1zLmNs'),
        rol: 'superadmin',
        nombre: 'Superadmin Kori Films',
      },
      {
        email: atob('Y29udGFjdG9AdGVuY2hhLmNs'),
        rol: 'admin_local',
        nombre: 'Administrador Tencha',
      },
    ],
  },
};
