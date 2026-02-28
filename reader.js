console.log('Reader page loaded');

let zoom = 1;
let panX = 0;
let panY = 0;
let isDragging = false;
let dragLastX = 0;
let dragLastY = 0;
let didDrag = false;

let globalImages = [];
let readerInstance = null;

chrome.runtime.sendMessage({ action: 'getImages' }, (response) => {
  if (response && response.images && response.images.length > 0) {
    globalImages = response.images;
    if (response.title) {
      document.title = response.title;
      const h1 = document.querySelector('.sidebar-content h1');
      if (h1) h1.textContent = response.title;
    }
    readerInstance = initReader(globalImages);
  } else {
    document.getElementById('loading-overlay').innerHTML = '<div class="spinner"></div><div>No images found. Please try again.</div>';
  }
});

// ─── Transform ───────────────────────────────────────────────────────────────
function applyTransform() {
  const img = document.getElementById('preview');
  if (!img) return;
  img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  img.style.cursor = zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'pointer';
}

function resetZoom() {
  zoom = 1; panX = 0; panY = 0;
  applyTransform();
}

// ─── Viewer events ───────────────────────────────────────────────────────────
function attachViewerEvents(viewer, reader) {
  viewer.addEventListener('wheel', (e) => {
    const isFitWidth = document.getElementById('fitWidth').checked;
    // In fit-width mode with no zoom, let native scroll handle it
    if (isFitWidth && zoom <= 1 && !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const oldZoom = zoom;
      zoom = Math.max(1, Math.min(8, zoom * (e.deltaY > 0 ? 0.85 : 1.15)));
      if (zoom === 1) {
        panX = 0; panY = 0;
      } else {
        const rect = viewer.getBoundingClientRect();
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        panX = cx - (cx - panX) * (zoom / oldZoom);
        panY = cy - (cy - panY) * (zoom / oldZoom);
      }
    } else if (zoom > 1) {
      panX -= e.shiftKey ? e.deltaY : e.deltaX;
      panY -= e.shiftKey ? 0 : e.deltaY;
    }
    applyTransform();
  }, { passive: false });

  viewer.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    didDrag = false;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    const isFitWidth = document.getElementById('fitWidth').checked;
    if (isFitWidth) {
      viewer.style.cursor = 'grabbing';
      e.preventDefault();
    } else if (zoom > 1) {
      applyTransform();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragLastX;
    const dy = e.clientY - dragLastY;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true;
    const isFitWidth = document.getElementById('fitWidth').checked;
    if (isFitWidth && zoom <= 1) {
      // Drag-to-scroll in fit-width mode
      viewer.scrollTop -= dy;
    } else if (zoom > 1) {
      panX += dx; panY += dy; applyTransform();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    const isFitWidth = document.getElementById('fitWidth').checked;
    if (isFitWidth) {
      viewer.style.cursor = 'grab';
    } else {
      applyTransform();
    }
    if (!didDrag) {
      const rect = viewer.getBoundingClientRect();
      if ((e.clientX - rect.left) > rect.width / 2) reader.next();
      else reader.prev();
    }
  });

  viewer.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ─── Reader ──────────────────────────────────────────────────────────────────
function initReader(images) {
  const reader = {
    idx: 0,
    total: images.length,

    init() {
      document.getElementById('total').textContent = this.total;
      document.getElementById('miniTotal').textContent = this.total;

      // Sidebar toggle
      const sidebar = document.getElementById('sidebar');
      const toggle = document.getElementById('sidebarToggle');
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        toggle.textContent = sidebar.classList.contains('collapsed') ? '←' : '→';
      });

      // Mini page input (collapsed sidebar)
      const miniInput = document.getElementById('miniCurrent');
      miniInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const p = parseInt(miniInput.value);
          if (p && p > 0 && p <= this.total) this.show(p - 1);
          miniInput.blur();
        }
        e.stopPropagation();
      });
      miniInput.addEventListener('focus', () => miniInput.select());

      const pageList = document.getElementById('pageList');
      pageList.innerHTML = images.map((_, i) =>
        `<div class="page-item" id="pg${i}">${i + 1}</div>`
      ).join('');
      images.forEach((_, i) =>
        document.getElementById('pg' + i).addEventListener('click', () => this.show(i))
      );

      document.getElementById('prevBtn').addEventListener('click', () => this.prev());
      document.getElementById('nextBtn').addEventListener('click', () => this.next());

      // Jump input — enter to go
      const jumpInput = document.getElementById('jump');
      jumpInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.go(); }
        e.stopPropagation(); // prevent A/D navigation while typing
      });
      jumpInput.addEventListener('focus', () => jumpInput.select());

      // Drag-resize page list
      const pageListResize = document.getElementById('pageListResize');
      let resizing = false;
      let resizeStartY = 0;
      let resizeStartH = 0;
      pageListResize.addEventListener('mousedown', (e) => {
        resizing = true;
        resizeStartY = e.clientY;
        resizeStartH = pageList.offsetHeight;
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!resizing) return;
        const newH = Math.max(60, resizeStartH + (e.clientY - resizeStartY));
        pageList.style.height = newH + 'px';
      });
      document.addEventListener('mouseup', () => { resizing = false; });

      // Fit Width toggle
      document.getElementById('fitWidth').addEventListener('change', (e) => {
        if (e.target.checked) {
          document.getElementById('lockZoom').checked = false;
        }
        const viewer = document.querySelector('.manga-viewer');
        viewer.classList.toggle('fit-width', e.target.checked);
        viewer.style.cursor = e.target.checked ? 'grab' : '';
        resetZoom();
        viewer.scrollTop = 0;
      });

      // Lock Zoom toggle — mutually exclusive with Fit Width
      document.getElementById('lockZoom').addEventListener('change', (e) => {
        if (e.target.checked) {
          document.getElementById('fitWidth').checked = false;
          const viewer = document.querySelector('.manga-viewer');
          viewer.classList.remove('fit-width');
        }
      });

      attachViewerEvents(document.querySelector('.manga-viewer'), this);

      document.addEventListener('keydown', (e) => {
        // Skip when editing page inputs
        const active = document.activeElement;
        if (active === document.getElementById('jump') || active === document.getElementById('miniCurrent')) return;
        // Use e.code for letter keys to avoid Unikey/IME conflicts
        if (e.key === 'ArrowRight' || e.key === ' ' || e.code === 'KeyD') { e.preventDefault(); this.next(); }
        if (e.key === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); this.prev(); }
        if (e.code === 'KeyF') document.documentElement.requestFullscreen().catch(() => { });
        if (e.key === 'Escape') resetZoom();
      });

      this.show(0);
    },

    showLoading() {
      document.getElementById('loading-overlay').style.display = 'flex';
    },

    hideLoading() {
      document.getElementById('loading-overlay').style.display = 'none';
    },

    _loadId: 0,

    show(i) {
      if (i < 0 || i >= this.total) return;
      this.idx = i;
      const loadId = ++this._loadId;

      const isLockZoom = document.getElementById('lockZoom').checked;
      if (!isLockZoom) {
        resetZoom();
      } else {
        panX = 0;
        panY = 0;
        applyTransform();
      }
      document.getElementById('jump').value = i + 1;
      document.getElementById('miniCurrent').value = i + 1;
      document.querySelectorAll('.page-item').forEach(el => el.classList.remove('current'));
      const pgEl = document.getElementById('pg' + i);
      if (pgEl) {
        pgEl.classList.add('current');
        try { pgEl.scrollIntoView({ block: 'center' }); } catch (e) { }
      }

      // Show loading overlay
      const loadingPage = document.getElementById('loadingPage');
      if (loadingPage) loadingPage.textContent = `Page ${i + 1} / ${this.total}`;
      this.showLoading();

      const img = document.getElementById('preview');
      const applyImage = (src) => {
        if (loadId !== this._loadId) return;
        img.src = src;
        this.hideLoading();
        if (isLockZoom && zoom > 1) {
          const viewer = document.querySelector('.manga-viewer');
          const viewerH = viewer.clientHeight;
          const imgDisplayH = img.clientHeight * zoom;
          if (imgDisplayH > viewerH) {
            panY = (imgDisplayH - viewerH) / 2;
          }
          panX = 0;
          applyTransform();
        }
        if (document.getElementById('fitWidth').checked) {
          document.querySelector('.manga-viewer').scrollTop = 0;
        }
      };

      // Preload new image
      const preload = new Image();
      let applied = false;
      const doApply = () => {
        if (applied || loadId !== this._loadId) return;
        applied = true;
        applyImage(preload.src);
      };
      preload.onload = doApply;
      preload.onerror = () => {
        if (loadId !== this._loadId) return;
        // On error, still set the src directly so the browser shows its error
        img.src = images[i].src;
        this.hideLoading();
      };
      preload.src = images[i].src;

      // Timeout fallback
      setTimeout(() => {
        if (!applied && loadId === this._loadId) {
          applied = true;
          applyImage(images[i].src);
        }
      }, 15000);
    },

    next() { if (this.idx < this.total - 1) this.show(this.idx + 1); },
    prev() { if (this.idx > 0) this.show(this.idx - 1); },
    go() {
      const p = parseInt(document.getElementById('jump').value);
      if (p && p > 0 && p <= this.total) this.show(p - 1);
    }
  };

  reader.init();
  return reader;
}
