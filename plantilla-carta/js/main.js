// Carta digital Tencha Matcheria
// Fotos y GIFs: productos/<categoria>/<producto>/foto.jpg y animacion.gif (o animacion.mp4)

// Siempre iniciar en la posición superior de Recomendados al recargar
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

const state = { cats: [], items: [], current: -1, list: [] };
const $ = (id) => document.getElementById(id);
const fmt = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Bloque de nombre estilo post: Español grande / subtítulo / kanji
const nameBlock = (es, sub, jp) =>
  `<div class="name-es">${esc(es)}</div>${sub ? `<div class="name-sub">${esc(sub)}</div>` : ''}${jp ? `<div class="name-jp jp">${esc(jp)}</div>` : ''}`;

// Normaliza texto (sin tildes ni mayúsculas) para comparar nombres
const norm = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Controlador global para reproducción sutil de video al pausar el scroll (Viewport Focus)
let cardVideoController = null;

// Caché en memoria de imágenes y videos de productos para reproducción instantánea
const imgCache = new Map();
const videoCache = new Map();

function createVideoElement(url) {
  const v = document.createElement('video');
  Object.assign(v, {
    autoplay: true,
    loop: true,
    muted: true,
    playsInline: true,
    preload: 'auto',
    className: 'media-fill'
  });
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.src = url;
  return v;
}

function preloadVideo(url) {
  if (!url) return null;
  if (videoCache.has(url)) return videoCache.get(url);
  const v = createVideoElement(url);
  const entry = { url, video: v, ready: false, failed: false };
  const markReady = () => {
    entry.ready = true;
    entry.failed = false;
  };
  v.addEventListener('loadeddata', markReady);
  v.addEventListener('canplay', markReady);
  v.addEventListener('error', () => {
    entry.failed = true;
  });
  v.load();
  videoCache.set(url, entry);
  return entry;
}

function preloadItemMedia(item, includeVideo = false) {
  if (!item) return;
  const bases = [item.base, item.fallbackBase].filter(Boolean);
  bases.forEach((b) => {
    const url = b + 'foto.webp';
    if (!imgCache.has(url)) {
      const im = new Image();
      im.decoding = 'async';
      im.src = url;
      imgCache.set(url, im);
    }
  });
  if (includeVideo && item.hasVideo && item.videoUrl) {
    preloadVideo(item.videoUrl);
  }
}

// Carga una imagen sin texto placeholder (prioriza WebP ultraligero y cae a JPG o a la foto del producto del menú)
function mediaImg(src, item, alt, highPriority = false) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'width:100%;height:100%';
  const bases = [item.base, item.fallbackBase].filter(Boolean);
  const candidates = [];
  bases.forEach((b) => {
    candidates.push(b + 'foto.webp');
    candidates.push(b + 'foto.jpg');
  });
  const img = new Image();
  img.className = 'media-fill';
  img.draggable = false;
  img.alt = alt || item.nombre || '';
  img.decoding = 'async';
  img.loading = 'eager';
  if (highPriority) img.fetchPriority = 'high';

  const cached = candidates.map((u) => imgCache.get(u)).find((im) => im && im.complete && im.naturalWidth > 0);
  if (cached) {
    img.src = cached.src;
    wrap.appendChild(img);
    return wrap;
  }

  let idx = 0;
  img.onload = () => {
    imgCache.set(img.src, img);
  };
  img.onerror = () => {
    idx += 1;
    if (idx < candidates.length) img.src = candidates[idx];
  };
  if (candidates.length) img.src = candidates[0];
  wrap.appendChild(img);
  return wrap;
}

// ---------- Disponibilidad y Temperatura ----------
function isItemAvailable(item) {
  if (!item) return false;
  if (item.disponible === false) return false;
  if (typeof item.disponible === 'string') {
    const s = item.disponible.toLowerCase().trim();
    if (s === 'apagado' || s === 'off' || s === 'no' || s === 'falso' || s === 'false') return false;
  }
  return true;
}

function isItemAgotado(item) {
  if (!item) return false;
  if (item.agotado === true) return true;
  if (Array.isArray(item.tags) && item.tags.includes('agotado')) return true;
  return false;
}

function syncItemTags(item) {
  const isAgotado = isItemAgotado(item);
  const isVegano = Array.isArray(item.tags) && item.tags.includes('vegano');
  const isSinGluten = Array.isArray(item.tags) && (item.tags.includes('sin_gluten') || item.tags.includes('sin-gluten'));
  let baseTags = [];
  if (item.temperatura) {
    const t = String(item.temperatura).toLowerCase().trim();
    if (t === 'ambos' || t === 'ambas' || (t.includes('frio') && t.includes('caliente'))) baseTags = ['frio', 'caliente'];
    else if (t === 'frio' || t === 'frío') baseTags = ['frio'];
    else if (t === 'caliente') baseTags = ['caliente'];
    else if (t === 'ninguna' || t === 'ninguno' || t === '-') baseTags = [];
  } else if (Array.isArray(item.tags)) {
    baseTags = item.tags.filter((x) => x !== 'agotado' && x !== 'vegano' && x !== 'sin_gluten' && x !== 'sin-gluten');
  }
  if (isAgotado) {
    baseTags.push('agotado');
    item.agotado = true;
  }
  if (isVegano) {
    baseTags.push('vegano');
    item.vegano = true;
  }
  if (isSinGluten) {
    baseTags.push('sin_gluten');
    item.sin_gluten = true;
  }
  item.tags = baseTags;
}

