(function () {
  const bus = new EventTarget();
  const pageControllers = new Map();

  let modules = [];
  let config = {};
  let pages = [];
  let rotationTimer = null;
  let currentRotationIndex = 0;
  let faceOverrideTimer = null;
  let currentPersonId = null;
  let sleeping = false;
  let voiceController = null;

  async function init() {
    const cacheBuster = `?v=${Date.now()}`;
    [modules, config] = await Promise.all([
      fetch(`/api/modules${cacheBuster}`).then(r => r.json()),
      fetch(`/api/config${cacheBuster}`).then(r => r.json())
    ]);

    applyTheme(config.theme);

    pages = normalizePages(config);
    if (pages.length === 0) {
      pages.push({ name: 'Default', modules: {} });
    }

    await renderAllPages(pages, modules, config);

    if (config.faceLock?.enabled) {
      startFaceLock(config);
    } else if (config.rotation?.enabled && pages.length > 1) {
      startRotation();
    } else {
      showPage(0);
    }

    startVoiceCommands();
    connectWebSocket();
  }

  function applyTheme(theme) {
    if (!theme) return;
    if (theme.background) {
      document.body.style.background = theme.background;
    }
    if (theme.customCss) {
      let style = document.getElementById('custom-theme-css');
      if (!style) {
        style = document.createElement('style');
        style.id = 'custom-theme-css';
        document.head.appendChild(style);
      }
      style.textContent = theme.customCss;
    }
  }

  function normalizePages(config) {
    if (config.pages && Array.isArray(config.pages)) {
      return config.pages;
    }
    if (config.modules) {
      return [{ name: 'Default', modules: config.modules }];
    }
    return [{ name: 'Default', modules: {} }];
  }

  function getPageFace(pageIndex) {
    const persons = config.faceLock?.persons || [];
    const pageName = pages[pageIndex]?.name;
    const person = persons.find(p => p.page === pageName);
    return person ? person.id : null;
  }

  function isPageVisible(pageIndex, activePersonId) {
    const pageFace = getPageFace(pageIndex);
    if (!pageFace) return true; // free page: visible to anybody
    return activePersonId === pageFace;
  }

  function getVisiblePageIndices(activePersonId) {
    return pages.map((_, i) => i).filter(i => isPageVisible(i, activePersonId));
  }

  async function renderAllPages(pages, modules, config) {
    const mirror = document.getElementById('mirror');
    mirror.innerHTML = '';

    for (let i = 0; i < pages.length; i++) {
      const pageEl = document.createElement('div');
      pageEl.className = 'page';
      pageEl.dataset.index = i;
      pageEl.dataset.pageFace = getPageFace(i) || '';
      pageEl.style.display = 'none';
      applyGridToElement(pageEl, config.grid);

      pageControllers.set(i, new Map());

      for (const mod of modules) {
        const placement = pages[i].modules && pages[i].modules[mod.id];
        if (placement) {
          const controller = await loadModule(mod, placement, pageEl);
          if (controller) {
            pageControllers.get(i).set(mod.id, controller);
          }
        }
      }

      mirror.appendChild(pageEl);
    }
  }

  function applyGridToElement(el, grid) {
    const cols = grid?.columns || 12;
    const rows = grid?.rows || 8;
    el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    el.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  }

  async function loadModule(mod, placement, container) {
    if (mod.style) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/api/module/${mod.id}/${mod.style}?v=${Date.now()}`;
      document.head.appendChild(link);
    }

    if (!mod.view) return null;

    const response = await fetch(`/api/module/${mod.id}/${mod.view}?v=${Date.now()}`);
    const html = await response.text();

    const wrapper = document.createElement('div');
    wrapper.className = `module module-${mod.id}`;
    wrapper.style.gridColumn = `${placement.x + 1} / span ${placement.width}`;
    wrapper.style.gridRow = `${placement.y + 1} / span ${placement.height}`;

    const area = (placement.width || 1) * (placement.height || 1);
    const moduleScale = Math.sqrt(area / 4);
    wrapper.style.setProperty('--module-scale', moduleScale.toFixed(3));

    const fontScale = parseFloat(placement.config?.fontScale);
    if (!isNaN(fontScale) && fontScale > 0) {
      wrapper.style.setProperty('--font-scale', fontScale);
    }

    const align = placement.config?.align;
    if (['left', 'center', 'right'].includes(align)) {
      wrapper.classList.add(`module-align-${align}`);
    }

    wrapper.innerHTML = html;
    const visibleTo = placement.config?.visibleTo;
    wrapper.dataset.visibleTo = Array.isArray(visibleTo) ? JSON.stringify(visibleTo) : (visibleTo || 'all');
    container.appendChild(wrapper);
    applyModuleVisibility(wrapper, currentPersonId);

    if (mod.main) {
      const script = await import(`/api/module/${mod.id}/${mod.main}?v=${Date.now()}`);
      if (typeof script.default === 'function') {
        return script.default({
          id: mod.id,
          container: wrapper,
          config: { language: config.language || config.voice?.language || 'en-US', ...(placement.config || {}) },
          bus
        });
      }
    }

    return null;
  }

  function startRotation() {
    stopRotation();
    const visible = getVisiblePageIndices(currentPersonId);
    const indices = visible.length > 0 ? visible : [0];
    currentRotationIndex = 0;
    showPage(indices[0]);
    const interval = (config.rotation?.interval || 10) * 1000;
    rotationTimer = setInterval(() => {
      currentRotationIndex = (currentRotationIndex + 1) % indices.length;
      showPage(indices[currentRotationIndex]);
    }, interval);
  }

  function stopRotation() {
    if (rotationTimer) {
      clearInterval(rotationTimer);
      rotationTimer = null;
    }
  }

  function showPage(index) {
    const visible = getVisiblePageIndices(currentPersonId);
    if (visible.length === 0) {
      // No pages are visible for this face; fall back to default page or first page.
      const defaultIndex = pages.findIndex(p => p.name === config.faceLock?.defaultPage);
      index = defaultIndex >= 0 ? defaultIndex : 0;
    } else if (!visible.includes(index)) {
      index = visible[0];
    }

    const pageEls = document.querySelectorAll('.page');
    pageEls.forEach((el, i) => {
      const wasVisible = el.style.display === 'grid';
      const isVisible = i === index;

      if (wasVisible && !isVisible) {
        el.style.display = 'none';
        pausePage(i);
      } else if (!wasVisible && isVisible) {
        el.style.display = 'grid';
        resumePage(i);
      }
    });
  }

  function pausePage(index) {
    const controllers = pageControllers.get(index);
    if (!controllers) return;
    controllers.forEach(ctrl => {
      if (ctrl && typeof ctrl.pause === 'function') {
        ctrl.pause();
      }
    });
  }

  function resumePage(index) {
    const controllers = pageControllers.get(index);
    if (!controllers) return;
    controllers.forEach(ctrl => {
      if (ctrl && typeof ctrl.resume === 'function') {
        ctrl.resume();
      }
    });
  }

  function startFaceLock(config) {
    // Face recognition now runs server-side via OpenCV.
    // The browser just reacts to face events broadcast over WebSocket.
    if (config.faceLock?.showPreview) {
      showCameraPreview();
    }

    // If no model is trained yet, fall back to normal rotation/page 0.
    fetch('/api/faces/model')
      .then(r => r.json())
      .then(status => {
        if (!status.ready) {
          console.log('Face lock enabled but no model trained yet.');
          if (config.rotation?.enabled && pages.length > 1) {
            startRotation();
          } else {
            showPage(0);
          }
        }
      })
      .catch(err => {
        console.error('Face model status check failed:', err);
        if (config.rotation?.enabled && pages.length > 1) {
          startRotation();
        } else {
          showPage(0);
        }
      });
  }

  function showCameraPreview() {
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.position = 'absolute';
    video.style.bottom = '10px';
    video.style.right = '10px';
    video.style.width = '160px';
    video.style.height = '120px';
    video.style.opacity = '0.3';
    video.style.borderRadius = '8px';
    video.style.zIndex = '1000';
    video.style.objectFit = 'cover';
    document.body.appendChild(video);

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(stream => { video.srcObject = stream; })
      .catch(err => console.error('Camera preview failed:', err));
  }

  function handleFaceChange(personId) {
    const faceLock = config.faceLock;
    if (!faceLock?.enabled) return;

    // Wake the mirror when a face is detected.
    if (personId && personId !== 'unknown' && sleeping) {
      handlePresence('presence.awake');
    }

    if (faceOverrideTimer) {
      clearTimeout(faceOverrideTimer);
      faceOverrideTimer = null;
    }

    if (personId && personId !== 'unknown') {
      if (personId === currentPersonId) return;
      currentPersonId = personId;
      stopRotation();

      const visible = getVisiblePageIndices(currentPersonId);
      if (visible.length > 0) {
        // Prefer the person's assigned page if visible, otherwise first visible page.
        const person = faceLock.persons.find(p => p.id === personId);
        const assignedIndex = person?.page ? pages.findIndex(p => p.name === person.page) : -1;
        showPage(assignedIndex >= 0 && visible.includes(assignedIndex) ? assignedIndex : visible[0]);
      } else {
        switchToPageByName(faceLock.defaultPage || pages[0]?.name);
      }
    } else {
      currentPersonId = personId;
      const releaseDelay = (faceLock.releaseDelay || 3) * 1000;
      faceOverrideTimer = setTimeout(() => {
        currentPersonId = null;
        if (config.rotation?.enabled && pages.length > 1) {
          startRotation();
        } else {
          switchToPageByName(faceLock.defaultPage || pages[0]?.name);
        }
      }, releaseDelay);
    }

    updateAllModuleVisibility();
  }

  function applyModuleVisibility(wrapper, activePersonId) {
    let visibleTo = wrapper.dataset.visibleTo || 'all';
    if (visibleTo && visibleTo.startsWith('[')) {
      try { visibleTo = JSON.parse(visibleTo); } catch (e) { visibleTo = 'all'; }
    }
    const visibleList = Array.isArray(visibleTo) ? visibleTo : [visibleTo];
    if (visibleList.includes('all') || visibleList.includes('anybody') || visibleList.length === 0 || !visibleList[0]) {
      wrapper.style.display = '';
      wrapper.style.visibility = 'visible';
      return;
    }
    if (activePersonId && visibleList.includes(activePersonId)) {
      wrapper.style.display = '';
      wrapper.style.visibility = 'visible';
    } else {
      // Keep the grid cell occupied, just hide the content.
      wrapper.style.visibility = 'hidden';
      wrapper.style.display = '';
    }
  }

  function updateAllModuleVisibility() {
    document.querySelectorAll('.module').forEach(wrapper => {
      applyModuleVisibility(wrapper, currentPersonId);
    });
  }

  function switchToPageByName(name) {
    const index = pages.findIndex(p => p.name === name);
    if (index >= 0) {
      showPage(index);
    }
  }

  function startVoiceCommands() {
    if (!config.voice?.enabled) return;
    import('/js/voice.js').then(module => {
      voiceController = module.startVoiceService(config, bus, {
        'page.next': () => {
          stopRotation();
          currentRotationIndex = (currentRotationIndex + 1) % pages.length;
          showPage(currentRotationIndex);
        },
        'page.previous': () => {
          stopRotation();
          currentRotationIndex = (currentRotationIndex - 1 + pages.length) % pages.length;
          showPage(currentRotationIndex);
        },
        'presence.wake': () => {
          handlePresence('presence.awake');
        },
        'presence.sleep': () => {
          handlePresence('presence.sleeping');
        }
      });
    });
  }

  function handlePresence(type) {
    if (type === 'presence.sleeping') {
      sleeping = true;
      document.body.classList.add('sleeping');
    } else if (type === 'presence.awake') {
      sleeping = false;
      document.body.classList.remove('sleeping');
    }
  }

  function handleCommand(command, data) {
    bus.dispatchEvent(new CustomEvent('remote.' + command, { detail: data }));
    if (command === 'wake') {
      handlePresence('presence.awake');
    } else if (command === 'sleep') {
      handlePresence('presence.sleeping');
    } else if (command === 'page.next') {
      nextPage();
    } else if (command === 'page.previous') {
      previousPage();
    } else if (command === 'reload') {
      location.reload();
    }
  }

  function nextPage() {
    stopRotation();
    const visible = getVisiblePageIndices(currentPersonId);
    const indices = visible.length > 0 ? visible : pages.map((_, i) => i);
    const idx = indices.indexOf(currentRotationIndex);
    const nextIdx = idx >= 0 ? (idx + 1) % indices.length : 0;
    currentRotationIndex = indices[nextIdx];
    showPage(currentRotationIndex);
  }

  function previousPage() {
    stopRotation();
    const visible = getVisiblePageIndices(currentPersonId);
    const indices = visible.length > 0 ? visible : pages.map((_, i) => i);
    const idx = indices.indexOf(currentRotationIndex);
    const prevIdx = idx >= 0 ? (idx - 1 + indices.length) % indices.length : indices.length - 1;
    currentRotationIndex = indices[prevIdx];
    showPage(currentRotationIndex);
  }

  bus.addEventListener('push:remote', event => {
    const { eventType } = event.detail || {};
    if (!eventType) return;
    if (eventType === 'page.next') nextPage();
    else if (eventType === 'page.previous') previousPage();
    else if (eventType === 'presence.awake') handlePresence('presence.awake');
    else if (eventType === 'presence.sleeping') handlePresence('presence.sleeping');
    else if (eventType === 'reload') location.reload();
  });

  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'push' && msg.moduleId) {
        bus.dispatchEvent(new CustomEvent(`push:${msg.moduleId}`, { detail: msg.data }));
      }
      if (msg.type === 'event' && msg.eventType) {
        bus.dispatchEvent(new CustomEvent(msg.eventType, { detail: msg.data }));
      }
      if (msg.type === 'presence.awake' || msg.type === 'presence.sleeping') {
        handlePresence(msg.type);
      }
      if (msg.type === 'face') {
        if (msg.event === 'detected' && msg.personId) {
          handleFaceChange(msg.personId);
        } else if (msg.event === 'unknown') {
          handleFaceChange('unknown');
        } else if (msg.event === 'lost' || msg.event === 'cleared') {
          handleFaceChange(null);
        }
      }
      if (msg.type === 'command') {
        handleCommand(msg.command, msg.data);
      }
      if (msg.type === 'config') {
        // Force a fresh load so cache does not keep the old layout.
        // Give the server a moment to finish writing config and restarting services.
        setTimeout(() => {
          location.href = `${location.origin}${location.pathname}?t=${Date.now()}`;
        }, 500);
      }
    };

    ws.onclose = () => {
      setTimeout(connectWebSocket, 3000);
    };

    ws.onopen = async () => {
      // If we reconnected, fetch the latest config and reload if the layout changed.
      try {
        const fresh = await fetch(`/api/config?v=${Date.now()}`).then(r => r.json());
        const freshJson = JSON.stringify(fresh.pages);
        const currentJson = JSON.stringify(pages);
        if (freshJson !== currentJson) {
          location.href = `${location.origin}${location.pathname}?t=${Date.now()}`;
        }
      } catch (err) {
        console.warn('Config refresh check failed:', err);
      }
    };
  }

  init();
})();
