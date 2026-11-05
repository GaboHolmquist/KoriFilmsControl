// ==============================================================================
// KORI FILMS CONTROL — Menu Administration Controller (Restaurante)
// ==============================================================================

import { requireAuth, isSuperadmin, getAssignedLocalForUser } from './auth-guard.js';
import {
  getLocalById,
  fetchCategorias,
  fetchProductos,
  updateProductoDisponibilidad,
  updateProductoPrecio,
  updateProductoDetalle,
  createProducto,
  deleteProducto,
} from './supabase-client.js';

let currentLocal = null;
let allProductos = [];
let allCategorias = [];
let selectedCategoryId = 'all';
let selectedStatusFilter = 'all'; // all, available, paused
let selectedTagFilter = 'all';
let searchQuery = '';
let editingProductId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const session = requireAuth();
  if (!session) return;

  // Determinar el local activo desde la URL o la asignación del usuario
  const urlParams = new URLSearchParams(window.location.search);
  const localParam = urlParams.get('local');
  const superadmin = isSuperadmin(session.email);

  if (superadmin) {
    currentLocal = getLocalById(localParam || 'tencha');
  } else {
    // Si no es superadmin, forzar el local asignado
    const assigned = getAssignedLocalForUser(session.email);
    currentLocal = assigned;
  }

  // Configurar interfaz de cabecera según rol
  setupHeaderUI(session, superadmin);

  // Cargar datos del menú
  await loadMenuData();

  // Configurar listeners de filtros y modales
  setupFiltersAndListeners();
});

function setupHeaderUI(session, superadmin) {
  const localNameEl = document.getElementById('menu-local-name');
  const backToHubBtn = document.getElementById('back-to-hub-btn');

  if (localNameEl && currentLocal) {
    localNameEl.textContent = currentLocal.nombre;
  }

  // Solo el superadmin puede ver el botón para regresar al Master Hub
  if (backToHubBtn) {
    if (superadmin) {
      backToHubBtn.classList.remove('hidden');
    } else {
      backToHubBtn.classList.add('hidden');
    }
  }
}

async function loadMenuData() {
  const loadingEl = document.getElementById('menu-loading');
  const contentEl = document.getElementById('menu-content');

  try {
    const [categorias, productos] = await Promise.all([
      fetchCategorias(currentLocal.id),
      fetchProductos(currentLocal.id),
    ]);

    allCategorias = categorias;
    allProductos = productos;

    renderCategoryTabs();
    populateCategorySelects();
    updateMenuSummaryStats();
    applyFiltersAndRender();
  } catch (error) {
    console.error('Error cargando carta gastronómica:', error);
    showToast('Error cargando datos de Supabase', 'error');
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
  }
}

function updateMenuSummaryStats() {
  const total = allProductos.length;
  const disponibles = allProductos.filter((p) => p.disponible !== false).length;
  const pausados = total - disponibles;

  const totalEl = document.getElementById('stat-total-products');
  const dispEl = document.getElementById('stat-active-products');
  const pauseEl = document.getElementById('stat-paused-products');
  const catEl = document.getElementById('stat-total-categories');

  if (totalEl) totalEl.textContent = total;
  if (dispEl) dispEl.textContent = disponibles;
  if (pauseEl) pauseEl.textContent = pausados;
  if (catEl) catEl.textContent = allCategorias.length;
}

function renderCategoryTabs() {
  const container = document.getElementById('category-pills-container');
  if (!container) return;

  container.innerHTML = `
    <button class="cat-pill ${selectedCategoryId === 'all' ? 'active' : ''}" data-cat-id="all">
      Todos (${allProductos.length})
    </button>
  `;

  allCategorias.forEach((cat) => {
    const count = allProductos.filter((p) => p.categoria_id === cat.id).length;
    const btn = document.createElement('button');
    btn.className = `cat-pill ${selectedCategoryId === cat.id ? 'active' : ''}`;
    btn.setAttribute('data-cat-id', cat.id);
    btn.innerHTML = `${cat.nombre} <span class="pill-count">${count}</span>`;
    container.appendChild(btn);
  });

  container.querySelectorAll('.cat-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.cat-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCategoryId = btn.getAttribute('data-cat-id');
      applyFiltersAndRender();
    });
  });
}