// ---------- Carrusel (productos/recomendados o data/menu.json) ----------
function parseFolderMeta(rawCarpeta = '', catCarpeta = '') {
  let raw = String(rawCarpeta || '').trim();
  let forceVideo = null;
  if (raw.endsWith('#video')) {
    forceVideo = true;
    raw = raw.slice(0, -6);
  } else if (raw.endsWith('#novideo')) {
    forceVideo = false;
    raw = raw.slice(0, -8);
  }
  const isRemote = /^https?:\/\//i.test(raw);
  if (isRemote) {
    const base = raw.endsWith('/') ? raw : raw + '/';
    const parts = base.replace(/\/+$/, '').split('/');
    const slug = parts[parts.length - 1] || '';
    const fallbackBase = catCarpeta && slug ? `productos/${catCarpeta}/${slug}/` : undefined;
    return {
      base: fallbackBase || base,
      fallbackBase: base,
      slug,
      forceVideo
    };
  }
  const clean = raw.replace(/^\/+|\/+$/g, '');
  if (clean.startsWith('productos/')) {
    const base = clean + '/';
    return { base, fallbackBase: undefined, slug: clean.split('/').pop() || clean, forceVideo };
  }
  const base = catCarpeta ? `productos/${catCarpeta}/${clean}/` : `${clean}/`;
  const fallbackBase = catCarpeta && clean
    ? `${_API_BASE}/storage/v1/object/public/media/productos/${catCarpeta}/${clean}/`
    : undefined;
  return { base, fallbackBase, slug: clean, forceVideo };
}

function resolveRecVideo(rec, base, match, forceVideo = null) {
  if (forceVideo === false) return { hasVideo: false, videoUrl: '' };
  if (forceVideo === true && base) return { hasVideo: true, videoUrl: base + 'animacion.mp4' };
  if (match && match.hasVideo && match.videoUrl) {
    return { hasVideo: true, videoUrl: match.videoUrl };
  }
  if (base) {
    return { hasVideo: true, videoUrl: base + 'animacion.mp4' };
  }
  return { hasVideo: false, videoUrl: '' };
}

