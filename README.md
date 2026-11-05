# KORI FILMS CONTROL

> Plataforma SaaS y Panel Maestro de Control de Cartas Digitales Gastronómicas para restaurantes y cafeterías.

- **Dominio**: `control.korifilms.cl`
- **Agencia**: Kori Films
- **Primer Cliente Activo**: Tencha Matchería (`tencha`)
- **Backend**: Supabase (PostgreSQL, Auth, Storage)

---

## 📌 Arquitectura y Funcionalidades

### 1. Acceso Centralizado con Protección Anti-Fuerza Bruta
- Pantalla de inicio de sesión unificada (`index.html`).
- **Seguridad anti-fuerza bruta**: Bloqueo automático de **1 minuto** al **4to intento fallido**.
- Temporizador en cuenta regresiva visible (`XXs`) con inhabilitación de campos y botón de envío.
- Persistencia temporal ante recargas de página vía `localStorage`.

### 2. Panel Maestro para Superadmin (`admin@korifilms.cl`)
- Acceso exclusivo al **Master Hub** (`hub.html`).
- Visión global de métricas en tiempo real conectadas a Supabase:
  - Locales Activos.
  - Total de Productos registrados.
  - Productos disponibles vs pausados.
  - Total de aperturas/visitas por código QR.
- **Gestor de Restaurantes**: Listado de clientes gastronómicos (Tencha Matchería y capacidad de agregar nuevos).
- **Gestor de Usuarios por Local**: Herramienta visual para autorizar correos de clientes y personal a cada carta, o revocar su acceso con un clic.
- Botón directo para ingresar a administrar la carta de cualquier restaurante.

### 3. Panel de Administración de Carta Gastronómica (`menu.html`)
- Acceso para usuarios de locales (ej. `contacto@tencha.cl`) y Superadmin.
- Restricción estricta de rol: el cliente no puede ver a otros clientes ni el gestor de usuarios.
- **Switch instantáneo de disponibilidad**: Activa o pausa productos en 1 segundo con un solo clic (esencial durante turnos de servicio cuando un plato o insumo se agota).
- **Control de Precios y Tags**: Modificación de precios en CLP y etiquetas gastronómicas (Vegano, Frío, Caliente, Sin Gluten, Sin Lactosa, Destacado).
- **Filtros rápidos**: Por categoría, estado (activos/pausados), tags y buscador de texto.
- **Editor y Creador de Productos**: Modal completo con descripción, subtítulo, nombre japonés y referencia multimedia.

---

## 📁 Estructura del Proyecto

```
/Users/gabrielleholmquist/Documents/KoriFilmsControl/
├── CNAME                     # Dominio: control.korifilms.cl
├── index.html                # Login centralizado con anti-brute force
├── hub.html                  # Master Hub para Superadmin
├── menu.html                 # Panel de administración de carta
├── css/
│   ├── styles.css            # Design tokens, variables y componentes globales
│   ├── auth.css              # Estilos de autenticación y banner de bloqueo
│   └── dashboard.css         # Estilos de Hub, KPIs, tarjetas y switches
├── js/
│   ├── config.js             # Configuración Supabase y políticas de seguridad
│   ├── supabase-client.js    # Conexión con Supabase y CRUD de productos/locales
│   ├── auth-guard.js         # Protección de rutas por roles (Superadmin vs Local)
│   ├── auth.js               # Lógica de login y temporizador de bloqueo
│   ├── hub.js                # Controlador del Master Hub
│   └── menu.js               # Controlador del editor de carta
├── supabase/
│   └── schema.sql            # Esquema SQL y configuración multi-tenant
└── README.md
```

---

## 🚀 Despliegue en Producción (`control.korifilms.cl`)

1. **DNS**:
   - Crear un registro `CNAME` en el proveedor DNS de `korifilms.cl`:
     - Host: `control`
     - Destino: Tu proveedor de hosting (ej. `cname.vercel-dns.com` o apuntando a Netlify/Cloudflare Pages).
2. **Hosting**:
   - El proyecto es una Single Page Application estática modular con Vanilla JS y Supabase, lista para ser desplegada en Vercel, Netlify o Cloudflare Pages sin pasos de compilación complejos.