function populateCategorySelects() {
  const select = document.getElementById('prod-categoria-select');
  if (!select) return;

  select.innerHTML = '';
  allCategorias.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.nombre} (${c.jp || ''})`;
    select.appendChild(opt);
  });
}

function applyFiltersAndRender() {
  let filtered = [...allProductos];

  // Filtro por categoría
  if (selectedCategoryId !== 'all') {
    filtered = filtered.filter((p) => p.categoria_id === selectedCategoryId);
  }

  // Filtro por disponibilidad
  if (selectedStatusFilter === 'available') {
    filtered = filtered.filter((p) => p.disponible !== false);
  } else if (selectedStatusFilter === 'paused') {
    filtered = filtered.filter((p) => p.disponible === false);
  }

  // Filtro por tags
  if (selectedTagFilter !== 'all') {
    filtered = filtered.filter((p) => Array.isArray(p.tags) && p.tags.includes(selectedTagFilter));
  }

  // Búsqueda de texto
  if (searchQuery.trim() !== '') {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(
      (p) =>
        (p.nombre && p.nombre.toLowerCase().includes(q)) ||
        (p.jp && p.jp.toLowerCase().includes(q)) ||
        (p.sub && p.sub.toLowerCase().includes(q)) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(q))
    );
  }

  renderProductsGrid(filtered);
}

function renderProductsGrid(products) {
  const container = document.getElementById('products-grid');
  const emptyState = document.getElementById('products-empty-state');
  if (!container) return;

  container.innerHTML = '';

  if (products.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  products.forEach((prod) => {
    const isAvailable = prod.disponible !== false;
    const cat = allCategorias.find((c) => c.id === prod.categoria_id);
    const catName = cat ? cat.nombre : prod.categoria_id || '';
    const tags = Array.isArray(prod.tags) ? prod.tags : [];

    const card = document.createElement('div');
    card.className = `product-card ${!isAvailable ? 'product-card-paused' : ''}`;
    card.setAttribute('data-product-id', prod.id);

    // Formatear precio en CLP
    const precioFormatted = new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(prod.precio || 0);

    card.innerHTML = `
      <div class="product-card-top">
        <div class="product-badge-row">
          <span class="badge badge-category">${catName}</span>
          ${prod.jp ? `<span class="badge badge-jp">${prod.jp}</span>` : ''}
          <div class="availability-status ${isAvailable ? 'status-live' : 'status-paused'}">
            ${isAvailable ? '● En Carta' : '○ Pausado'}
          </div>
        </div>

        <h4 class="product-title">${prod.nombre}</h4>
        ${prod.sub ? `<p class="product-subtitle">${prod.sub}</p>` : ''}
        ${prod.descripcion ? `<p class="product-desc">${prod.descripcion}</p>` : ''}
      </div>

      <div class="product-tags-row">
        ${tags
          .map((t) => {
            const tagClass = getTagBadgeClass(t);
            return `<span class="tag-chip ${tagClass}">${formatTagLabel(t)}</span>`;
          })
          .join('')}
      </div>

      <div class="product-card-footer">
        <div class="product-price-section">
          <span class="price-label">Precio</span>
          <span class="price-val">${precioFormatted}</span>
        </div>

        <div class="product-toggle-section">
          <label class="switch" title="${isAvailable ? 'Clic para pausar (agotado)' : 'Clic para activar en carta'}">
            <input type="checkbox" class="toggle-availability-input" data-id="${prod.id}" ${
      isAvailable ? 'checked' : ''
    }>
            <span class="slider round"></span>
          </label>
          <span class="switch-label">${isAvailable ? 'Activo' : 'Pausado'}</span>
        </div>
      </div>

      <div class="product-actions-bar">
        <button class="btn btn-sm btn-outline btn-edit-product" data-id="${prod.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          Editar
        </button>
        <button class="btn btn-sm btn-outline-danger btn-delete-product" data-id="${prod.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  // Listener para el switch de disponibilidad instantáneo
  container.querySelectorAll('.toggle-availability-input').forEach((checkbox) => {
    checkbox.addEventListener('change', async (e) => {
      const prodId = parseInt(checkbox.getAttribute('data-id'), 10);
      const isChecked = checkbox.checked;
      const targetCard = checkbox.closest('.product-card');

      try {
        await updateProductoDisponibilidad(prodId, isChecked);

        // Actualizar en el array local
        const prod = allProductos.find((p) => p.id === prodId);
        if (prod) prod.disponible = isChecked;

        // Feedback visual inmediato
        if (isChecked) {
          targetCard.classList.remove('product-card-paused');
          showToast(`"${prod ? prod.nombre : 'Producto'}" activado en la carta`, 'success');
        } else {
          targetCard.classList.add('product-card-paused');
          showToast(`"${prod ? prod.nombre : 'Producto'}" pausado (agotado temporalmente)`, 'warning');
        }

        updateMenuSummaryStats();
        applyFiltersAndRender();
      } catch (err) {
        // Revertir checkbox si falló
        checkbox.checked = !isChecked;
        showToast('Error al actualizar disponibilidad en Supabase', 'error');
      }
    });
  });

  // Listener para editar producto
  container.querySelectorAll('.btn-edit-product').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prodId = parseInt(btn.getAttribute('data-id'), 10);
      openEditProductModal(prodId);
    });
  });

  // Listener para eliminar producto
  container.querySelectorAll('.btn-delete-product').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const prodId = parseInt(btn.getAttribute('data-id'), 10);
      const prod = allProductos.find((p) => p.id === prodId);
      if (confirm(`¿Estás seguro de eliminar el producto "${prod ? prod.nombre : prodId}" de la carta?`)) {
        try {
          await deleteProducto(prodId);
          allProductos = allProductos.filter((p) => p.id !== prodId);
          updateMenuSummaryStats();
          applyFiltersAndRender();
          showToast('Producto eliminado exitosamente', 'success');
        } catch (err) {
          showToast('Error al eliminar producto', 'error');
        }
      }
    });
  });
}