async function loadRecomendados(jsonRecomendados) {
  if (Array.isArray(jsonRecomendados) && jsonRecomendados.length > 0) {
    const list = [];
    jsonRecomendados.forEach((rec, idx) => {
      if (!isItemAvailable(rec)) return;
      syncItemTags(rec);
      const parsed = parseFolderMeta(rec.carpeta || `productos/recomendados/${idx + 1}`, '');
      const base = parsed.base;
      const target = norm(rec.nombre);
      const match = state.items.find((it) => norm(it.nombre) === target);
      const vInfo = resolveRecVideo(rec, base, match, parsed.forceVideo);
      list.push({
        ...rec,
        nombre: rec.nombre,
        precio: rec.precio,
        descripcion: rec.descripcion || '',
        tags: rec.tags || [],
        base,
        fallbackBase: match ? match.base : parsed.fallbackBase,
        hasVideo: vInfo.hasVideo,
        videoUrl: vInfo.videoUrl
      });
    });
    if (list.length > 0) return list;
  }

  const list = [];
  for (const n of [1, 2, 3]) {
    const base = `productos/recomendados/${n}/`;
    try {
      const res = await fetch(base + 'info.txt', { cache: 'no-store' });
      if (!res.ok) continue;
      const raw = (await res.text()).trim();
      if (!raw) continue;
      const info = {};
      raw.split(/\r?\n/).forEach((line) => {
        const i = line.indexOf('=');
        if (i > 0) info[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
      });
      // Permite escribir solo el nombre del producto o "nombre=..."
      const query = info.nombre || raw.split(/\r?\n/)[0].trim();
      if (!query) continue;
      const target = norm(query);
      const match = state.items.find((it) => norm(it.nombre) === target || norm(it.carpeta.replace(/^\d+-/, '').replace(/-/g, ' ')) === target);
      const vInfo = resolveRecVideo(info, base, match);
      if (match) {
        list.push({
          ...match,
          nombre: info.nombre || match.nombre,
          precio: info.precio ? parseInt(info.precio.replace(/\D/g, ''), 10) : match.precio,
          descripcion: info.descripcion || match.descripcion,
          base,
          fallbackBase: match.base,
          hasVideo: vInfo.hasVideo,
          videoUrl: vInfo.videoUrl
        });
      } else {
        list.push({
          nombre: query,
          precio: parseInt((info.precio || '0').replace(/\D/g, ''), 10),
          descripcion: info.descripcion || '',
          tags: [],
          base,
          hasVideo: vInfo.hasVideo,
          videoUrl: vInfo.videoUrl
        });
      }
    } catch (e) { /* carpeta vacía */ }
  }
  return list;
}

function renderCarousel(list) {
  const car = $('carousel'), dots = $('carouselDots');
  car.innerHTML = '';
  dots.innerHTML = '';
  if (!list || list.length === 0) return;

  // Precarga en memoria los videos de los recomendados
  list.forEach((it) => preloadItemMedia(it, true));

  list.forEach((item, idx) => {
    const isAgotado = isItemAgotado(item);
    const s = document.createElement('div');
    s.className = 'slide' + (isAgotado ? ' agotado' : '');

    // Foto base como póster/respaldo inmediato (evita pantalla en negro mientras el video inicia)
    s.appendChild(mediaImg(item.base + 'foto.webp', item, item.nombre, idx === 0));

    // Video en loop silencioso como protagonista visual
    if (item.hasVideo) {
      const v = document.createElement('video');
      v.className = 'slide-video media-fill';
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.preload = idx === 0 ? 'auto' : 'metadata';
      const videoUrl = item.videoUrl || (item.base + 'animacion.mp4');
      v.src = videoUrl;
      s.appendChild(v);
      if (idx === 0) {
        v.play().catch(() => {});
      }
    }

    s.insertAdjacentHTML('beforeend', `<div class="overlay-top">${nameBlock(item.nombre)}</div><div class="overlay-price">${fmt(item.precio)}</div>${isAgotado ? '<div class="overlay-agotado">Agotado</div>' : ''}`);
    s.onclick = () => openItem(idx, list);
    car.appendChild(s);

    const d = document.createElement('button');
    d.className = 'dot' + (idx === 0 ? ' active' : '');
    d.setAttribute('aria-label', 'Destacado ' + (idx + 1));
    d.onclick = () => {
      car.scrollTo({ left: car.clientWidth * idx, behavior: 'smooth' });
      scheduleNextSlide();
    };
    dots.appendChild(d);
  });

  const update = () => {
    const i = Math.round(car.scrollLeft / car.clientWidth);
    [...dots.children].forEach((d, k) => d.classList.toggle('active', k === i));

    // Solo reproduce el video del slide visible y pausa los demás para ahorrar batería
    const slides = car.querySelectorAll('.slide');
    slides.forEach((slide, k) => {
      const v = slide.querySelector('video');
      if (v) {
        if (k === i) {
          if (v.paused) v.play().catch(() => {});
        } else {
          if (!v.paused) v.pause();
        }
      }
    });
  };

  car.addEventListener('scroll', () => requestAnimationFrame(update));

  let autoSlideTimer = null;
  let paused = false;

  // Sincronizado a 4.2s (cada video dura 4.04s): termina la animación completa y hace swipe al siguiente
  function scheduleNextSlide() {
    if (autoSlideTimer) clearTimeout(autoSlideTimer);
    autoSlideTimer = setTimeout(() => {
      if (paused || document.hidden || !list.length) return;
      const cur = Math.round(car.scrollLeft / car.clientWidth);
      const next = (cur + 1) % list.length;
      car.scrollTo({ left: car.clientWidth * next, behavior: 'smooth' });
      scheduleNextSlide();
    }, 4200);
  }

  car.addEventListener('pointerdown', () => {
    paused = true;
    if (autoSlideTimer) clearTimeout(autoSlideTimer);
  });
  const resumePointer = () => {
    if (!paused) return;
    paused = false;
    scheduleNextSlide();
  };
  car.addEventListener('pointerup', resumePointer);
  car.addEventListener('pointercancel', resumePointer);
  car.addEventListener('pointerleave', resumePointer);

  // Pausar los videos y el temporizador si el usuario scrollea hacia abajo fuera del carrusel
  const heroObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) {
        if (autoSlideTimer) clearTimeout(autoSlideTimer);
        car.querySelectorAll('video').forEach((v) => { if (!v.paused) v.pause(); });
      } else {
        update();
        scheduleNextSlide();
      }
    });
  }, { threshold: 0.1 });
  heroObserver.observe(car);

  scheduleNextSlide();
}

// ---------- Categorías (tiritas horizontales 21:9 con texto a la izquierda e imagen a la derecha) ----------
function renderCategories() {
  const grid = $('catGrid');
  grid.innerHTML = '';
  state.cats.forEach((c) => {
    if (!c.items || c.items.length === 0) return;
    const b = document.createElement('button');
    b.className = 'cat-card glass';
    b.id = 'cat-' + c.id;

    // Fondo de imagen del lado derecho: busca primero en categorias/<carpeta>/foto.webp o .jpg y cae al primer producto de la categoría
    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'cat-media';
    const firstItem = c.items[0];
    const catBase = `categorias/${c.carpeta}/`;
    const candidates = [catBase + 'foto.webp', catBase + 'foto.jpg'];
    if (firstItem) {
      candidates.push(firstItem.base + 'foto.webp', firstItem.base + 'foto.jpg');
    }
    const img = new Image();
    img.className = 'media-fill';
    img.alt = c.nombre;
    img.decoding = 'async';
    img.loading = 'eager';
    let idx = 0;
    img.onload = () => mediaWrap.appendChild(img);
    img.onerror = () => {
      idx += 1;
      if (idx < candidates.length) img.src = candidates[idx];
    };
    img.src = candidates[0];

    b.appendChild(mediaWrap);
    b.insertAdjacentHTML('beforeend', `<div class="cat-info">${nameBlock(c.nombre, '', c.jp)}<div class="name-sub">${c.items.length} productos</div></div>`);
    b.onclick = () => goToCategory(c.id);
    grid.appendChild(b);
  });
}

