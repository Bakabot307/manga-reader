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
  const isContinuous = document.getElementById('continuous');
  if (isContinuous && isContinuous.checked) {
    const container = document.getElementById('continuous-container');
    if (container) {
      container.style.transform = `translateX(${panX}px) scale(${zoom})`;
    }
    const viewer = document.getElementById('viewer');
    if (viewer) viewer.style.cursor = zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'grab';
  } else {
    const img = document.getElementById('preview');
    if (!img) return;
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    img.style.cursor = zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'pointer';
  }
}

function resetZoom() {
  zoom = 1; panX = 0; panY = 0;
  applyTransform();
}

// ─── Viewer events ───────────────────────────────────────────────────────────
function attachViewerEvents(viewer, reader) {
  viewer.addEventListener('wheel', (e) => {
    const isContinuous = document.getElementById('continuous').checked;
    const isFitWidth = document.getElementById('fitWidth').checked;

    // In continuous mode, only intercept Ctrl+Scroll for zoom, let regular scroll work natively
    if (isContinuous && !(e.ctrlKey || e.metaKey)) return;

    // In fit-width mode with no zoom, let native scroll handle it
    if (isFitWidth && zoom <= 1 && !(e.ctrlKey || e.metaKey)) return;

    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const minZoom = isContinuous ? 0.2 : 1;
      const oldZoom = zoom;
      zoom = Math.max(minZoom, Math.min(8, zoom * (e.deltaY > 0 ? 0.85 : 1.15)));
      if (zoom <= 1) {
        panX = 0; panY = 0;
      } else if (!isContinuous) {
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
    const isContinuous = document.getElementById('continuous').checked;
    isDragging = true;
    didDrag = false;
    dragLastX = e.clientX;
    dragLastY = e.clientY;
    const isFitWidth = document.getElementById('fitWidth').checked;
    if (isContinuous || isFitWidth) {
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
    const isContinuous = document.getElementById('continuous').checked;
    const isFitWidth = document.getElementById('fitWidth').checked;
    if (isContinuous && zoom > 1) {
      panX += dx;
      viewer.scrollTop -= dy;
      applyTransform();
    } else if ((isContinuous || isFitWidth) && zoom <= 1) {
      viewer.scrollTop -= dy;
    } else if (zoom > 1) {
      panX += dx; panY += dy; applyTransform();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    const isContinuous = document.getElementById('continuous').checked;
    const isFitWidth = document.getElementById('fitWidth').checked;
    if (isContinuous || isFitWidth) {
      viewer.style.cursor = 'grab';
    } else {
      applyTransform();
    }
    if (!didDrag && !isContinuous) {
      const rect = viewer.getBoundingClientRect();
      if ((e.clientX - rect.left) > rect.width / 2) reader.next();
      else reader.prev();
    }
  });

  viewer.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ─── Reader ──────────────────────────────────────────────────────────────────
function initReader(images) {
  let scrollObserver = null;
  let suppressScrollUpdate = false;

  const reader = {
    idx: 0,
    total: images.length,

    savePrefs() {
      chrome.storage.local.set({
        readerPrefs: {
          continuous: document.getElementById('continuous').checked,
          fitWidth: document.getElementById('fitWidth').checked,
          lockZoom: document.getElementById('lockZoom').checked,
          sidebarCollapsed: document.getElementById('sidebar').classList.contains('collapsed')
        }
      });
    },

    async loadPrefs() {
      return new Promise(resolve => {
        chrome.storage.local.get('readerPrefs', (result) => resolve(result.readerPrefs || null));
      });
    },

    async init() {
      document.getElementById('total').textContent = this.total;
      document.getElementById('miniTotal').textContent = this.total;

      // Load saved preferences
      const prefs = await this.loadPrefs();

      // Sidebar toggle
      const sidebar = document.getElementById('sidebar');
      const toggle = document.getElementById('sidebarToggle');
      if (prefs && prefs.sidebarCollapsed) {
        sidebar.classList.add('collapsed');
        toggle.textContent = '\u2190';
      }
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        toggle.textContent = sidebar.classList.contains('collapsed') ? '\u2190' : '\u2192';
        this.savePrefs();
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
        e.stopPropagation();
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

      // Continuous toggle
      document.getElementById('continuous').addEventListener('change', (e) => {
        const viewer = document.getElementById('viewer');
        if (e.target.checked) {
          resetZoom();
          viewer.classList.add('continuous');
          this.buildContinuous();
        } else {
          resetZoom();
          viewer.classList.remove('continuous');
          this.destroyContinuous();
          this.show(this.idx);
        }
        this.savePrefs();
      });

      // Fit Width toggle
      document.getElementById('fitWidth').addEventListener('change', (e) => {
        if (e.target.checked) {
          document.getElementById('lockZoom').checked = false;
        }
        const viewer = document.getElementById('viewer');
        viewer.classList.toggle('fit-width', e.target.checked);
        viewer.style.cursor = (e.target.checked || document.getElementById('continuous').checked) ? 'grab' : '';
        resetZoom();
        viewer.scrollTop = 0;
        this.savePrefs();
      });

      // Lock Zoom toggle — mutually exclusive with Fit Width only
      document.getElementById('lockZoom').addEventListener('change', (e) => {
        if (e.target.checked) {
          document.getElementById('fitWidth').checked = false;
          const viewer = document.getElementById('viewer');
          viewer.classList.remove('fit-width');
        }
        this.savePrefs();
      });

      attachViewerEvents(document.getElementById('viewer'), this);

      document.addEventListener('keydown', (e) => {
        const active = document.activeElement;
        if (active === document.getElementById('jump') || active === document.getElementById('miniCurrent')) return;
        if (e.key === 'ArrowRight' || e.key === ' ' || e.code === 'KeyD') { e.preventDefault(); this.next(); }
        if (e.key === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); this.prev(); }
        if (e.code === 'KeyF') document.documentElement.requestFullscreen().catch(() => { });
        if (e.key === 'Escape') resetZoom();
      });

      this.show(0);

      // Apply saved preferences (after event listeners are attached)
      if (prefs) {
        if (prefs.fitWidth) {
          document.getElementById('fitWidth').checked = true;
          document.getElementById('fitWidth').dispatchEvent(new Event('change'));
        }
        if (prefs.lockZoom) {
          document.getElementById('lockZoom').checked = true;
          document.getElementById('lockZoom').dispatchEvent(new Event('change'));
        }
        if (prefs.continuous) {
          document.getElementById('continuous').checked = true;
          document.getElementById('continuous').dispatchEvent(new Event('change'));
        }
      }
    },

    // ─── Continuous mode ───────────────────────────────────────────────
    buildContinuous() {
      const container = document.getElementById('continuous-container');
      container.innerHTML = '';
      images.forEach((imgData, i) => {
        const img = document.createElement('img');
        img.src = imgData.src;
        img.alt = `Page ${i + 1}`;
        img.dataset.page = i;
        img.id = `cpage${i}`;
        container.appendChild(img);
      });

      // Use IntersectionObserver to track which page is visible
      if (scrollObserver) scrollObserver.disconnect();
      scrollObserver = new IntersectionObserver((entries) => {
        if (suppressScrollUpdate) return;
        let bestEntry = null;
        let bestRatio = 0;
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestEntry = entry;
          }
        });
        if (bestEntry) {
          const pageIdx = parseInt(bestEntry.target.dataset.page);
          if (!isNaN(pageIdx) && pageIdx !== this.idx) {
            this.idx = pageIdx;
            this._updatePageUI(pageIdx);
          }
        }
      }, {
        root: document.getElementById('viewer'),
        threshold: [0, 0.25, 0.5, 0.75, 1]
      });

      container.querySelectorAll('img').forEach(img => scrollObserver.observe(img));
      this.scrollToPage(this.idx);
    },

    destroyContinuous() {
      if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }
      document.getElementById('continuous-container').innerHTML = '';
    },

    scrollToPage(i) {
      const el = document.getElementById(`cpage${i}`);
      if (!el) return;
      suppressScrollUpdate = true;
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
      setTimeout(() => { suppressScrollUpdate = false; }, 100);
    },

    _updatePageUI(i) {
      document.getElementById('jump').value = i + 1;
      document.getElementById('miniCurrent').value = i + 1;
      document.querySelectorAll('.page-item').forEach(el => el.classList.remove('current'));
      const pgEl = document.getElementById('pg' + i);
      if (pgEl) {
        pgEl.classList.add('current');
        try { pgEl.scrollIntoView({ block: 'center' }); } catch (e) { }
      }
    },

    // ─── Single-page mode ──────────────────────────────────────────────
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

      // In continuous mode, scroll to the page instead
      if (document.getElementById('continuous').checked) {
        this.scrollToPage(i);
        this._updatePageUI(i);
        return;
      }

      const loadId = ++this._loadId;

      const isLockZoom = document.getElementById('lockZoom').checked;
      if (!isLockZoom) {
        resetZoom();
      } else {
        panX = 0;
        panY = 0;
        applyTransform();
      }

      this._updatePageUI(i);

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
          const viewer = document.getElementById('viewer');
          const viewerH = viewer.clientHeight;
          const imgDisplayH = img.clientHeight * zoom;
          if (imgDisplayH > viewerH) {
            panY = (imgDisplayH - viewerH) / 2;
          }
          panX = 0;
          applyTransform();
        }
        if (document.getElementById('fitWidth').checked) {
          document.getElementById('viewer').scrollTop = 0;
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