function getTagBadgeClass(tag) {
  const t = tag.toLowerCase();
  if (t === 'vegano' || t === 'vegan') return 'tag-vegan';
  if (t === 'sin-gluten' || t === 'celiaco') return 'tag-celiac';
  if (t === 'frio' || t === 'cold') return 'tag-cold';
  if (t === 'caliente' || t === 'hot') return 'tag-hot';
  if (t === 'destacado' || t === 'popular') return 'tag-featured';
  return 'tag-default';
}

function formatTagLabel(tag) {
  const t = tag.toLowerCase();
  if (t === 'vegano') return '🌱 Vegano';
  if (t === 'frio') return '❄️ Frío';
  if (t === 'caliente') return '🔥 Caliente';
  if (t === 'sin-gluten') return '🌾 Sin Gluten';
  if (t === 'sin-lactosa') return '🥛 Sin Lactosa';
  if (t === 'destacado') return '⭐ Destacado';
  return tag;
}

// ------------------------------------------------------------------------------
// MODAL DE CREACIÓN / EDICIÓN DE PRODUCTO
// ------------------------------------------------------------------------------

function openEditProductModal(productId = null) {
  editingProductId = productId;
  const modal = document.getElementById('product-modal');
  const titleEl = document.getElementById('product-modal-title');
  const form = document.getElementById('product-form');

  form.reset();

  // Reset checkboxes de tags
  document.querySelectorAll('.tag-checkbox').forEach((cb) => (cb.checked = false));

  if (productId) {
    const prod = allProductos.find((p) => p.id === productId);
    if (!prod) return;

    if (titleEl) titleEl.textContent = `Editar: ${prod.nombre}`;

    document.getElementById('prod-nombre').value = prod.nombre || '';
    document.getElementById('prod-jp').value = prod.jp || '';
    document.getElementById('prod-sub').value = prod.sub || '';
    document.getElementById('prod-precio').value = prod.precio || 0;
    document.getElementById('prod-categoria-select').value = prod.categoria_id || (allCategorias[0]?.id || '');
    document.getElementById('prod-temperatura').value = prod.temperatura || 'ambos';
    document.getElementById('prod-carpeta').value = prod.carpeta || '';
    document.getElementById('prod-descripcion').value = prod.descripcion || '';
    document.getElementById('prod-disponible-cb').checked = prod.disponible !== false;

    // Marcar tags existentes
    if (Array.isArray(prod.tags)) {
      prod.tags.forEach((t) => {
        const cb = document.querySelector(`.tag-checkbox[value="${t}"]`);
        if (cb) cb.checked = true;
      });
    }
  } else {
    if (titleEl) titleEl.textContent = 'Nuevo Producto para la Carta';
    document.getElementById('prod-disponible-cb').checked = true;
  }

  if (modal) modal.classList.remove('hidden');
}