function goToCategory(id) {
  if (currentDietFilter) {
    applyDietFilter(null);
  }
  const list = $('menuList');
  if (list.hidden) {
    list.hidden = false;
    // Muestra de inmediato todas las tarjetas para que las imágenes ya precargadas se vean al instante
    document.querySelectorAll('.item-card').forEach((c) => c.classList.add('visible'));
  }
  requestAnimationFrame(() => $('sec-' + id).scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

// ---------- Filtros Dietarios (Vegano / Sin Gluten) ----------
let currentDietFilter = null;

function applyDietFilter(filter) {
  currentDietFilter = filter;
  const btnVegano = $('btnFilterVegano');
  const btnSinGluten = $('btnFilterSinGluten');
  if (btnVegano) btnVegano.classList.toggle('active', filter === 'vegano');
  if (btnSinGluten) btnSinGluten.classList.toggle('active', filter === 'sin_gluten');

  const list = $('menuList');
  if (list && list.hidden) {
    list.hidden = false;
  }

  let totalVisible = 0;
  document.querySelectorAll('.menu-cat').forEach((sec) => {
    let catVisibleCount = 0;
    sec.querySelectorAll('.item-card').forEach((card) => {
      card.classList.add('visible');
      if (!filter) {
        card.style.display = '';
        catVisibleCount++;
        totalVisible++;
        return;
      }
      const idx = Number(card.dataset.index);
      const item = state.items[idx];
      let matches = false;
      if (item) {
        if (filter === 'vegano') {
          matches = Boolean(item.vegano || (Array.isArray(item.tags) && item.tags.includes('vegano')));
        } else if (filter === 'sin_gluten') {
          matches = Boolean(item.sin_gluten || (Array.isArray(item.tags) && (item.tags.includes('sin_gluten') || item.tags.includes('sin-gluten'))));
        }
      }
      if (matches) {
        card.style.display = '';
        catVisibleCount++;
        totalVisible++;
      } else {
        card.style.display = 'none';
      }
    });

    sec.style.display = (filter && catVisibleCount === 0) ? 'none' : '';
  });

  // Actualizar visibilidad de chips en la barra de categorías
  const bar = $('catBar');
  if (bar) {
    bar.querySelectorAll('.chip:not(.chip-filter-clear)').forEach((ch) => {
      const catId = ch.dataset.cat;
      const sec = $('sec-' + catId);
      if (sec && sec.style.display === 'none') {
        ch.style.display = 'none';
      } else {
        ch.style.display = '';
      }
    });

    // Chip para quitar filtro en la barra superior
    let clearChip = bar.querySelector('.chip-filter-clear');
    if (filter) {
      if (!clearChip) {
        clearChip = document.createElement('button');
        clearChip.className = 'chip chip-filter-clear';
        clearChip.onclick = () => toggleDietFilter(null);
        bar.prepend(clearChip);
      }
      clearChip.innerHTML = `✕ Quitar filtro (${filter === 'vegano' ? '🌱 Vegano' : '🌾 Sin gluten'})`;
      clearChip.style.display = '';
    } else if (clearChip) {
      clearChip.remove();
    }
  }

  // Mensaje si no hay productos con ese filtro
  let emptyMsg = document.getElementById('dietFilterEmpty');
  if (filter && totalVisible === 0) {
    if (!emptyMsg) {
      emptyMsg = document.createElement('div');
      emptyMsg.id = 'dietFilterEmpty';
      emptyMsg.className = 'diet-empty-state';
      emptyMsg.innerHTML = `
        <p>No hay productos disponibles con el filtro seleccionado (${filter === 'vegano' ? '🌱 Vegano' : '🌾 Sin gluten'}).</p>
        <button type="button" class="btn-clear-filter">Ver toda la carta</button>
      `;
      const clrBtn = emptyMsg.querySelector('.btn-clear-filter');
      if (clrBtn) clrBtn.onclick = () => toggleDietFilter(null);
      $('menuSections').appendChild(emptyMsg);
    } else {
      const p = emptyMsg.querySelector('p');
      if (p) p.textContent = `No hay productos disponibles con el filtro seleccionado (${filter === 'vegano' ? '🌱 Vegano' : '🌾 Sin gluten'}).`;
      const clrBtn = emptyMsg.querySelector('.btn-clear-filter');
      if (clrBtn) clrBtn.onclick = () => toggleDietFilter(null);
    }
    emptyMsg.style.display = 'block';
  } else if (emptyMsg) {
    emptyMsg.style.display = 'none';
  }
}

function toggleDietFilter(filter) {
  if (currentDietFilter === filter) {
    applyDietFilter(null);
    return;
  }
  applyDietFilter(filter);
  requestAnimationFrame(() => {
    const list = $('menuList');
    if (!list) return;
    const firstSec = list.querySelector('.menu-cat:not([style*="display: none"])');
    const target = firstSec || list;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ---------- Lista completa ----------
function renderMenu() {
  const bar = $('catBar'), wrap = $('menuSections');
  bar.innerHTML = '';
  wrap.innerHTML = '';
  state.cats.forEach((c) => {
    if (!c.items || c.items.length === 0) return;
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.dataset.cat = c.id;
    chip.textContent = c.nombre;
    chip.onclick = () => goToCategory(c.id);
    bar.appendChild(chip);

    const sec = document.createElement('section');
    sec.className = 'menu-cat';
    sec.id = 'sec-' + c.id;
    sec.innerHTML = `<h2 class="menu-cat-head">${nameBlock(c.nombre, '', c.jp)}</h2>${c.intro ? `<p class="intro">${esc(c.intro)}</p>` : ''}<div class="item-grid"></div>`;
    const g = sec.querySelector('.item-grid');
    c.items.forEach((item) => {
      const isAgotado = isItemAgotado(item);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'item-card glass' + (isAgotado ? ' agotado' : '');
      card.id = 'item-' + c.id + '-' + item.carpeta;
      card.dataset.index = String(state.items.indexOf(item));
      if (item.hasVideo && !isAgotado) {
        card.dataset.hasVideo = '1';
      }
      const icons = (item.tags || []).map((t) => (t === 'frio' ? '❄' : t === 'caliente' ? '🔥' : '')).filter(Boolean).join(' ');
      card.appendChild(mediaImg(item.base + 'foto.jpg', item));
      card.insertAdjacentHTML('beforeend', `<div class="overlay-top">${nameBlock(item.nombre, item.sub, item.jp)}</div><div class="overlay-price">${fmt(item.precio)}</div>${icons ? `<div class="overlay-icons">${icons}</div>` : ''}${isAgotado ? '<div class="overlay-agotado">Agotado</div>' : ''}`);
      card.onclick = () => openItem(state.items.indexOf(item));
      g.appendChild(card);
    });
    wrap.appendChild(sec);
  });

  // Resalta el chip de la categoría visible y lo centra horizontalmente SIN tocar el scroll vertical de la página
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const id = e.target.id.replace('sec-', '');
      document.querySelectorAll('.chip').forEach((ch) => {
        const on = ch.dataset.cat === id;
        ch.classList.toggle('active', on);
        if (on && bar) {
          const targetLeft = ch.offsetLeft - (bar.clientWidth - ch.clientWidth) / 2;
          bar.scrollTo({ left: targetLeft, behavior: 'smooth' });
        }
      });
    });
  }, { rootMargin: '-140px 0px -60% 0px' });
  document.querySelectorAll('.menu-cat').forEach((s) => io.observe(s));
}

function initReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.item-card').forEach((c) => io.observe(c));
}

