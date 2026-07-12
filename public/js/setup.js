const GRID_COLS = 12;
const GRID_ROWS = 8;
const BUILTIN_MODULE_IDS = new Set([
  'airquality', 'calendar', 'clock', 'countdown', 'immich', 'rss',
  'spotify', 'systeminfo', 'ticker', 'todoist', 'traveltime', 'weather'
]);

let modules = [];
let config = {
  grid: { columns: GRID_COLS, rows: GRID_ROWS },
  rotation: { enabled: true, interval: 10 },
  faceLock: {
    enabled: false,
    confidenceThreshold: 0.6,
    releaseDelay: 3,
    showPreview: false,
    persons: [],
    defaultPage: 'Main',
    unknownPage: 'Main'
  },
  hardware: [],
  pages: [{ name: 'Main', modules: {} }]
};
let hardwareSchema = [];
let serialPorts = [];
let usbDevices = [];
let audioOutputs = [];
let currentPageIndex = 0;
let activeId = null;
let dragStart = null;
let resizeStart = null;

async function init() {
  [modules, config, hardwareSchema] = await Promise.all([
    fetch('/api/modules').then(r => r.json()),
    fetch('/api/config').then(r => r.json()),
    fetch('/api/hardware/schema').then(r => r.json()).catch(() => [])
  ]);

  serialPorts = await fetch('/api/serialports').then(r => r.json()).catch(() => []);
  usbDevices = await fetch('/api/usbdevices').then(r => r.json()).catch(() => []);
  audioOutputs = await fetch('/api/audiooutputs').then(r => r.json()).catch(() => []);

  if (!config.language) {
    config.language = config.voice?.language || 'en-US';
  }
  if (!config.grid) {
    config.grid = { columns: GRID_COLS, rows: GRID_ROWS };
  }
  if (!config.screen) {
    config.screen = { rotation: 'normal' };
  }
  if (!config.rotation) {
    config.rotation = { enabled: true, interval: 10 };
  }
  if (!config.faceLock) {
    config.faceLock = {
      enabled: false,
      confidenceThreshold: 0.6,
      releaseDelay: 3,
      showPreview: false,
      persons: [],
      defaultPage: 'Main',
      unknownPage: 'Main'
    };
  }
  if (!config.hardware) {
    config.hardware = [];
  }
  if (!config.pages || !Array.isArray(config.pages) || config.pages.length === 0) {
    config.pages = [{ name: 'Main', modules: config.modules || {} }];
  }

  bindSidebarEvents();
  bindTabEvents();
  bindSettingsCategoryEvents();
  bindConfigModalEvents();
  renderModuleList();
  renderGrid();
  updateGridOrientation();
  renderPageTabs();
  initPreviewToggle();
  renderPlacedModules();
  renderPageFaceSelect();
  renderFaceList();
  bindHardwareTabEvents();
  renderHardwareLists();
  renderUsbForm();
  renderAudioForm();
  renderGpioForm();
  updateJson();
  connectSetupWebSocket();
  updateFaceCameraStatus();
}

function currentPage() {
  return config.pages[currentPageIndex];
}

function initPreviewToggle() {
  const toggle = document.getElementById('preview-toggle');
  if (!toggle) return;
  toggle.checked = previewEnabled;
  toggle.addEventListener('change', () => setPreviewEnabled(toggle.checked));
}