function setupFiltersAndListeners() {
  // Buscador de texto
  const searchInput = document.getElementById('search-products-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      applyFiltersAndRender();
    });
  }

  // Filtro de estado
  const statusSelect = document.getElementById('filter-status-select');
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      selectedStatusFilter = e.target.value;
      applyFiltersAndRender();
    });
  }

  // Filtro de tags
  const tagSelect = document.getElementById('filter-tag-select');
  if (tagSelect) {
    tagSelect.addEventListener('change', (e) => {
      selectedTagFilter = e.target.value;
      applyFiltersAndRender();
    });
  }

  // Botón Nuevo Producto
  const btnNew = document.getElementById('btn-new-product');
  if (btnNew) {
    btnNew.addEventListener('click', () => {
      openEditProductModal(null);
    });
  }

  // Cerrar modal
  const closeBtn = document.getElementById('close-product-modal-btn');
  const modal = document.getElementById('product-modal');
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  // Guardar producto
  const form = document.getElementById('product-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('save-product-btn');
      if (saveBtn) saveBtn.disabled = true;

      try {
        const nombre = document.getElementById('prod-nombre').value.trim();
        const jp = document.getElementById('prod-jp').value.trim();
        const sub = document.getElementById('prod-sub').value.trim();
        const precio = parseInt(document.getElementById('prod-precio').value, 10) || 0;
        const categoria_id = document.getElementById('prod-categoria-select').value;
        const temperatura = document.getElementById('prod-temperatura').value;
        const carpeta = document.getElementById('prod-carpeta').value.trim();
        const descripcion = document.getElementById('prod-descripcion').value.trim();
        const disponible = document.getElementById('prod-disponible-cb').checked;

        // Recoger tags seleccionados
        const tags = [];
        document.querySelectorAll('.tag-checkbox:checked').forEach((cb) => {
          tags.push(cb.value);
        });

        const payload = {
          nombre,
          jp,
          sub,
          precio,
          categoria_id,
          temperatura,
          carpeta,
          descripcion,
          disponible,
          tags,
        };

        if (editingProductId) {
          await updateProductoDetalle(editingProductId, payload);
          const index = allProductos.findIndex((p) => p.id === editingProductId);
          if (index >= 0) {
            allProductos[index] = { ...allProductos[index], ...payload };
          }
          showToast(`"${nombre}" actualizado con éxito`, 'success');
        } else {
          // Asignar orden al final
          payload.orden = allProductos.length + 1;
          const [inserted] = await createProducto(payload);
          if (inserted) {
            allProductos.push(inserted);
          } else {
            allProductos.push({ id: Date.now(), ...payload });
          }
          showToast(`"${nombre}" agregado a la carta`, 'success');
        }

        modal.classList.add('hidden');
        updateMenuSummaryStats();
        applyFiltersAndRender();
      } catch (err) {
        console.error('Error guardando producto:', err);
        showToast('Error al guardar en Supabase: ' + err.message, 'error');
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