// ---------- Reproducción inteligente por banda de visualización (Active Viewport Band) ----------
function initCardVideoFocus() {
  let dwellTimer = null;
  let activeCard = null;
  let activeVideo = null;
  let fadeOutTimer = null;

  function getBandBounds() {
    const vh = window.innerHeight;
    // La banda superior-central: justo debajo del encabezado/chips (~120px)
    // hasta la mitad de la pantalla (el tercio superior visible donde se ubica el bloque activo)
    const bandTop = Math.max(115, vh * 0.15);
    const bandBottom = vh * 0.52;
    return { bandTop, bandBottom };
  }

  function isCardInBand(card) {
    if (!card || card.offsetParent === null) return false;
    const rect = card.getBoundingClientRect();
    const { bandTop, bandBottom } = getBandBounds();
    const cardCenterY = rect.top + rect.height * 0.5;
    // Está dentro si su centro vertical se ubica dentro de la banda y es visible en pantalla
    return cardCenterY >= bandTop && cardCenterY <= bandBottom && rect.bottom > bandTop && rect.top < window.innerHeight;
  }

  function stopActive(immediate = false) {
    if (dwellTimer) {
      clearTimeout(dwellTimer);
      dwellTimer = null;
    }
    if (fadeOutTimer) {
      clearTimeout(fadeOutTimer);
      fadeOutTimer = null;
    }
    if (activeVideo) {
      const v = activeVideo;
      v.classList.remove('playing');
      if (immediate) {
        v.pause();
        try { v.currentTime = 0; } catch (_) {}
      } else {
        fadeOutTimer = setTimeout(() => {
          v.pause();
          try { v.currentTime = 0; } catch (_) {}
        }, 300);
      }
    }
    activeCard = null;
    activeVideo = null;
  }

  function getEligibleCardsInBand() {
    const list = $('menuList');
    if (!list || list.hidden) return [];

    const cards = Array.from(document.querySelectorAll('.item-card[data-has-video="1"]:not(.agotado)'));
    if (!cards.length) return [];

    return cards.filter(isCardInBand);
  }

  function playCard(card) {
    if (!card || card === activeCard) return;

    // Si había otra tarjeta activa, desvanecerla
    if (activeVideo && activeCard !== card) {
      const oldVideo = activeVideo;
      oldVideo.classList.remove('playing');
      setTimeout(() => {
        if (activeVideo !== oldVideo) {
          oldVideo.pause();
          try { oldVideo.currentTime = 0; } catch (_) {}
        }
      }, 400);
    }

    const idx = Number(card.dataset.index);
    const item = state.items[idx];
    if (!item || !item.hasVideo) return;

    let videoEl = card.querySelector('.card-video');
    if (!videoEl) {
      const videoUrl = item.videoUrl || (item.base + 'animacion.mp4');
      videoEl = document.createElement('video');
      videoEl.className = 'card-video media-fill';
      videoEl.muted = true;
      videoEl.loop = true;
      videoEl.playsInline = true;
      videoEl.setAttribute('muted', '');
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('webkit-playsinline', '');
      videoEl.preload = 'auto';
      videoEl.src = videoUrl;
      const firstOverlay = card.querySelector('.overlay-top');
      if (firstOverlay) {
        card.insertBefore(videoEl, firstOverlay);
      } else {
        card.appendChild(videoEl);
      }
    }

    activeCard = card;
    activeVideo = videoEl;

    const playPromise = videoEl.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        if (activeCard === card && isCardInBand(card)) {
          videoEl.classList.add('playing');
        }
      }).catch(() => {});
    }
  }

  function handleScroll() {
    const dlg = $('productPopup');
    if (dlg && dlg.open) return;

    // 1. REGLA CLAVE: Si ya hay un video reproduciéndose y la tarjeta SIGUE dentro de la banda,
    // ¡NO LA DETENGAS! Deja que siga reproduciendo con total fluidez mientras scrollea lento o toca la pantalla.
    if (activeCard && isCardInBand(activeCard)) {
      if (dwellTimer) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
      }
      return;
    }

    // 2. Si la tarjeta activa ya salió de la banda (se fue hacia arriba o hacia abajo), apágala
    if (activeCard && !isCardInBand(activeCard)) {
      stopActive(false);
    }

    // 3. Programar la activación de la siguiente tarjeta que esté en la banda
    if (dwellTimer) {
      clearTimeout(dwellTimer);
      dwellTimer = null;
    }

    dwellTimer = setTimeout(() => {
      if (dlg && dlg.open) return;

      const candidates = getEligibleCardsInBand();
      if (!candidates.length) return;

      // Si la tarjeta activa sigue siendo una de las candidatas en la banda, mantenerla
      if (activeCard && candidates.includes(activeCard)) {
        return;
      }

      // Si hay 2 tarjetas en la fila dentro de la banda (columna izq / der), elegir una al azar (50/50)
      const chosenCard = candidates[Math.floor(Math.random() * candidates.length)];
      playCard(chosenCard);
    }, 450);
  }

  window.addEventListener('scroll', handleScroll, { passive: true });

  const dlg = $('productPopup');
  if (dlg) {
    dlg.addEventListener('close', () => {
      setTimeout(handleScroll, 100);
      const car = $('carousel');
      if (car && window.scrollY < 300) {
        const i = Math.round(car.scrollLeft / car.clientWidth);
        const v = car.querySelectorAll('.slide')[i]?.querySelector('video');
        if (v && v.paused) v.play().catch(() => {});
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopActive(true);
    else handleScroll();
  });

  return { stopActive, scheduleFocus: handleScroll };
}

// ---------- Popup ----------
function buildSlideMedia(item) {
  const slide = document.createElement('div');
  slide.className = 'popup-slide';
  const bases = [item.base, item.fallbackBase].filter(Boolean);
  const makePhoto = () => mediaImg((bases[0] || '') + 'foto.webp', item, item.nombre, true);

  if (item.hasVideo) {
    const videoUrl = item.videoUrl || (item.base + 'animacion.mp4');
    const entry = preloadVideo(videoUrl);

    const mountVideo = () => {
      const v = (entry.video.parentNode && entry.video.closest('.exiting'))
        ? createVideoElement(videoUrl)
        : entry.video;
      v.currentTime = 0;
      v.addEventListener('error', () => {
        if (slide.isConnected) slide.replaceChildren(makePhoto());
      }, { once: true });
      slide.replaceChildren(v);
      const p = v.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          if (slide.isConnected) slide.replaceChildren(makePhoto());
        });
      }
    };

    if (entry && !entry.failed && (entry.ready || entry.video.readyState >= 2)) {
      mountVideo();
      return slide;
    }

    // Si el video tarda en cargar o falla, abre la foto de inmediato sin ningún texto
    slide.appendChild(makePhoto());
    if (entry && !entry.failed) {
      const onReady = () => {
        entry.video.removeEventListener('canplay', onReady);
        entry.video.removeEventListener('loadeddata', onReady);
        if (slide.isConnected && !entry.failed) mountVideo();
      };
      entry.video.addEventListener('canplay', onReady, { once: true });
      entry.video.addEventListener('loadeddata', onReady, { once: true });
    }
    return slide;
  }

  slide.appendChild(makePhoto());
  return slide;
}