function bindSidebarEvents() {
  document.getElementById('language').value = config.language || 'en-US';
  document.getElementById('rotation-enabled').checked = config.rotation.enabled;
  document.getElementById('rotation-interval').value = config.rotation.interval;
  document.getElementById('screen-rotation').checked = config.screen?.rotation !== 'normal';
  updateGridOrientation();
  document.getElementById('face-lock-enabled').checked = config.faceLock.enabled;
  document.getElementById('face-lock-release').value = config.faceLock.releaseDelay;
  document.getElementById('face-lock-preview').checked = config.faceLock.showPreview || false;
  document.getElementById('language').addEventListener('change', () => {
    config.language = document.getElementById('language').value || 'en-US';
    updateJson();
  });

  document.getElementById('rotation-enabled').addEventListener('change', () => {
    config.rotation.enabled = document.getElementById('rotation-enabled').checked;
    updateJson();
  });

  document.getElementById('rotation-interval').addEventListener('input', () => {
    const value = parseInt(document.getElementById('rotation-interval').value, 10);
    config.rotation.interval = isNaN(value) || value < 1 ? 1 : value;
    updateJson();
  });

  document.getElementById('screen-rotation').addEventListener('change', () => {
    config.screen = config.screen || {};
    config.screen.rotation = document.getElementById('screen-rotation').checked ? 'right' : 'normal';
    updateGridOrientation();
    updateJson();
  });

  document.getElementById('face-lock-enabled').addEventListener('change', () => {
    config.faceLock.enabled = document.getElementById('face-lock-enabled').checked;
    updateJson();
  });

  document.getElementById('face-lock-release').addEventListener('input', () => {
    const value = parseInt(document.getElementById('face-lock-release').value, 10);
    config.faceLock.releaseDelay = isNaN(value) || value < 1 ? 1 : value;
    updateJson();
  });

  document.getElementById('face-lock-preview').addEventListener('change', () => {
    config.faceLock.showPreview = document.getElementById('face-lock-preview').checked;
    updateJson();
  });

  document.getElementById('presence-enabled').checked = config.presence.enabled;
  document.getElementById('presence-source').value = config.presence.source || 'hardware';
  document.getElementById('presence-wake-events').value = (config.presence.wakeEvents || []).join(', ');
  document.getElementById('presence-sleep-events').value = (config.presence.sleepEvents || []).join(', ');
  document.getElementById('presence-timeout').value = config.presence.timeout;
  updatePresenceSourceFields();
  document.getElementById('presence-on-command').value = config.presence.display?.onCommand || '';
  document.getElementById('presence-off-command').value = config.presence.display?.offCommand || '';

  document.getElementById('voice-enabled').checked = config.voice.enabled;
  document.getElementById('voice-require-wake').checked = config.voice.requireWakeWord !== false;
  document.getElementById('voice-wake-word').value = config.voice.wakeWord || 'mirror';
  document.getElementById('voice-language').value = config.voice.language || 'en-US';
  document.getElementById('voice-commands').value = Object.entries(config.voice.commands || {})
    .map(([phrase, eventType]) => `${phrase}=${eventType}`)
    .join('\n');

  document.getElementById('mqtt-enabled').checked = config.mqtt.enabled;
  document.getElementById('mqtt-host').value = config.mqtt.broker?.host || 'localhost';
  document.getElementById('mqtt-port').value = config.mqtt.broker?.port || 1883;
  document.getElementById('mqtt-protocol').value = config.mqtt.broker?.protocol || 'mqtt';
  document.getElementById('mqtt-client-id').value = config.mqtt.broker?.clientId || 'openmirror';
  document.getElementById('mqtt-username').value = config.mqtt.broker?.username || '';
  document.getElementById('mqtt-password').value = config.mqtt.broker?.password || '';
  document.getElementById('mqtt-publish-hardware').value = config.mqtt.publish?.hardware || '';
  document.getElementById('mqtt-publish-presence').value = config.mqtt.publish?.presence || '';
  document.getElementById('mqtt-subscribe').value = (config.mqtt.subscribe || [])
    .map(s => `${s.topic}=${s.eventType}`)
    .join('\n');

  document.getElementById('voice-enabled').checked = config.voice.enabled;
  document.getElementById('voice-require-wake').checked = config.voice.requireWakeWord !== false;
  document.getElementById('voice-wake-word').value = config.voice.wakeWord || 'mirror';
  document.getElementById('voice-language').value = config.voice.language || 'en-US';
  document.getElementById('voice-commands').value = Object.entries(config.voice.commands || {})
    .map(([phrase, eventType]) => `${phrase}=${eventType}`)
    .join('\n');

  document.getElementById('voice-enabled').addEventListener('change', updateVoiceConfig);
  document.getElementById('voice-require-wake').addEventListener('change', updateVoiceConfig);
  document.getElementById('voice-wake-word').addEventListener('input', updateVoiceConfig);
  document.getElementById('voice-language').addEventListener('change', updateVoiceConfig);
  document.getElementById('voice-commands').addEventListener('input', updateVoiceConfig);

  document.getElementById('mqtt-enabled').addEventListener('change', updateMqttConfig);
  document.getElementById('mqtt-host').addEventListener('input', updateMqttConfig);
  document.getElementById('mqtt-port').addEventListener('input', updateMqttConfig);
  document.getElementById('mqtt-protocol').addEventListener('change', updateMqttConfig);
  document.getElementById('mqtt-client-id').addEventListener('input', updateMqttConfig);
  document.getElementById('mqtt-username').addEventListener('input', updateMqttConfig);
  document.getElementById('mqtt-password').addEventListener('input', updateMqttConfig);
  document.getElementById('mqtt-publish-hardware').addEventListener('input', updateMqttConfig);
  document.getElementById('mqtt-publish-presence').addEventListener('input', updateMqttConfig);
  document.getElementById('mqtt-subscribe').addEventListener('input', updateMqttConfig);

  document.getElementById('theme-background').value = config.theme?.background || '';
  document.getElementById('theme-custom-css').value = config.theme?.customCss || '';

  document.getElementById('theme-background').addEventListener('input', () => {
    config.theme = config.theme || {};
    config.theme.background = document.getElementById('theme-background').value.trim();
    updateJson();
  });

  document.getElementById('theme-custom-css').addEventListener('input', () => {
    config.theme = config.theme || {};
    config.theme.customCss = document.getElementById('theme-custom-css').value;
    updateJson();
  });

  document.getElementById('presence-enabled').addEventListener('change', () => {
    config.presence.enabled = document.getElementById('presence-enabled').checked;
    updateJson();
  });

  document.getElementById('presence-source').addEventListener('change', () => {
    config.presence.source = document.getElementById('presence-source').value || 'hardware';
    updatePresenceSourceFields();
    updateJson();
  });

  document.getElementById('presence-wake-events').addEventListener('input', () => {
    config.presence.wakeEvents = parseCommaList(document.getElementById('presence-wake-events').value);
    updateJson();
  });

  document.getElementById('presence-sleep-events').addEventListener('input', () => {
    config.presence.sleepEvents = parseCommaList(document.getElementById('presence-sleep-events').value);
    updateJson();
  });

  document.getElementById('presence-timeout').addEventListener('input', () => {
    const value = parseInt(document.getElementById('presence-timeout').value, 10);
    config.presence.timeout = isNaN(value) || value < 1 ? 1 : value;
    updateJson();
  });

  document.getElementById('presence-on-command').addEventListener('input', () => {
    config.presence.display = config.presence.display || {};
    config.presence.display.onCommand = document.getElementById('presence-on-command').value.trim();
    updateJson();
  });

  document.getElementById('presence-off-command').addEventListener('input', () => {
    config.presence.display = config.presence.display || {};
    config.presence.display.offCommand = document.getElementById('presence-off-command').value.trim();
    updateJson();
  });

  // SaaS / Cloud remote management
  const saas = config.saas || {};
  const saasTelemetry = saas.telemetry || {};
  document.getElementById('saas-enabled').checked = saas.enabled || false;
  document.getElementById('saas-backend-url').value = saas.backendUrl || 'wss://saas.openmirror.example/devices';
  document.getElementById('saas-license-key').value = saas.licenseKey || '';
  document.getElementById('saas-device-id').value = saas.deviceId || '';
  document.getElementById('saas-device-name').value = saas.deviceName || '';
  document.getElementById('saas-telemetry-hardware').checked = saasTelemetry.hardware || false;
  document.getElementById('saas-telemetry-presence').checked = saasTelemetry.presence || false;
  document.getElementById('saas-telemetry-face').checked = saasTelemetry.face || false;
  document.getElementById('saas-telemetry-mqtt').checked = saasTelemetry.mqtt || false;
  document.getElementById('saas-telemetry-all').checked = saasTelemetry.all || false;
  updateSaasStatusText();

  document.getElementById('saas-enabled').addEventListener('change', updateSaasConfig);
  document.getElementById('saas-backend-url').addEventListener('input', updateSaasConfig);
  document.getElementById('saas-license-key').addEventListener('input', updateSaasConfig);
  document.getElementById('saas-device-id').addEventListener('input', updateSaasConfig);
  document.getElementById('saas-device-name').addEventListener('input', updateSaasConfig);
  document.getElementById('saas-telemetry-hardware').addEventListener('change', updateSaasTelemetry);
  document.getElementById('saas-telemetry-presence').addEventListener('change', updateSaasTelemetry);
  document.getElementById('saas-telemetry-face').addEventListener('change', updateSaasTelemetry);
  document.getElementById('saas-telemetry-mqtt').addEventListener('change', updateSaasTelemetry);
  document.getElementById('saas-telemetry-all').addEventListener('change', updateSaasTelemetry);
  document.getElementById('saas-test-btn').addEventListener('click', testSaasConnection);

  document.getElementById('upload-face-btn').addEventListener('click', uploadFacePhotos);
  document.getElementById('face-test-btn').addEventListener('click', toggleFaceTest);

  document.getElementById('save-btn').addEventListener('click', saveConfig);
  const saveConfigBtn = document.getElementById('save-btn-config');
  if (saveConfigBtn) saveConfigBtn.addEventListener('click', saveConfig);
  document.getElementById('push-btn').addEventListener('click', pushToScreen);
}

async function saveConfig() {
  ignoreNextConfigReload = true;
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });
  const data = await res.json();
  alert(data.ok ? 'Layout saved!' : 'Failed to save layout');
}

async function pushToScreen() {
  const btn = document.getElementById('push-btn');
  btn.disabled = true;
  btn.textContent = 'Pushing…';
  try {
    const res = await fetch('/api/reload', { method: 'POST' });
    const data = await res.json();
    alert(data.ok ? 'Screen reload triggered.' : 'Failed to push to screen');
  } catch (err) {
    alert('Failed to push to screen: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Push to Screen';
  }
}

function bindConfigModalEvents() {
  document.getElementById('module-config-cancel').addEventListener('click', closeModuleConfig);
  document.getElementById('module-config-save').addEventListener('click', saveModuleConfig);
  // Keep the modal open when clicking outside; only the cancel/save buttons close it.
}

function bindTabEvents() {
  document.querySelectorAll('.top-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.top-tabs button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(`tab-${btn.dataset.tab}`);
      if (panel) panel.classList.add('active');
    });
  });
}

function bindSettingsCategoryEvents() {
  document.querySelectorAll('.settings-category').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.settingsCategory;
      document.querySelectorAll('.settings-category').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(`settings-panel-${category}`);
      if (panel) panel.classList.add('active');
    });
  });
}

function updateSidebarValues() {
  document.getElementById('language').value = config.language || 'en-US';
  document.getElementById('rotation-enabled').checked = config.rotation.enabled;
  document.getElementById('rotation-interval').value = config.rotation.interval;
  document.getElementById('face-lock-enabled').checked = config.faceLock.enabled;
  document.getElementById('face-lock-release').value = config.faceLock.releaseDelay;
  document.getElementById('face-lock-preview').checked = config.faceLock.showPreview || false;
  document.getElementById('presence-enabled').checked = config.presence.enabled;
  document.getElementById('presence-source').value = config.presence.source || 'hardware';
  document.getElementById('presence-wake-events').value = (config.presence.wakeEvents || []).join(', ');
  document.getElementById('presence-sleep-events').value = (config.presence.sleepEvents || []).join(', ');
  document.getElementById('presence-timeout').value = config.presence.timeout;
  document.getElementById('presence-on-command').value = config.presence.display?.onCommand || '';
  updatePresenceSourceFields();
  document.getElementById('presence-off-command').value = config.presence.display?.offCommand || '';
  document.getElementById('mqtt-enabled').checked = config.mqtt.enabled;
  document.getElementById('mqtt-host').value = config.mqtt.broker?.host || 'localhost';
  document.getElementById('mqtt-port').value = config.mqtt.broker?.port || 1883;
  document.getElementById('mqtt-protocol').value = config.mqtt.broker?.protocol || 'mqtt';
  document.getElementById('mqtt-client-id').value = config.mqtt.broker?.clientId || 'openmirror';
  document.getElementById('mqtt-username').value = config.mqtt.broker?.username || '';
  document.getElementById('mqtt-password').value = config.mqtt.broker?.password || '';
  document.getElementById('mqtt-publish-hardware').value = config.mqtt.publish?.hardware || '';
  document.getElementById('mqtt-publish-presence').value = config.mqtt.publish?.presence || '';
  document.getElementById('mqtt-subscribe').value = (config.mqtt.subscribe || [])
    .map(s => `${s.topic}=${s.eventType}`)
    .join('\n');

  const saas = config.saas || {};
  const saasTelemetry = saas.telemetry || {};
  document.getElementById('saas-enabled').checked = saas.enabled || false;
  document.getElementById('saas-backend-url').value = saas.backendUrl || 'wss://saas.openmirror.example/devices';
  document.getElementById('saas-license-key').value = saas.licenseKey || '';
  document.getElementById('saas-device-id').value = saas.deviceId || '';
  document.getElementById('saas-device-name').value = saas.deviceName || '';
  document.getElementById('saas-telemetry-hardware').checked = saasTelemetry.hardware || false;
  document.getElementById('saas-telemetry-presence').checked = saasTelemetry.presence || false;
  document.getElementById('saas-telemetry-face').checked = saasTelemetry.face || false;
  document.getElementById('saas-telemetry-mqtt').checked = saasTelemetry.mqtt || false;
  document.getElementById('saas-telemetry-all').checked = saasTelemetry.all || false;
  updateSaasStatusText();
}

function updateSaasConfig() {
  config.saas = config.saas || {};
  config.saas.enabled = document.getElementById('saas-enabled').checked;
  config.saas.backendUrl = document.getElementById('saas-backend-url').value.trim() || 'wss://saas.openmirror.example/devices';
  config.saas.licenseKey = document.getElementById('saas-license-key').value.trim();
  config.saas.deviceId = document.getElementById('saas-device-id').value.trim();
  config.saas.deviceName = document.getElementById('saas-device-name').value.trim();
  updateJson();
}

function updateSaasTelemetry() {
  config.saas = config.saas || {};
  config.saas.telemetry = {
    hardware: document.getElementById('saas-telemetry-hardware').checked,
    presence: document.getElementById('saas-telemetry-presence').checked,
    face: document.getElementById('saas-telemetry-face').checked,
    mqtt: document.getElementById('saas-telemetry-mqtt').checked,
    all: document.getElementById('saas-telemetry-all').checked
  };
  updateJson();
}

function updateSaasStatusText() {
  const el = document.getElementById('saas-status');
  if (!el) return;
  const saas = config.saas || {};
  if (!saas.enabled) {
    el.textContent = 'SaaS connection disabled.';
    return;
  }
  el.textContent = `Will connect to ${saas.backendUrl || '—'} as ${saas.deviceId || 'unnamed device'}. Save layout to apply.`;
}

async function testSaasConnection() {
  const statusEl = document.getElementById('saas-status');
  statusEl.textContent = 'Checking server status…';
  try {
    const res = await fetch('/api/saas/status');
    const data = await res.json();
    statusEl.textContent = `Local SaaS client: enabled=${data.enabled}, connected=${data.connected}, tier=${data.tier || '—'}`;
  } catch (err) {
    statusEl.textContent = 'Could not read SaaS status: ' + err.message;
  }
}

function updateVoiceConfig() {
  const commands = {};
  document.getElementById('voice-commands').value.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      commands[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });

  config.voice = {
    enabled: document.getElementById('voice-enabled').checked,
    wakeWord: document.getElementById('voice-wake-word').value.trim() || 'mirror',
    language: document.getElementById('voice-language').value.trim() || 'en-US',
    requireWakeWord: document.getElementById('voice-require-wake').checked,
    commands
  };
  updateJson();
}

function updateMqttConfig() {
  const port = parseInt(document.getElementById('mqtt-port').value, 10);
  config.mqtt = {
    enabled: document.getElementById('mqtt-enabled').checked,
    broker: {
      host: document.getElementById('mqtt-host').value.trim() || 'localhost',
      port: isNaN(port) ? 1883 : port,
      protocol: document.getElementById('mqtt-protocol').value,
      clientId: document.getElementById('mqtt-client-id').value.trim() || 'openmirror',
      username: document.getElementById('mqtt-username').value.trim(),
      password: document.getElementById('mqtt-password').value
    },
    publish: {
      hardware: document.getElementById('mqtt-publish-hardware').value.trim(),
      presence: document.getElementById('mqtt-publish-presence').value.trim()
    },
    subscribe: parseSubscribeText(document.getElementById('mqtt-subscribe').value)
  };
  updateJson();
}

function parseSubscribeText(value) {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('=');
      return {
        topic: parts[0].trim(),
        eventType: (parts[1] || parts[0]).trim()
      };
    });
}

function parseCommaList(value) {
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function renderModuleList() {
  const list = document.getElementById('module-list');
  const countBadge = document.getElementById('available-count');
  list.innerHTML = '';
  if (countBadge) countBadge.textContent = modules.length;
  modules.forEach(mod => {
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.id = mod.id;

    const info = document.createElement('span');
    const isBuiltin = BUILTIN_MODULE_IDS.has(mod.id);
    info.className = 'module-name';
    const displayName = isBuiltin ? mod.name : `${mod.name} (${mod.id})`;
    info.appendChild(document.createTextNode(displayName));
    if (!isBuiltin) {
      const badge = document.createElement('span');
      badge.className = 'module-custom-badge';
      badge.textContent = 'custom';
      info.appendChild(badge);
    }
    const version = document.createElement('span');
    version.className = 'module-version';
    version.textContent = `v${mod.version}`;
    info.appendChild(version);

    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.className = 'duplicate-btn';
    dupBtn.title = 'Duplicate as new module (own settings)';
    dupBtn.textContent = '+';
    dupBtn.addEventListener('click', e => {
      e.stopPropagation();
      duplicateModule(mod.id);
    });

    li.appendChild(info);
    li.appendChild(dupBtn);

    li.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', mod.id);
    });

    list.appendChild(li);
  });
}