function fillPopupCard(card, item) {
  const isAgotado = isItemAgotado(item);
  card.classList.toggle('agotado', isAgotado);
  const mediaWrap = card.querySelector('.popup-media-wrap');
  let agotadoBadge = mediaWrap ? mediaWrap.querySelector('.overlay-agotado') : null;
  if (isAgotado) {
    if (!agotadoBadge && mediaWrap) {
      agotadoBadge = document.createElement('div');
      agotadoBadge.className = 'overlay-agotado';
      agotadoBadge.textContent = 'Agotado';
      mediaWrap.appendChild(agotadoBadge);
    }
  } else if (agotadoBadge) {
    agotadoBadge.remove();
  }
  const mediaBox = card.querySelector('.popup-media');
  mediaBox.replaceChildren(buildSlideMedia(item));
  const tagNames = { frio: '❄ Frío', caliente: '🔥 Caliente', agotado: '⚠️ Agotado' };
  card.querySelector('.popup-tags').innerHTML = (item.tags || [])
    .filter((t) => tagNames[t])
    .map((t) => `<span class="tag tag-${t}">${tagNames[t]}</span>`).join('');
  card.querySelector('.popup-head').innerHTML = nameBlock(item.nombre, item.sub, item.jp);
  const desc = card.querySelector('.popup-desc'), more = card.querySelector('.popup-more'), body = card.querySelector('.popup-body');
  desc.textContent = item.descripcion || '';
  if (body) body.scrollTop = 0;
  if (more) more.remove();
  card.querySelector('.popup-variants').innerHTML = '';
  const v = item.variantes || [];
  card.querySelector('.popup-price').innerHTML = v.length
    ? `<small>Unidad <b>${fmt(item.precio)}</b></small>` + v.map((x) => `<small>${esc(x.nombre)} <b>${fmt(x.precio)}</b></small>`).join('')
    : fmt(item.precio);
}

function wirePopupCardButtons(card, dlg) {
  card.querySelector('.popup-close').onclick = () => dlg.close();
  const flash = (btn) => { btn.classList.remove('flash'); void btn.offsetWidth; btn.classList.add('flash'); };
  const [prevBtn, nextBtn] = card.querySelectorAll('.popup-nav button');
  prevBtn.onclick = (e) => { flash(e.currentTarget); navigate(-1); };
  nextBtn.onclick = (e) => { flash(e.currentTarget); navigate(1); };
}

function openItem(idx, list = state.items, dir = 0) {
  if (cardVideoController) cardVideoController.stopActive(true);
  const car = $('carousel');
  if (car) car.querySelectorAll('video').forEach((v) => { if (!v.paused) v.pause(); });
  const item = list[idx];
  if (!item) return;
  state.current = idx;
  state.list = list;

  // Precarga inmediata de fotos y videos del producto actual, el siguiente y el anterior (y 2 más adelante/atrás)
  const n = list.length;
  if (n > 0) {
    preloadItemMedia(item, true);
    preloadItemMedia(list[(idx + 1) % n], true);
    preloadItemMedia(list[(idx - 1 + n) % n], true);
    preloadItemMedia(list[(idx + 2) % n], true);
    preloadItemMedia(list[(idx - 2 + n) % n], true);
  }

  const dlg = $('productPopup');
  const currentCard = dlg.querySelector('.popup-card:not(.exiting)');

  if (dir !== 0 && currentCard && dlg.open) {
    const nextCard = currentCard.cloneNode(true);
    nextCard.id = '';
    fillPopupCard(nextCard, item);
    wirePopupCardButtons(nextCard, dlg);
    nextCard.classList.remove('exit-to-left', 'exit-to-right', 'enter-from-left', 'enter-from-right');
    nextCard.classList.add(dir > 0 ? 'enter-from-right' : 'enter-from-left');
    dlg.appendChild(nextCard);
    void nextCard.offsetWidth; // fuerza reflow
    currentCard.classList.add('exiting', dir > 0 ? 'exit-to-left' : 'exit-to-right');
    nextCard.classList.remove('enter-from-right', 'enter-from-left');
    setTimeout(() => { if (currentCard.parentNode === dlg) currentCard.remove(); }, 340);
  } else {
    fillPopupCard(currentCard, item);
    wirePopupCardButtons(currentCard, dlg);
  }

  if (!dlg.open) {
    const y = window.scrollY;
    dlg.showModal();
    if (window.scrollY !== y) {
      window.scrollTo(0, y);
    }
  }
}

function navigate(step) {
  const n = state.list.length;
  openItem((state.current + step + n) % n, state.list, step);
}

function initPopup() {
  const dlg = $('productPopup');

  // Bloquea cualquier scroll o arrastre de la página de fondo mientras el popup está abierto
  let lastTouchY = 0;
  dlg.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) lastTouchY = e.touches[0].clientY;
  }, { passive: true });

  dlg.addEventListener('touchmove', (e) => {
    const body = e.target.closest('.popup-body');
    if (!body) {
      if (e.cancelable) e.preventDefault();
      return;
    }
    const currentY = e.touches[0].clientY;
    const dy = currentY - lastTouchY;
    const atTop = body.scrollTop <= 0 && dy > 0;
    const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 1 && dy < 0;
    if (atTop || atBottom) {
      if (e.cancelable) e.preventDefault();
    }
    lastTouchY = currentY;
  }, { passive: false });

  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.addEventListener('keydown', (e) => {
    if (!dlg.open) return;
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
  });
  let x0 = null, y0 = null, startScrollTop = 0;
  dlg.addEventListener('touchstart', (e) => {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    const currentCard = dlg.querySelector('.popup-card:not(.exiting)');
    const body = currentCard ? currentCard.querySelector('.popup-body') : null;
    startScrollTop = body ? body.scrollTop : 0;
  }, { passive: true });
  dlg.addEventListener('touchend', (e) => {
    if (x0 === null || y0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;

    // Deslizar de arriba hacia abajo (dy > 0): cierra el globo solo si inició en la parte superior del cuerpo
    // El scroll hacia arriba (dy < 0 para leer texto abajo) queda deshabilitado para cerrar
    if (dy > 65 && dy > Math.abs(dx) * 1.2 && startScrollTop <= 2) {
      dlg.close();
    } else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      navigate(dx < 0 ? 1 : -1);
    }
    x0 = null;
    y0 = null;
  });
}