function renderUsedModulesList() {
  const list = document.getElementById('used-module-list');
  const countBadge = document.getElementById('used-count');
  if (!list) return;
  list.innerHTML = '';

  const page = currentPage();
  const ids = Object.keys(page.modules || {});
  if (countBadge) countBadge.textContent = ids.length;

  if (ids.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No modules on this page yet.';
    list.appendChild(li);
    return;
  }

  ids
    .map(id => {
      const mod = modules.find(m => m.id === id);
      return { id, name: mod ? mod.name : id, hasConfig: mod && mod.configSchema && Object.keys(mod.configSchema).length > 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(({ id, name, hasConfig }) => {
      const li = document.createElement('li');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'module-name';
      nameSpan.textContent = name;
      nameSpan.title = id;

      const actions = document.createElement('span');
      actions.className = 'used-actions';

      if (hasConfig) {
        const cfgBtn = document.createElement('button');
        cfgBtn.type = 'button';
        cfgBtn.className = 'config-btn';
        cfgBtn.title = 'Configure';
        cfgBtn.textContent = '⚙';
        cfgBtn.addEventListener('click', e => {
          e.stopPropagation();
          openModuleConfig(id);
        });
        actions.appendChild(cfgBtn);
      }

      const rmBtn = document.createElement('button');
      rmBtn.type = 'button';
      rmBtn.className = 'remove-btn';
      rmBtn.title = 'Remove from page';
      rmBtn.textContent = '✕';
      rmBtn.addEventListener('click', e => {
        e.stopPropagation();
        removeModule(id);
      });
      actions.appendChild(rmBtn);

      li.appendChild(nameSpan);
      li.appendChild(actions);
      list.appendChild(li);
    });
}

async function duplicateModule(moduleId) {
  const newId = await promptDuplicateId(moduleId);
  if (!newId) return;
  await performDuplicate(moduleId, newId);
}

async function promptDuplicateId(moduleId) {
  const newId = prompt(`Create a separate copy of "${moduleId}" with its own settings and ID.\n\nEnter a new module ID (lowercase letters, numbers, dashes only):`);
  if (!newId) return null;

  if (!/^[a-z0-9-]+$/.test(newId)) {
    alert('Invalid ID. Use only lowercase letters, numbers, and dashes.');
    return promptDuplicateId(moduleId);
  }
  return newId;
}

async function performDuplicate(moduleId, newId) {
  try {
    const res = await fetch(`/api/modules/${encodeURIComponent(moduleId)}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'duplicate failed');

    modules = await fetch('/api/modules').then(r => r.json());
    renderModuleList();
    return newId;
  } catch (err) {
    alert(err.message);
    return null;
  }
}

function renderGrid() {
  const grid = document.getElementById('grid');
  grid.addEventListener('dragover', e => e.preventDefault());
  grid.addEventListener('drop', onDrop);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function updateGridOrientation() {
  const grid = document.getElementById('grid');
  const isPortrait = config.screen?.rotation !== 'normal';
  grid.classList.toggle('portrait', isPortrait);
}

function renderPageTabs() {
  const tabs = document.getElementById('page-tabs');
  tabs.innerHTML = '';

  config.pages.forEach((page, index) => {
    const tab = document.createElement('div');
    tab.className = 'page-tab' + (index === currentPageIndex ? ' active' : '');

    if (index === currentPageIndex) {
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'page-tab-input';
      nameInput.value = page.name || `Page ${index + 1}`;
      nameInput.addEventListener('click', e => e.stopPropagation());
      nameInput.addEventListener('input', () => {
        const oldName = page.name;
        page.name = nameInput.value || `Page ${index + 1}`;
        // Update face-to-page assignments that referenced the old name.
        (config.faceLock?.persons || []).forEach(person => {
          if (person.page === oldName) {
            person.page = page.name;
          }
        });
        renderPageFaceSelect();
        updateJson();
      });
      tab.appendChild(nameInput);

      if (config.pages.length > 1) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'page-tab-delete';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Delete page';
        deleteBtn.addEventListener('click', e => {
          e.stopPropagation();
          const deletedName = config.pages[index]?.name;
          config.pages.splice(index, 1);
          currentPageIndex = Math.min(currentPageIndex, config.pages.length - 1);
          (config.faceLock?.persons || []).forEach(person => {
            if (person.page === deletedName) {
              delete person.page;
            }
          });
          renderPageTabs();
          renderPlacedModules();
          renderPageFaceSelect();
          updateSidebarValues();
          updateJson();
        });
        tab.appendChild(deleteBtn);
      }
    } else {
      tab.textContent = page.name || `Page ${index + 1}`;
      tab.addEventListener('click', () => {
        currentPageIndex = index;
        renderPageTabs();
        renderPlacedModules();
        renderPageFaceSelect();
        updateSidebarValues();
      });
    }

    tabs.appendChild(tab);
  });

  const addBtn = document.createElement('div');
  addBtn.className = 'add-page-btn';
  addBtn.textContent = '+ Add page';
  addBtn.addEventListener('click', () => {
    config.pages.push({ name: `Page ${config.pages.length + 1}`, modules: {} });
    currentPageIndex = config.pages.length - 1;
    renderPageTabs();
    updateGridOrientation();
    renderPlacedModules();
    renderPageFaceSelect();
    updateSidebarValues();
    updateJson();
  });
  tabs.appendChild(addBtn);
}

function renderPageFaceSelect() {
  const select = document.getElementById('page-face-select');
  if (!select) return;

  const persons = config.faceLock?.persons || [];
  const currentPageName = config.pages[currentPageIndex]?.name;

  // Preserve current selection if it still exists.
  const currentValue = select.value;
  select.innerHTML = '<option value="">Anybody / always</option>';

  persons.forEach(person => {
    const option = document.createElement('option');
    option.value = person.id;
    option.textContent = person.name;
    option.selected = person.id === currentValue;
    select.appendChild(option);
  });

  // Reflect the person whose page matches the current page.
  const assigned = persons.find(p => p.page === currentPageName);
  if (assigned) {
    select.value = assigned.id;
  } else {
    select.value = '';
  }

  // One-time binding
  if (!select.dataset.bound) {
    select.dataset.bound = 'true';
    select.addEventListener('change', () => {
      const selectedId = select.value;
      const pageName = config.pages[currentPageIndex]?.name;
      if (!pageName) return;

      // Clear any existing assignment to this page (one page per face in the UI).
      (config.faceLock.persons || []).forEach(person => {
        if (person.page === pageName) {
          delete person.page;
        }
      });

      if (selectedId) {
        const person = (config.faceLock.persons || []).find(p => p.id === selectedId);
        if (person) {
          person.page = pageName;
        }
      }

      updateJson();
      renderFaceList();
    });
  }
}

async function renderFaceList() {
  const list = document.getElementById('face-list');
  const statusEl = document.getElementById('face-model-status');
  list.innerHTML = '';

  try {
    const [faces, model, training] = await Promise.all([
      fetch('/api/faces').then(r => r.json()),
      fetch('/api/faces/model').then(r => r.json()).catch(() => ({ ready: false, persons: 0 })),
      fetch('/api/faces/training').then(r => r.json()).catch(() => ({ state: 'idle' }))
    ]);

    statusEl.textContent = model.ready
      ? `Model ready: ${model.persons} person(s), algorithm: ${model.algorithm || 'LBPH'}`
      : 'No trained model yet. Upload photos and train a person.';

    // Refresh the page-face select because the available persons may have changed.
    renderPageFaceSelect();

    if (faces.length === 0) {
      list.innerHTML = '<li class="face-item"><span>No faces uploaded yet.</span></li>';
    }

    faces.forEach(face => {
      const item = document.createElement('li');
      item.className = 'face-item';
      const isTraining = training.state === 'training' && training.personId === face.id;
      item.innerHTML = `
        <span>${face.name} (${face.photoCount || 0} photo(s))</span>
        <span>
          <button class="train-face-btn" data-id="${face.id}" ${isTraining ? 'disabled' : ''}>
            ${isTraining ? 'Training…' : 'Train'}
          </button>
          <button class="delete-face-btn" data-id="${face.id}">Delete</button>
        </span>
      `;
      item.querySelector('.train-face-btn').addEventListener('click', () => trainFace(face.id, face.name));
      item.querySelector('.delete-face-btn').addEventListener('click', () => deleteFace(face.id));
      list.appendChild(item);
    });

    if (training.state === 'training' && !faceTrainingPollTimer) {
      startFaceTrainingPolling();
    }
  } catch (err) {
    list.innerHTML = '<li class="face-item"><span>Failed to load faces</span></li>';
  }
}

async function uploadFacePhotos() {
  const nameInput = document.getElementById('new-face-name');
  const fileInput = document.getElementById('new-face-photos');
  const uploadBtn = document.getElementById('upload-face-btn');
  const statusEl = document.getElementById('face-upload-status');

  const name = nameInput.value.trim();
  const files = Array.from(fileInput.files);

  if (!name) {
    alert('Please enter a name.');
    return;
  }
  if (files.length === 0) {
    alert('Please select at least one photo.');
    return;
  }

  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading…';
  statusEl.textContent = `Encoding ${files.length} photo(s)…`;

  try {
    const photos = [];
    for (let i = 0; i < files.length; i++) {
      const base64 = await fileToBase64(files[i]);
      photos.push({ filename: files[i].name, contentBase64: base64 });
      statusEl.textContent = `Encoding ${i + 1} / ${files.length} photos…`;
    }

    statusEl.textContent = `Saving ${files.length} photo(s)…`;
    const personId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const res = await fetch(`/api/faces/${personId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, photos })
    });

    let data;
    const responseText = await res.text();
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      const snippet = responseText.trim().substring(0, 120);
      throw new Error(snippet ? `Server returned unexpected response: ${snippet}` : 'Upload failed');
    }

    if (!res.ok) throw new Error(data.error || 'Upload failed');

    nameInput.value = '';
    fileInput.value = '';
    statusEl.textContent = `Saved ${data.saved} photo(s) for ${name}. Click Train to build the model.`;

    config.faceLock.persons = config.faceLock.persons.filter(p => p.id !== personId);
    config.faceLock.persons.push({ id: personId, name });

    renderFaceList();
    updateVisibleToOptions();
    updateJson();
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Upload failed: ' + err.message;
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload Photos';
  }
}

async function trainFace(personId, name) {
  const algorithmSelect = document.getElementById('face-algorithm');
  const algorithm = algorithmSelect.value;

  const statusCard = document.getElementById('face-training-status');
  const progressBar = document.getElementById('face-training-bar');
  const progressText = document.getElementById('face-training-text');

  statusCard.classList.remove('hidden');
  progressBar.style.width = '10%';
  progressText.textContent = 'Starting training…';

  try {
    const res = await fetch(`/api/faces/${personId}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, algorithm })
    });

    let data;
    const responseText = await res.text();
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      const snippet = responseText.trim().substring(0, 120);
      throw new Error(snippet ? `Server returned unexpected response: ${snippet}` : 'Training failed');
    }

    if (!res.ok) throw new Error(data.error || 'Training failed');

    config.faceLock.algorithm = algorithm;
    startFaceTrainingPolling();
  } catch (err) {
    console.error(err);
    progressText.textContent = 'Training failed: ' + err.message;
    progressBar.style.width = '0%';
  }
}

let faceTrainingPollTimer = null;

function startFaceTrainingPolling() {
  if (faceTrainingPollTimer) return;

  const statusCard = document.getElementById('face-training-status');
  const progressBar = document.getElementById('face-training-bar');
  const progressText = document.getElementById('face-training-text');
  const startedAt = Date.now();

  statusCard.classList.remove('hidden');

  async function tick() {
    try {
      const res = await fetch('/api/faces/training');
      const status = await res.json();

      if (status.state === 'training') {
        const elapsed = Math.round((Date.now() - (status.startedAt || startedAt)) / 1000);
        progressBar.style.width = '70%';
        progressText.textContent = `Training ${status.name || ''}… ${elapsed}s elapsed`;
        faceTrainingPollTimer = setTimeout(tick, 1000);
      } else if (status.state === 'error') {
        progressBar.style.width = '0%';
        progressText.textContent = 'Training failed: ' + (status.error || 'Unknown error');
        faceTrainingPollTimer = null;
        renderFaceList();
      } else {
        progressBar.style.width = '100%';
        const result = status.result || {};
        progressText.textContent = `Training complete. ${result.trainedImages || 0} photo(s) trained, ${result.totalPersons || 0} person(s) in model.`;
        faceTrainingPollTimer = null;
        renderFaceList();
        updateVisibleToOptions();
      }
    } catch (err) {
      console.error('Training status poll failed:', err);
      faceTrainingPollTimer = null;
    }
  }

  tick();
}

async function updateFaceCameraStatus() {
  const statusEl = document.getElementById('face-camera-status');
  try {
    const res = await fetch('/api/faces/camera');
    const data = await res.json();
    statusEl.textContent = `Camera ${data.camera} • ${data.width}x${data.height}${data.running ? ' • running' : ''}`;
  } catch (err) {
    statusEl.textContent = 'Camera status unavailable';
  }
}

let setupWebSocket = null;
let faceTestRunning = false;
let faceTestLostTimer = null;

function connectSetupWebSocket() {
  if (setupWebSocket) return;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  setupWebSocket = new WebSocket(`${protocol}//${location.host}/ws`);

  setupWebSocket.onmessage = event => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'face') {
        handleFaceTestEvent(msg);
      }
      if (msg.type === 'config') {
        // If this change came from our own save, skip the auto-reload.
        if (ignoreNextConfigReload) {
          ignoreNextConfigReload = false;
          return;
        }
        // Server config changed; refresh the page to stay in sync.
        setTimeout(() => {
          location.href = `${location.origin}${location.pathname}?t=${Date.now()}`;
        }, 500);
      }
    } catch (err) {
      console.error('WebSocket message parse error:', err);
    }
  };

  setupWebSocket.onclose = () => {
    setupWebSocket = null;
    setTimeout(connectSetupWebSocket, 3000);
  };
}

function handleFaceTestEvent(msg) {
  if (!faceTestRunning) return;
  const resultEl = document.getElementById('face-test-result');

  if (faceTestLostTimer) {
    clearTimeout(faceTestLostTimer);
    faceTestLostTimer = null;
  }

  if (msg.event === 'detected' && msg.personId) {
    const person = config.faceLock?.persons?.find(p => p.id === msg.personId);
    const name = person ? person.name : msg.personId;
    resultEl.textContent = `Detected: ${name} (confidence ${Math.round(msg.confidence || 0)})`;
    resultEl.style.color = '#4caf50';
  } else if (msg.event === 'unknown') {
    resultEl.textContent = 'Unknown face detected';
    resultEl.style.color = '#ff9800';
    scheduleFaceTestLost(resultEl);
  } else if (msg.event === 'lost' || msg.event === 'cleared') {
    resultEl.textContent = 'No face detected';
    resultEl.style.color = '';
  }
}

function scheduleFaceTestLost(resultEl) {
  faceTestLostTimer = setTimeout(() => {
    resultEl.textContent = 'No face detected';
    resultEl.style.color = '';
  }, 2000);
}

let faceTestPreviewTimer = null;
let faceTestPreviewLoaded = false;
let ignoreNextConfigReload = false;

function startFaceTestPreview() {
  const preview = document.getElementById('face-camera-preview');
  if (!preview) return;

  faceTestPreviewLoaded = false;
  preview.innerHTML = '';
  const status = document.createElement('span');
  status.className = 'camera-preview-placeholder';
  status.id = 'face-preview-status';
  status.textContent = 'Starting camera…';
  preview.appendChild(status);

  const img = document.createElement('img');
  img.alt = 'Camera preview';
  img.style.display = 'none';
  img.onload = () => {
    if (faceTestPreviewLoaded) return;
    faceTestPreviewLoaded = true;
    img.style.display = '';
    status.style.display = 'none';
  };
  preview.appendChild(img);

  const update = () => {
    img.src = `/api/faces/camera/preview?t=${Date.now()}`;
  };
  update();
  faceTestPreviewTimer = setInterval(update, 250);
}

function stopFaceTestPreview() {
  if (faceTestPreviewTimer) {
    clearInterval(faceTestPreviewTimer);
    faceTestPreviewTimer = null;
  }
  faceTestPreviewLoaded = false;
  const preview = document.getElementById('face-camera-preview');
  if (preview) {
    preview.innerHTML = '<span class="camera-preview-placeholder">Camera preview</span>';
  }
}