async function fetchMenuData() {
  try {
    const res = await fetch('data/menu.json?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('No se pudo cargar data/menu.json');
    return await res.json();
  } catch (err) {
    console.error('Error al cargar datos de data/menu.json:', err);
    return { categorias: [], recomendados: [] };
  }
}

// ---------- Analítica de Visitas (Lista para activación en producción) ----------
function trackVisitorSession() {
  // Modo local inicial: listo para activar al publicar
}

// ---------- Init ----------
async function init() {
  trackVisitorSession();
  const data = await fetchMenuData();
  state.items = [];
  state.cats = (data.categorias || []).map((c) => {
    const hasCatVideo = true;
    const activeItems = (c.items || []).filter((item) => {
      syncItemTags(item);
      return isItemAvailable(item);
    });
    activeItems.forEach((item) => {
      const parsed = parseFolderMeta(item.carpeta, c.carpeta);
      item.key = c.id + '/' + parsed.slug;
      item.base = parsed.base;
      item.fallbackBase = parsed.fallbackBase;
      item.hasVideo = parsed.forceVideo !== null ? parsed.forceVideo : Boolean(item.tiene_video || hasCatVideo);
      if (item.hasVideo) item.videoUrl = item.base + 'animacion.mp4';
      item.catId = c.id;
      state.items.push(item);
      preloadItemMedia(item, true);
    });
    return { ...c, items: activeItems };
  });

  const recList = await loadRecomendados(data.recomendados);
  const hero = $('heroCarousel');
  if (hero) hero.style.display = recList.length > 0 ? '' : 'none';
  renderCarousel(recList);
  renderCategories();
  renderMenu();
  initPopup();
  cardVideoController = initCardVideoFocus();

  // Botones de filtro dietario en portada
  const btnVegano = $('btnFilterVegano');
  const btnSinGluten = $('btnFilterSinGluten');
  if (btnVegano) btnVegano.onclick = () => toggleDietFilter('vegano');
  if (btnSinGluten) btnSinGluten.onclick = () => toggleDietFilter('sin_gluten');

  $('brandLink').onclick = (e) => {
    e.preventDefault();
    if (currentDietFilter) applyDietFilter(null);
    const dlg = $('productPopup');
    if (dlg.open) dlg.close();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  };

  // Limpiar cualquier hash residual en la URL y asegurar inicio arriba en Recomendados
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  window.scrollTo(0, 0);

  initPullToRefresh();

  window.addEventListener('beforeunload', () => {
    window.scrollTo(0, 0);
  });

  // Bloquea clic derecho / pulsación larga y arrastrar imágenes o videos
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('img, video, .slide, .cat-card, .item-card, .popup')) e.preventDefault();
  });
  document.addEventListener('dragstart', (e) => e.preventDefault());
}

// ---------- Pull-to-Refresh suave con scroll 100% nativo a 120Hz ----------
function initPullToRefresh() {
  const dlg = $('productPopup');
  const ptrCircle = $('ptrCircle');
  const ptrArc = $('ptrArc');
  if (!ptrCircle) return;

  let startX = 0, startY = -1, isPulling = false, pullDistance = 0;

  window.addEventListener('touchstart', (e) => {
    if (dlg.open || e.touches.length !== 1) return;
    if (window.scrollY <= 0) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isPulling = false;
      pullDistance = 0;
    } else {
      startY = -1;
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (startY < 0 || dlg.open || e.touches.length !== 1) return;
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    const dy = y - startY;
    const dx = Math.abs(x - startX);

    // Si el usuario desliza hacia arriba (intenta navegar hacia abajo en la carta), cancelar PTR de inmediato
    if (dy < -6) {
      startY = -1;
      return;
    }

    // Solo interceptar si está en el tope superior y arrastra hacia abajo con intención clara (> 24px)
    if (window.scrollY <= 0 && dy > 24 && dy > dx * 1.5) {
      const inHScroll = e.target.closest('#carousel, #catBar');
      if (inHScroll) { startY = -1; return; }

      isPulling = true;
      if (e.cancelable) e.preventDefault();

      pullDistance = Math.min(85, (dy - 24) * 0.45);
      const progress = Math.min(1, pullDistance / 50);
      ptrCircle.style.transform = `translateY(${pullDistance - 36}px) scale(${0.7 + progress * 0.3})`;
      ptrCircle.style.opacity = String(progress);
      if (ptrArc) {
        ptrArc.style.strokeDashoffset = String(56.5 * (1 - progress));
        const svg = ptrCircle.querySelector('.ptr-svg');
        if (svg) svg.style.transform = `rotate(${-90 + progress * 360}deg)`;
      }
    }
  }, { passive: false });

  const endTouch = () => {
    startY = -1;
    if (isPulling) {
      if (pullDistance >= 50) {
        // Umbral alcanzado: activar animación de giro y recargar
        ptrCircle.classList.add('refreshing');
        if (ptrArc) ptrArc.style.strokeDashoffset = '16';
        if (navigator.vibrate) navigator.vibrate(20);
        setTimeout(() => location.reload(), 400);
        return;
      } else {
        // Regresar a la posición inicial
        ptrCircle.style.transform = 'translateY(-50px) scale(0.65)';
        ptrCircle.style.opacity = '0';
      }
      isPulling = false;
      pullDistance = 0;
    }
  };

  window.addEventListener('touchend', endTouch, { passive: true });
  window.addEventListener('touchcancel', endTouch, { passive: true });
}

// Prevenir zoom-out y gestos de pellizco accidentales en Mac trackpad y pantallas táctiles
window.addEventListener('wheel', (e) => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

let lastTouchEndTemplate = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEndTemplate <= 300) {
    e.preventDefault();
  }
  lastTouchEndTemplate = now;
}, false);

init();