async function toggleFaceTest() {
  const btn = document.getElementById('face-test-btn');
  const resultEl = document.getElementById('face-test-result');

  if (faceTestRunning) {
    try {
      btn.disabled = true;
      await fetch('/api/faces/test/stop', { method: 'POST' });
      faceTestRunning = false;
      stopFaceTestPreview();
      btn.textContent = 'Start Test';
      resultEl.textContent = 'Test stopped.';
      resultEl.style.color = '';
    } catch (err) {
      resultEl.textContent = 'Failed to stop test: ' + err.message;
    } finally {
      btn.disabled = false;
    }
    return;
  }

  try {
    btn.disabled = true;
    resultEl.textContent = 'Starting recognition test…';
    const res = await fetch('/api/faces/test/start', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Test failed');
    faceTestRunning = true;
    btn.textContent = 'Stop Test';
    resultEl.textContent = 'Look at the camera…';
    startFaceTestPreview();
    updateFaceCameraStatus();
  } catch (err) {
    resultEl.textContent = 'Test failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function deleteFace(id) {
  if (!confirm('Delete this face?')) return;
  try {
    const res = await fetch(`/api/faces/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    config.faceLock.persons = config.faceLock.persons.filter(p => p.id !== id);
    renderFaceList();
    updateVisibleToOptions();
    updateJson();
  } catch (err) {
    alert('Failed to delete face');
  }
}

function updateVisibleToOptions() {
  // Re-render any open module config that contains a visibleTo field.
  if (configModuleId) {
    openModuleConfig(configModuleId);
  }
}

function updatePresenceSourceFields() {
  const source = document.getElementById('presence-source')?.value || 'hardware';
  const hardwareFields = document.getElementById('presence-hardware-fields');
  if (hardwareFields) {
    hardwareFields.classList.toggle('hidden', source !== 'hardware');
  }
}

function bindHardwareTabEvents() {
  document.querySelectorAll('.hardware-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hardware-tabs button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.hw-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(`hw-panel-${btn.dataset.hwTab}`);
      if (panel) panel.classList.add('active');
      if (btn.dataset.hwTab === 'usb') renderUsbSettings();
    });
  });

  document.getElementById('add-usb-btn').addEventListener('click', addUsbDevice);
  document.getElementById('add-audio-btn').addEventListener('click', addAudioDevice);
  document.getElementById('audio-volume').addEventListener('input', setAudioVolume);
  document.getElementById('test-audio-btn').addEventListener('click', testAudioDevice);
  document.getElementById('add-gpio-pin-btn').addEventListener('click', () => addGpioPinRow());
  document.getElementById('add-gpio-btn').addEventListener('click', addGpioDevice);
}

function renderHardwareLists() {
  renderUsbList();
  renderAudioList();
  renderGpioList();
}

function renderUsbList() {
  const list = document.getElementById('usb-list');
  list.innerHTML = '';

  config.hardware
    .filter(d => getHardwareCategory(d.type) === 'usb')
    .forEach(device => {
      const item = document.createElement('li');
      item.className = 'hardware-item';
      const devInfo = device.settings?.usbDevice ? `(${device.settings.usbDevice})` : '';
      const schema = hardwareSchema.find(s => s.type === device.type);
      const roleName = schema?.name || device.type;
      item.innerHTML = `
        <span>
          ${device.name}
          <small>${roleName} ${devInfo}</small>
        </span>
        <button data-id="${device.id}">Delete</button>
      `;
      item.querySelector('button').addEventListener('click', () => deleteHardware(device.id));
      list.appendChild(item);
    });
}

function renderAudioList() {
  const list = document.getElementById('audio-list');
  list.innerHTML = '';

  config.hardware
    .filter(d => getHardwareCategory(d.type) === 'audio')
    .forEach(device => {
      const item = document.createElement('li');
      item.className = 'hardware-item';
      const outputInfo = device.settings?.audioOutput ? `(${device.settings.audioOutput})` : '';
      item.innerHTML = `
        <span>
          ${device.name}
          <small>Speaker ${outputInfo}</small>
        </span>
        <button data-id="${device.id}">Delete</button>
      `;
      item.querySelector('button').addEventListener('click', () => deleteHardware(device.id));
      list.appendChild(item);
    });
}

function renderGpioList() {
  const list = document.getElementById('gpio-list');
  list.innerHTML = '';

  config.hardware
    .filter(d => getHardwareCategory(d.type) === 'gpio')
    .forEach(device => {
      const item = document.createElement('li');
      item.className = 'hardware-item';
      const pins = (device.settings?.pins || []).map(p => p.pin).join(', ');
      item.innerHTML = `
        <span>
          ${device.name}
          <small>GPIO Pins: ${pins}</small>
        </span>
        <button data-id="${device.id}">Delete</button>
      `;
      item.querySelector('button').addEventListener('click', () => deleteHardware(device.id));
      list.appendChild(item);
    });
}

function getHardwareCategory(type) {
  const schema = hardwareSchema.find(s => s.type === type);
  return schema?.category || type;
}

function renderUsbForm() {
  const deviceSelect = document.getElementById('usb-device');
  deviceSelect.innerHTML = '';
  if (usbDevices.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No USB devices found';
    deviceSelect.appendChild(option);
  } else {
    usbDevices.forEach(dev => {
      const option = document.createElement('option');
      option.value = dev.id;
      option.textContent = `${dev.name} [${dev.vendorId}:${dev.productId}]`;
      deviceSelect.appendChild(option);
    });
  }

  const roleSelect = document.getElementById('usb-role');
  const currentRole = roleSelect.value || 'microphone';
  roleSelect.innerHTML = '';
  const usbSchemas = (hardwareSchema || []).filter(s => s.category === 'usb');
  usbSchemas.forEach(schema => {
    const option = document.createElement('option');
    option.value = schema.type;
    option.textContent = schema.name;
    roleSelect.appendChild(option);
  });
  roleSelect.value = usbSchemas.find(s => s.type === currentRole) ? currentRole : (usbSchemas[0]?.type || '');

  if (!roleSelect.dataset.bound) {
    roleSelect.dataset.bound = 'true';
    roleSelect.addEventListener('change', () => renderUsbSettings());
  }

  renderUsbSettings();
}

function renderUsbSettings() {
  const role = document.getElementById('usb-role').value;
  const settingsContainer = document.getElementById('usb-settings');
  settingsContainer.innerHTML = '';

  const schema = (hardwareSchema || []).find(s => s.type === role);
  if (!schema || !schema.settings) return;

  Object.entries(schema.settings).forEach(([key, field]) => {
    if (key === 'usbDevice') return;
    const label = document.createElement('label');
    label.className = 'input-label';
    label.textContent = field.label;

    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      (field.options || []).forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        input.appendChild(option);
      });
    } else {
      input = document.createElement('input');
      input.type = field.type === 'number' ? 'number' : 'text';
    }
    input.id = `usb-setting-${key}`;
    if (field.default !== undefined) input.value = field.default;
    label.appendChild(input);
    settingsContainer.appendChild(label);
  });
}

function addUsbDevice() {
  const deviceId = document.getElementById('usb-device').value;
  const role = document.getElementById('usb-role').value;
  const name = document.getElementById('usb-name').value.trim();

  if (!deviceId) {
    alert('Please select a USB device.');
    return;
  }
  if (!name) {
    alert('Please enter a name.');
    return;
  }

  const settings = { usbDevice: deviceId };
  document.querySelectorAll('#usb-settings input, #usb-settings select').forEach(input => {
    const key = input.id.replace('usb-setting-', '');
    const field = hardwareSchema.find(s => s.type === role)?.settings?.[key];
    let value = input.value;
    if (field?.type === 'number') value = parseInt(value, 10) || 0;
    settings[key] = value;
  });

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  config.hardware.push({ id, name, type: role, enabled: true, settings });

  document.getElementById('usb-name').value = '';
  renderUsbList();
  updateJson();
  saveConfig();
}

function renderAudioForm() {
  const select = document.getElementById('audio-output');
  select.innerHTML = '';
  if (audioOutputs.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No audio outputs found';
    select.appendChild(option);
  } else {
    audioOutputs.forEach(dev => {
      const option = document.createElement('option');
      option.value = dev.id;
      option.textContent = dev.name;
      select.appendChild(option);
    });
  }
}

function addAudioDevice() {
  const outputId = document.getElementById('audio-output').value;
  const name = document.getElementById('audio-name').value.trim();

  if (!outputId) {
    alert('Please select an audio output.');
    return;
  }
  if (!name) {
    alert('Please enter a name.');
    return;
  }

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  config.hardware.push({
    id,
    name,
    type: 'speaker',
    enabled: true,
    settings: { audioOutput: outputId }
  });

  document.getElementById('audio-name').value = '';
  renderAudioList();
  updateSelectedAudioControls();
  updateJson();
  saveConfig();
}

function updateSelectedAudioControls() {
  const outputId = document.getElementById('audio-output').value;
  const controls = document.getElementById('audio-controls');
  const device = config.hardware.find(d => d.type === 'speaker' && d.settings?.audioOutput === outputId);
  controls.classList.toggle('hidden', !device);
}

async function setAudioVolume() {
  const outputId = document.getElementById('audio-output').value;
  const device = config.hardware.find(d => d.type === 'speaker' && d.settings?.audioOutput === outputId);
  if (!device) return;

  const volume = document.getElementById('audio-volume').value;
  try {
    await fetch(`/api/hardware/speaker/${device.id}/volume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume: parseInt(volume, 10) })
    });
  } catch (err) {
    console.error('Set volume failed:', err);
  }
}

async function testAudioDevice() {
  const outputId = document.getElementById('audio-output').value;
  const device = config.hardware.find(d => d.type === 'speaker' && d.settings?.audioOutput === outputId);
  if (!device) return;

  try {
    await fetch(`/api/hardware/speaker/${device.id}/test`, { method: 'POST' });
  } catch (err) {
    console.error('Test audio failed:', err);
  }
}

let gpioPinCounter = 0;

function renderGpioForm() {
  const container = document.getElementById('gpio-pins');
  container.innerHTML = '';
  gpioPinCounter = 0;
  addGpioPinRow();
}

function addGpioPinRow(values = {}) {
  gpioPinCounter++;
  const container = document.getElementById('gpio-pins');
  const row = document.createElement('div');
  row.className = 'pin-row';
  row.dataset.index = gpioPinCounter;
  row.innerHTML = `
    <label class="input-label">
      Pin
      <input type="number" data-pin="pin" value="${values.pin || ''}" placeholder="17">
    </label>
    <label class="input-label">
      Edge
      <select data-pin="edge">
        <option value="both" ${values.edge === 'both' ? 'selected' : ''}>both</option>
        <option value="rising" ${values.edge === 'rising' ? 'selected' : ''}>rising</option>
        <option value="falling" ${values.edge === 'falling' ? 'selected' : ''}>falling</option>
      </select>
    </label>
    <label class="input-label">
      Event
      <input type="text" data-pin="event" value="${values.event || ''}" placeholder="motion.detected">
    </label>
    <button type="button" class="remove-pin-btn">x</button>
  `;
  row.querySelector('.remove-pin-btn').addEventListener('click', () => {
    row.remove();
  });
  container.appendChild(row);
}

function addGpioDevice() {
  const name = document.getElementById('gpio-name').value.trim();
  if (!name) {
    alert('Please enter a name.');
    return;
  }

  const pins = [];
  document.querySelectorAll('#gpio-pins .pin-row').forEach(row => {
    const pin = parseInt(row.querySelector('[data-pin="pin"]').value, 10);
    const edge = row.querySelector('[data-pin="edge"]').value;
    const event = row.querySelector('[data-pin="event"]').value.trim();
    if (!isNaN(pin) && event) {
      pins.push({ pin, edge, event });
    }
  });

  if (pins.length === 0) {
    alert('Please add at least one pin.');
    return;
  }

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  config.hardware.push({
    id,
    name,
    type: 'gpio',
    enabled: true,
    settings: { pins }
  });

  document.getElementById('gpio-name').value = '';
  renderGpioForm();
  renderGpioList();
  updateJson();
  saveConfig();
}

function deleteHardware(id) {
  if (!confirm('Delete this hardware device?')) return;
  config.hardware = config.hardware.filter(d => d.id !== id);
  renderHardwareLists();
  updateJson();
  saveConfig();
}

async function onDrop(e) {
  e.preventDefault();
  let id = e.dataTransfer.getData('text/plain');
  if (!id) return;

  const page = currentPage();
  if (page.modules[id]) {
    const newId = await promptDuplicateId(id);
    if (!newId) return;
    const duplicated = await performDuplicate(id, newId);
    if (!duplicated) return;
    id = newId;
  }

  const grid = document.getElementById('grid');
  const rect = grid.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * GRID_COLS;
  const y = (e.clientY - rect.top) / rect.height * GRID_ROWS;

  page.modules[id] = {
    x: clamp(snap(x), 0, GRID_COLS - 3),
    y: clamp(snap(y), 0, GRID_ROWS - 2),
    width: 3,
    height: 2,
    config: {}
  };

  renderPlacedModules();
  updateJson();
  openModuleConfig(id);
}

let previewEnabled = localStorage.getItem('openmirror.previewEnabled') === 'true';

function setPreviewEnabled(enabled) {
  previewEnabled = enabled;
  localStorage.setItem('openmirror.previewEnabled', String(enabled));
  const toggle = document.getElementById('preview-toggle');
  if (toggle) toggle.checked = enabled;
  renderPlacedModules();
}

function renderPlacedModules() {
  const grid = document.getElementById('grid');
  grid.querySelectorAll('.placed-module').forEach(el => el.remove());

  const page = currentPage();
  if (!page || !page.modules) return;

  Object.entries(page.modules).forEach(([id, placement]) => {
    const mod = modules.find(m => m.id === id);
    const el = document.createElement('div');
    el.className = 'placed-module';
    el.dataset.id = id;
    const hasConfig = mod && mod.configSchema && Object.keys(mod.configSchema).length > 0;
    el.innerHTML = `
      <div class="placed-module-header">
        <strong>${mod ? mod.name : id}</strong>
        ${hasConfig ? `<button class="config-btn" data-id="${id}" title="Configure">⚙</button>` : ''}
        <button class="remove-btn" data-id="${id}">x</button>
      </div>
      <div class="placed-module-preview" data-preview="${id}"></div>
      <div class="resize-handle" data-id="${id}"></div>
    `;
    applyStyle(el, placement);

    el.addEventListener('mousedown', e => {
      if (e.target.closest('.remove-btn') || e.target.closest('.resize-handle') || e.target.closest('.config-btn')) return;
      startDrag(e, id, el);
    });

    if (hasConfig) {
      el.querySelector('.config-btn').addEventListener('click', e => {
        e.stopPropagation();
        openModuleConfig(id);
      });
    }

    el.querySelector('.resize-handle').addEventListener('mousedown', e => {
      e.stopPropagation();
      startResize(e, id, el);
    });

    el.querySelector('.remove-btn').addEventListener('click', () => removeModule(id));
    grid.appendChild(el);

    if (previewEnabled) {
      loadModulePreview(id, placement, el.querySelector('.placed-module-preview'));
    }
  });

  renderUsedModulesList();
}

async function loadModulePreview(id, placement, container) {
  const mod = modules.find(m => m.id === id);
  if (!mod) return;

  try {
    const [html, css] = await Promise.all([
      fetch(`/api/module/${id}/${mod.view}?v=${Date.now()}`).then(r => r.text()).catch(() => ''),
      fetch(`/api/module/${id}/${mod.style}?v=${Date.now()}`).then(r => r.text()).catch(() => '')
    ]);

    const wrapper = document.createElement('div');
    wrapper.className = `module module-${id}`;
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';

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

    const styleEl = document.createElement('style');
    styleEl.textContent = css;

    container.innerHTML = '';
    container.appendChild(styleEl);
    container.appendChild(wrapper);

    if (mod.main) {
      const moduleConfig = placement.config || {};
      import(`/api/module/${id}/${mod.main}?v=${Date.now()}`)
        .then(m => {
          const instance = m.default({ container: wrapper, config: moduleConfig, bus: new EventTarget() });
          container._previewInstance = instance;
        })
        .catch(err => {
          console.warn(`Preview failed for ${id}:`, err);
        });
    }
  } catch (err) {
    console.warn(`Preview load failed for ${id}:`, err);
  }
}

function applyStyle(el, placement) {
  el.style.left = `${placement.x / GRID_COLS * 100}%`;
  el.style.top = `${placement.y / GRID_ROWS * 100}%`;
  el.style.width = `${placement.width / GRID_COLS * 100}%`;
  el.style.height = `${placement.height / GRID_ROWS * 100}%`;
}

let configModuleId = null;

function openModuleConfig(id) {
  const mod = modules.find(m => m.id === id);
  if (!mod || !mod.configSchema) return;

  configModuleId = id;
  const placement = currentPage().modules[id];
  const currentConfig = placement.config || {};
  const form = document.getElementById('module-config-form');
  const title = document.getElementById('module-config-title');

  title.textContent = `${mod.name} Settings`;
  form.innerHTML = '';

  Object.entries(mod.configSchema).forEach(([key, field]) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'config-field';

    const label = document.createElement('label');
    label.className = 'input-label';
    label.textContent = field.label || key;

    let input;
    if (field.type === 'number') {
      input = document.createElement('input');
      input.type = 'number';
      input.dataset.key = key;
      input.value = currentConfig[key] !== undefined ? currentConfig[key] : (field.default !== undefined ? field.default : '');
    } else if (field.type === 'select') {
      input = document.createElement('select');
      input.dataset.key = key;
      (field.options || []).forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label || opt.value;
        input.appendChild(option);
      });
      input.value = currentConfig[key] !== undefined ? currentConfig[key] : (field.default !== undefined ? field.default : '');
    } else if (field.type === 'checkbox') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.key = key;
      const defaultChecked = field.default === true;
      input.checked = currentConfig[key] !== undefined ? !!currentConfig[key] : defaultChecked;
    } else if (field.type === 'textarea') {
      input = document.createElement('textarea');
      input.dataset.key = key;
      input.rows = field.rows || 3;
      input.value = currentConfig[key] !== undefined ? currentConfig[key] : (field.default !== undefined ? field.default : '');
    } else if (field.type === 'file') {
      const fileRow = document.createElement('div');
      fileRow.className = 'file-field-row';

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.dataset.key = key;
      fileInput.accept = field.accept || '.ics';
      fileInput.className = 'file-input';

      const urlKey = Object.keys(mod.configSchema).find(k => k.toLowerCase().includes('url'));
      const urlInput = urlKey ? form.querySelector(`[data-key="${urlKey}"]`) : null;

      const currentFileName = currentConfig[key] || '';
      const currentFileSpan = document.createElement('span');
      currentFileSpan.className = 'current-file';
      currentFileSpan.textContent = currentFileName ? `Current: ${currentFileName}` : '';

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        try {
          const base64 = await fileToBase64(file);
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, contentBase64: base64 })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'upload failed');
          fileInput.dataset.value = data.name;
          currentFileSpan.textContent = `Current: ${data.name}`;
          if (urlInput) {
            urlInput.value = data.url;
            urlInput.dispatchEvent(new Event('input'));
          }
        } catch (err) {
          alert('Upload failed: ' + err.message);
          fileInput.value = '';
        }
      });

      fileRow.appendChild(fileInput);
      fileRow.appendChild(currentFileSpan);
      input = fileRow;
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.dataset.key = key;
      input.value = currentConfig[key] !== undefined ? currentConfig[key] : (field.default !== undefined ? field.default : '');
      if (field.placeholder) input.placeholder = field.placeholder;
    }

    if (field.type === 'checkbox') {
      label.textContent = '';
      label.classList.remove('input-label');
      label.classList.add('checkbox-label');
      label.appendChild(input);
      const checkboxText = document.createElement('span');
      checkboxText.textContent = field.label || key;
      label.appendChild(checkboxText);
    } else {
      label.appendChild(input);
    }
    wrapper.appendChild(label);

    if (field.description) {
      const desc = document.createElement('p');
      desc.className = 'field-description';
      desc.textContent = field.description;
      wrapper.appendChild(desc);
    }

    form.appendChild(wrapper);
  });

  renderVisibleToField(form, currentConfig, mod);

  document.getElementById('module-config-modal').classList.remove('hidden');
}

function renderVisibleToField(form, currentConfig, mod) {
  if (mod?.configSchema?.visibleTo) return;
  const persons = config.faceLock?.persons || [];
  if (persons.length === 0) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'config-field';

  const label = document.createElement('label');
  label.className = 'input-label';
  label.textContent = 'Visible to';

  const currentValue = currentConfig.visibleTo;
  const currentIds = Array.isArray(currentValue)
    ? currentValue
    : (currentValue && currentValue !== 'all' ? [currentValue] : []);

  const allCheckbox = document.createElement('label');
  allCheckbox.className = 'checkbox-label';
  const allInput = document.createElement('input');
  allInput.type = 'checkbox';
  allInput.dataset.key = 'visibleTo';
  allInput.value = 'all';
  allInput.checked = currentIds.length === 0;
  allCheckbox.appendChild(allInput);
  const allText = document.createElement('span');
  allText.textContent = 'All users / anybody';
  allCheckbox.appendChild(allText);
  wrapper.appendChild(allCheckbox);

  const personCheckboxes = [];
  persons.forEach(person => {
    const row = document.createElement('label');
    row.className = 'checkbox-label';
    row.style.marginLeft = '1rem';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.key = 'visibleTo';
    input.value = person.id;
    input.checked = currentIds.includes(person.id);
    input.disabled = currentIds.length === 0;
    personCheckboxes.push(input);
    row.appendChild(input);
    const text = document.createElement('span');
    text.textContent = person.name;
    row.appendChild(text);
    wrapper.appendChild(row);
  });

  allInput.addEventListener('change', () => {
    personCheckboxes.forEach(cb => {
      cb.disabled = allInput.checked;
      if (allInput.checked) cb.checked = false;
    });
  });

  personCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      const anyChecked = personCheckboxes.some(c => c.checked);
      allInput.checked = !anyChecked;
      personCheckboxes.forEach(c => c.disabled = !anyChecked ? false : false);
    });
  });

  label.appendChild(wrapper);
  form.appendChild(label);

  const desc = document.createElement('p');
  desc.className = 'field-description';
  desc.textContent = 'Show this module only for the selected users, or for everybody.';
  form.appendChild(desc);
}

function closeModuleConfig() {
  configModuleId = null;
  document.getElementById('module-config-modal').classList.add('hidden');
}

function saveModuleConfig() {
  if (!configModuleId) return;
  const placement = currentPage().modules[configModuleId];
  if (!placement) return;

  const mod = modules.find(m => m.id === configModuleId);
  const newConfig = {};

  // Collect multi-select checkboxes first.
  const visibleToAll = document.querySelector('#module-config-form [data-key="visibleTo"][value="all"]');
  const visibleToPersons = Array.from(document.querySelectorAll('#module-config-form [data-key="visibleTo"]:not([value="all"])'));

  document.querySelectorAll('#module-config-form [data-key]').forEach(input => {
    const key = input.dataset.key;
    if (key === 'visibleTo') return; // handled separately below

    const field = mod.configSchema[key];
    if (field && field.type === 'file') {
      const fileInput = input.querySelector('.file-input');
      newConfig[key] = fileInput?.dataset.value || placement.config?.[key] || '';
      return;
    }
    let value = input.value;
    if (field && field.type === 'checkbox') {
      value = input.checked;
    } else if (field && field.type === 'number') {
      const normalized = value.replace(',', '.');
      const num = parseFloat(normalized);
      value = isNaN(num) ? (field.default !== undefined ? field.default : 0) : num;
    }
    newConfig[key] = value;
  });

  if (visibleToAll) {
    const selectedPersons = visibleToPersons.filter(cb => cb.checked).map(cb => cb.value);
    newConfig.visibleTo = selectedPersons.length > 0 ? selectedPersons : 'all';
  }

  placement.config = newConfig;
  closeModuleConfig();
  renderPlacedModules();
  updateJson();
}

function removeModule(id) {
  delete currentPage().modules[id];
  renderPlacedModules();
  updateJson();
}

function startDrag(e, id, el) {
  e.preventDefault();
  activeId = id;
  const grid = document.getElementById('grid');
  const rect = grid.getBoundingClientRect();
  dragStart = {
    mouseX: e.clientX,
    mouseY: e.clientY,
    startX: currentPage().modules[id].x,
    startY: currentPage().modules[id].y,
    gridWidth: rect.width,
    gridHeight: rect.height,
    el
  };
  resizeStart = null;
}

function startResize(e, id, el) {
  e.preventDefault();
  activeId = id;
  const grid = document.getElementById('grid');
  const rect = grid.getBoundingClientRect();
  resizeStart = {
    mouseX: e.clientX,
    mouseY: e.clientY,
    startWidth: currentPage().modules[id].width,
    startHeight: currentPage().modules[id].height,
    gridWidth: rect.width,
    gridHeight: rect.height,
    el
  };
  dragStart = null;
}

function onMouseMove(e) {
  if (!activeId) return;
  const placement = currentPage().modules[activeId];

  if (dragStart) {
    const dx = (e.clientX - dragStart.mouseX) / dragStart.gridWidth * GRID_COLS;
    const dy = (e.clientY - dragStart.mouseY) / dragStart.gridHeight * GRID_ROWS;
    placement.x = clamp(snap(dragStart.startX + dx), 0, GRID_COLS - placement.width);
    placement.y = clamp(snap(dragStart.startY + dy), 0, GRID_ROWS - placement.height);
    applyStyle(dragStart.el, placement);
  } else if (resizeStart) {
    const dw = (e.clientX - resizeStart.mouseX) / resizeStart.gridWidth * GRID_COLS;
    const dh = (e.clientY - resizeStart.mouseY) / resizeStart.gridHeight * GRID_ROWS;
    placement.width = clamp(snap(resizeStart.startWidth + dw), 1, GRID_COLS - placement.x);
    placement.height = clamp(snap(resizeStart.startHeight + dh), 1, GRID_ROWS - placement.y);
    applyStyle(resizeStart.el, placement);
  }

  updateJson();
}

function onMouseUp() {
  activeId = null;
  dragStart = null;
  resizeStart = null;
}

function snap(value) {
  return Math.round(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateJson() {
  document.getElementById('config-json').textContent = JSON.stringify(config, null, 2);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

init();
