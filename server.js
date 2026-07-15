const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const { URL } = require('url');
const HardwareService = require('./services/hardware');
const PresenceService = require('./services/presence');
const MqttService = require('./services/mqtt');
const FaceService = require('./services/face');
const SaasService = require('./services/saas');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const CONFIG_PATH = path.join(__dirname, 'config', 'config.json');
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'config', 'default.json');
const MODULES_DIR = path.join(__dirname, 'modules');
const BUILTIN_MODULES = new Set([
  'airquality', 'calendar', 'clock', 'countdown', 'immich', 'pollen',
  'rss', 'spotify', 'systeminfo', 'ticker', 'todoist', 'traveltime', 'weather'
]);
const FACES_DIR = path.join(__dirname, 'data', 'faces');
const HARDWARE_SCHEMA_PATH = path.join(__dirname, 'config', 'hardware-schema.json');

// Face training uploads can be large (many base64 photos).
// Register this BEFORE the global JSON parser so the higher limit is used.
app.use('/api/faces', express.json({ limit: '100mb' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));
app.use('/api/module', express.static(path.join(__dirname, 'modules'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

let config = loadConfig();
const hardware = new HardwareService(config);
const presence = new PresenceService(config);
const mqttService = new MqttService(config);
const faceService = new FaceService(config);
const saasService = new SaasService(config, {
  applyConfig: applyConfig,
  broadcastCommand: (command, data) => broadcast({ type: 'command', command, data }),
  log: (level, message) => console.log(`[saas] ${message}`)
});

function loadConfig() {
  const source = fs.existsSync(CONFIG_PATH) ? CONFIG_PATH : DEFAULT_CONFIG_PATH;
  return JSON.parse(fs.readFileSync(source, 'utf8'));
}

function saveConfig(newConfig) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
}

function applyConfig(newConfig) {
  saveConfig(newConfig);
  config = newConfig;
  // Tell all connected browsers to reload before restarting services.
  broadcast({ type: 'config', data: newConfig });
  mqttService.stop();
  presence.stop();
  faceService.stop();
  hardware.stop();
  saasService.stop();
  hardware.setConfig(newConfig);
  presence.setConfig(newConfig);
  mqttService.setConfig(newConfig);
  faceService.setConfig(newConfig);
  saasService.setConfig(newConfig);
  hardware.start();
  presence.start({ hardware, faceService });
  mqttService.start();
  faceService.start();
  saasService.start();
}

function getModules() {
  if (!fs.existsSync(MODULES_DIR)) return [];
  return fs.readdirSync(MODULES_DIR)
    .filter(name => {
      const itemPath = path.join(MODULES_DIR, name);
      const manifestPath = path.join(itemPath, 'manifest.json');
      return fs.statSync(itemPath).isDirectory() && fs.existsSync(manifestPath);
    })
    .map(name => {
      const manifestPath = path.join(MODULES_DIR, name, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return { id: name, ...manifest };
    });
}

function getFaces() {
  if (!fs.existsSync(FACES_DIR)) return [];
  return fs.readdirSync(FACES_DIR)
    .filter(id => fs.statSync(path.join(FACES_DIR, id)).isDirectory())
    .map(id => {
      const labelPath = path.join(FACES_DIR, id, 'label.json');
      if (!fs.existsSync(labelPath)) return null;
      const data = JSON.parse(fs.readFileSync(labelPath, 'utf8'));
      const originalDir = path.join(FACES_DIR, id, 'photos', 'original');
      const photoCount = fs.existsSync(originalDir)
        ? fs.readdirSync(originalDir).filter(f => fs.statSync(path.join(originalDir, f)).isFile()).length
        : 0;
      return { id, name: data.name, photoCount };
    })
    .filter(Boolean);
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

hardware.on('event', event => {
  broadcast(event);
  mqttService.publishHardware(event);
});
presence.on('presence', event => {
  broadcast(event);
  mqttService.publishPresence(event.type);
});
mqttService.on('event', event => broadcast(event));
faceService.on('face', event => {
  broadcast({ type: 'face', event: event.type, personId: event.personId, confidence: event.confidence, message: event.message });
  saasService.reportEvent('face.' + event.type, event);
  if (event.type === 'detected') {
    presence.wake();
  }
});

hardware.on('event', event => saasService.reportEvent(event.type || 'hardware.event', event));
presence.on('presence', event => saasService.reportEvent(event.type || 'presence.event', event));
mqttService.on('event', event => saasService.reportEvent(event.type || 'mqtt.event', event));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: require('./package.json').version });
});

app.get('/api/saas/status', (req, res) => {
  res.json({
    enabled: !!(config.saas || {}).enabled,
    connected: saasService.socket?.readyState === WebSocket.OPEN,
    authenticated: saasService.authenticated,
    tier: saasService.tier,
    backendUrl: (config.saas || {}).backendUrl || null,
    deviceId: (config.saas || {}).deviceId || null
  });
});

app.get('/api/modules', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json(getModules());
});

app.get('/api/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json(loadConfig());
});

app.get('/api/weather', async (req, res) => {
  const location = req.query.location;
  if (!location) {
    return res.status(400).json({ error: 'location required' });
  }

  const lang = (req.query.language || 'en').split('-')[0].toLowerCase();
  const provider = (req.query.provider || 'wttr').toLowerCase();

  try {
    if (provider === 'openmeteo') {
      const weather = await fetchOpenMeteoWeather(location, lang);
      res.json(weather);
    } else {
      const https = require('https');
      const url = `https://wttr.in/${encodeURIComponent(location)}?format=%C|%t&lang=${encodeURIComponent(lang)}`;
      const data = await new Promise((resolve, reject) => {
        const request = https.get(url, { headers: { 'User-Agent': 'curl/8.0' } }, response => {
          let body = '';
          response.on('data', chunk => body += chunk);
          response.on('end', () => resolve(body));
        });
        request.on('error', reject);
      });

      const parts = data.split('|');
      if (parts.length >= 2) {
        res.json({ description: parts[0].trim(), temp: parts[1].trim() });
      } else {
        res.json({ description: 'Weather unavailable', temp: '--' });
      }
    }
  } catch (err) {
    console.error('Weather error:', err.message);
    res.status(500).json({ description: 'Weather unavailable', temp: '--' });
  }
});

async function fetchOpenMeteoWeather(location, lang) {
  const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`);
  if (!geoRes.ok) throw new Error('geocoding failed');
  const geoData = await geoRes.json();
  if (!geoData.results || geoData.results.length === 0) {
    throw new Error('location not found');
  }
  const place = geoData.results[0];

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current_weather=true`;
  const weatherRes = await fetch(weatherUrl);
  if (!weatherRes.ok) throw new Error('weather fetch failed');
  const weatherData = await weatherRes.json();
  const current = weatherData.current_weather || {};

  return {
    description: wmoWeatherDescription(current.weathercode, lang),
    temp: current.temperature != null ? `${Math.round(current.temperature)}°C` : '--'
  };
}

function wmoWeatherDescription(code, lang) {
  const descriptions = {
    en: {
      0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Depositing rime fog',
      51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
      56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
      61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      66: 'Light freezing rain', 67: 'Heavy freezing rain',
      71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
      77: 'Snow grains',
      80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
      85: 'Slight snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail'
    },
    de: {
      0: 'Klarer Himmel', 1: 'Überwiegend klar', 2: 'Teilweise bewölkt', 3: 'Bedeckt',
      45: 'Nebel', 48: 'Raureifnebel',
      51: 'Leichter Nieselregen', 53: 'Mäßiger Nieselregen', 55: 'Starker Nieselregen',
      56: 'Leichter gefrierender Nieselregen', 57: 'Starker gefrierender Nieselregen',
      61: 'Leichter Regen', 63: 'Mäßiger Regen', 65: 'Starker Regen',
      66: 'Leichter gefrierender Regen', 67: 'Starker gefrierender Regen',
      71: 'Leichter Schneefall', 73: 'Mäßiger Schneefall', 75: 'Starker Schneefall',
      77: 'Schneekörner',
      80: 'Leichte Regenschauer', 81: 'Mäßige Regenschauer', 82: 'Starke Regenschauer',
      85: 'Leichte Schneeschauer', 86: 'Starke Schneeschauer',
      95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'Schweres Gewitter mit Hagel'
    }
  };

  const map = descriptions[lang] || descriptions.en;
  return map[code] || 'Unknown';
}

app.get('/api/calendar', async (req, res) => {
  let url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'url required' });
  }

  // Resolve local upload paths to an absolute URL so node-fetch can reach them.
  if (url.startsWith('/')) {
    url = `http://localhost:${PORT}${url}`;
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'OpenMirror/1.0' }
    });
    if (!response.ok) {
      throw new Error(`fetch failed: ${response.status}`);
    }
    const text = await response.text();
    const events = parseICS(text)
      .filter(ev => ev.start && (ev.end || ev.start) >= new Date())
      .sort((a, b) => a.start - b.start)
      .slice(0, parseInt(req.query.limit, 10) || 10)
      .map(ev => ({
        title: ev.title || '(No title)',
        start: ev.start.toISOString(),
        end: ev.end ? ev.end.toISOString() : null,
        allDay: ev.allDay,
        location: ev.location || ''
      }));
    res.json(events);
  } catch (err) {
    console.error('Calendar fetch error:', err.message);
    res.status(500).json({ error: 'calendar unavailable' });
  }
});

app.get('/api/rss', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'OpenMirror/1.0' }
    });
    if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
    const xml = await response.text();
    const items = parseRSS(xml, parseInt(req.query.limit, 10) || 10);
    res.json(items);
  } catch (err) {
    console.error('RSS fetch error:', err.message);
    res.status(500).json({ error: 'rss unavailable' });
  }
});

app.get('/api/todoist', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'token required' });

  try {
    const url = new URL('https://api.todoist.com/rest/v2/tasks');
    if (req.query.projectId) url.searchParams.set('project_id', req.query.projectId);
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(`todoist error: ${response.status}`);
    const tasks = await response.json();
    const limit = parseInt(req.query.limit, 10) || 10;
    res.json(tasks.slice(0, limit).map(t => ({
      id: t.id,
      content: t.content,
      description: t.description,
      isCompleted: t.is_completed,
      due: t.due
    })));
  } catch (err) {
    console.error('Todoist error:', err.message);
    res.status(500).json({ error: 'todoist unavailable' });
  }
});

app.get('/api/immich', async (req, res) => {
  const url = req.query.url;
  const apiKey = req.query.apiKey;
  const albumId = req.query.albumId;
  if (!url || !apiKey || !albumId) {
    return res.status(400).json({ error: 'url, apiKey and albumId required' });
  }

  try {
    const albumUrl = `${url.replace(/\/$/, '')}/api/albums/${albumId}`;
    const response = await fetch(albumUrl, {
      headers: { 'x-api-key': apiKey }
    });
    if (!response.ok) throw new Error(`immich error: ${response.status}`);
    const album = await response.json();
    const assets = (album.assets || []).map(asset => `${url.replace(/\/$/, '')}/api/assets/${asset.id}/thumbnail?size=preview`);
    res.json(assets);
  } catch (err) {
    console.error('Immich error:', err.message);
    res.status(500).json({ error: 'immich unavailable' });
  }
});

app.get('/api/system', async (req, res) => {
  const os = require('os');
  let cpuTemp = null;
  try {
    const { execSync } = require('child_process');
    const raw = execSync('vcgencmd measure_temp 2>/dev/null || echo ""').toString();
    const match = raw.match(/temp=([\d.]+)/);
    if (match) cpuTemp = `${match[1]}°C`;
  } catch (err) {
    // ignore
  }

  let diskInfo = { total: 0, used: 0 };
  try {
    const { execSync } = require('child_process');
    const raw = execSync("df -B1 . | tail -1").toString().trim().split(/\s+/);
    diskInfo = { total: parseInt(raw[1], 10), used: parseInt(raw[2], 10) };
  } catch (err) {
    // ignore
  }

  res.json({
    cpuTemp,
    cpuLoad: os.loadavg(),
    memoryTotal: os.totalmem(),
    memoryUsed: os.totalmem() - os.freemem(),
    diskTotal: diskInfo.total,
    diskUsed: diskInfo.used,
    uptime: os.uptime(),
    platform: os.platform(),
    hostname: os.hostname()
  });
});

app.post('/api/modules/:moduleId/duplicate', (req, res) => {
  const { moduleId } = req.params;
  const newId = req.body.newId;

  if (!newId || !/^[a-z0-9-]+$/.test(newId)) {
    return res.status(400).json({ error: 'invalid module id' });
  }

  const sourcePath = path.join(MODULES_DIR, moduleId);
  const targetPath = path.join(MODULES_DIR, newId);

  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: 'module not found' });
  }
  if (fs.existsSync(targetPath)) {
    return res.status(409).json({ error: 'module id already exists' });
  }

  try {
    fs.cpSync(sourcePath, targetPath, { recursive: true });

    // Rename the copy so the UI shows "Original Name (new-id)" instead of two identical names.
    const manifestPath = path.join(targetPath, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.name = `${manifest.name} (${newId})`;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    res.json({ ok: true, id: newId });
  } catch (err) {
    console.error('Duplicate module error:', err.message);
    res.status(500).json({ error: 'failed to duplicate module' });
  }
});

app.delete('/api/modules/:moduleId', (req, res) => {
  const { moduleId } = req.params;

  if (BUILTIN_MODULES.has(moduleId)) {
    return res.status(403).json({ error: 'cannot delete built-in module' });
  }

  const targetPath = path.join(MODULES_DIR, moduleId);
  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'module not found' });
  }

  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete module error:', err.message);
    res.status(500).json({ error: 'failed to delete module' });
  }
});

app.get('/api/ticker', async (req, res) => {
  const symbols = (req.query.symbols || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const currency = (req.query.currency || 'usd').toLowerCase();
  const stockToken = req.query.stockToken;

  if (symbols.length === 0) return res.status(400).json({ error: 'symbols required' });

  try {
    const results = [];
    const cryptoSymbols = [];
    const stockSymbols = [];

    symbols.forEach(sym => {
      // Uppercase short symbols are treated as stocks if a stock token is provided.
      if (stockToken && /^[A-Z]{1,5}$/.test(sym.toUpperCase())) {
        stockSymbols.push(sym.toUpperCase());
      } else {
        cryptoSymbols.push(sym.toLowerCase());
      }
    });

    if (cryptoSymbols.length > 0) {
      const ids = cryptoSymbols.join(',');
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${currency}&ids=${ids}&price_change_percentage=24h`;
      const response = await fetch(url, { headers: { 'User-Agent': 'OpenMirror/1.0' } });
      if (response.ok) {
        const data = await response.json();
        data.forEach(coin => {
          results.push({
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            price: coin.current_price,
            change24h: coin.price_change_percentage_24h
          });
        });
      }
    }

    if (stockSymbols.length > 0 && stockToken) {
      for (const sym of stockSymbols) {
        try {
          const url = `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${stockToken}`;
          const response = await fetch(url);
          if (!response.ok) continue;
          const data = await response.json();
          if (data.c) {
            const change = data.pc ? ((data.c - data.pc) / data.pc) * 100 : null;
            results.push({
              symbol: sym,
              name: sym,
              price: data.c,
              change24h: change
            });
          }
        } catch (err) {
          console.error('Stock fetch error:', err.message);
        }
      }
    }

    res.json(results);
  } catch (err) {
    console.error('Ticker error:', err.message);
    res.status(500).json({ error: 'ticker unavailable' });
  }
});

app.get('/api/airquality', async (req, res) => {
  const location = req.query.location;
  if (!location) return res.status(400).json({ error: 'location required' });

  try {
    // Geocode city with Open-Meteo
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`);
    if (!geoRes.ok) throw new Error('geocoding failed');
    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) {
      return res.status(404).json({ error: 'location not found' });
    }
    const place = geoData.results[0];

    // Fetch air quality (Open-Meteo uses 'ozone' for O3)
    const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.latitude}&longitude=${place.longitude}&current=us_aqi,pm10,pm2_5,ozone`;
    const aqRes = await fetch(aqUrl);
    if (!aqRes.ok) throw new Error('air quality fetch failed');
    const aqData = await aqRes.json();
    const current = aqData.current || {};

    res.json({
      location: `${place.name}, ${place.country_code || ''}`,
      aqi: current.us_aqi,
      pm10: current.pm10,
      pm25: current.pm2_5,
      o3: current.ozone
    });
  } catch (err) {
    console.error('Air quality error:', err.message);
    res.status(500).json({ error: 'air quality unavailable' });
  }
});

app.get('/api/pollen', async (req, res) => {
  const location = req.query.location;
  const provider = req.query.provider || 'openmeteo';
  if (!location) return res.status(400).json({ error: 'location required' });

  try {
    if (provider === 'dwd') {
      const dwd = await fetchDwdPollen(location);
      return res.json(dwd);
    }

    const pollen = await fetchOpenMeteoPollen(location);
    res.json(pollen);
  } catch (err) {
    console.error('Pollen error:', err.message);
    res.status(500).json({ error: 'pollen unavailable' });
  }
});

async function fetchOpenMeteoPollen(location) {
  const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`);
  if (!geoRes.ok) throw new Error('geocoding failed');
  const geoData = await geoRes.json();
  if (!geoData.results || geoData.results.length === 0) throw new Error('location not found');
  const place = geoData.results[0];

  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.latitude}&longitude=${place.longitude}&hourly=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&timezone=auto&forecast_days=1`;
  const pollenRes = await fetch(url);
  if (!pollenRes.ok) throw new Error('pollen fetch failed');
  const data = await pollenRes.json();

  const hourly = data.hourly || {};
  const now = new Date();
  const currentHour = now.getHours();
  const index = Math.min(currentHour, (hourly.time || []).length - 1);

  const mapping = {
    alder_pollen: 'Alder',
    birch_pollen: 'Birch',
    grass_pollen: 'Grass',
    mugwort_pollen: 'Mugwort',
    olive_pollen: 'Olive',
    ragweed_pollen: 'Ragweed'
  };

  const rows = Object.entries(mapping).map(([key, name]) => {
    const arr = hourly[key] || [];
    const value = arr[index] != null ? arr[index] : null;
    return { name, value, level: pollenLevel(value) };
  }).filter(r => r.value != null).sort((a, b) => b.value - a.value);

  return {
    location: `${place.name}, ${place.country_code || ''}`,
    provider: 'openmeteo',
    pollen: rows
  };
}

async function fetchDwdPollen(location) {
  const dwdRes = await fetch('https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json');
  if (!dwdRes.ok) throw new Error('dwd fetch failed');
  const data = await dwdRes.json();

  const search = location.toLowerCase();
  const regions = data.content || [];
  let match = null;

  // Prefer exact partregion match, then exact region match.
  for (const region of regions) {
    const partName = (region.partregion_name || '').toLowerCase();
    if (partName && partName === search) {
      match = region;
      break;
    }
  }

  if (!match) {
    for (const region of regions) {
      const regionName = (region.region_name || '').toLowerCase();
      if (regionName && regionName === search) {
        match = region;
        break;
      }
    }
  }

  // Fallback to substring partregion match, then substring region match.
  if (!match) {
    for (const region of regions) {
      const partName = (region.partregion_name || '').toLowerCase();
      if (partName && partName.includes(search)) {
        match = region;
        break;
      }
    }
  }

  if (!match) {
    for (const region of regions) {
      const regionName = (region.region_name || '').toLowerCase();
      if (regionName && regionName.includes(search)) {
        match = region;
        break;
      }
    }
  }

  if (!match) throw new Error('dwd region not found');

  const nameMapping = {
    Birke: 'Birch',
    Esche: 'Ash',
    Graeser: 'Grass',
    Beifuss: 'Mugwort',
    Erle: 'Alder',
    Ambrosia: 'Ragweed',
    Hasel: 'Hazel',
    Roggen: 'Rye'
  };

  const rows = [];
  const pollenData = match.Pollen || {};
  for (const [german, english] of Object.entries(nameMapping)) {
    const entry = pollenData[german];
    if (!entry || entry.today == null) continue;
    const value = parseDwdLevel(entry.today);
    rows.push({ name: english, value, level: dwdLevel(value) });
  }

  rows.sort((a, b) => b.value - a.value);

  return {
    location: match.partregion_name || match.region_name,
    provider: 'dwd',
    pollen: rows
  };
}

function parseDwdLevel(value) {
  if (!value || value === '0') return 0;
  const parts = String(value).split('-').map(Number);
  const max = Math.max(...parts);
  return Number.isFinite(max) ? max : 0;
}

function dwdLevel(value) {
  if (value === 0) return 'none';
  if (value <= 1) return 'low';
  if (value <= 2) return 'moderate';
  if (value <= 3) return 'high';
  return 'very-high';
}

function pollenLevel(value) {
  if (value === 0 || value == null) return 'none';
  if (value <= 10) return 'low';
  if (value <= 50) return 'moderate';
  if (value <= 100) return 'high';
  return 'very-high';
}

app.get('/api/traveltime', async (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  const mapboxToken = req.query.mapboxToken;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  try {
    const fromCoord = await resolveCoordinates(from);
    const toCoord = await resolveCoordinates(to);

    let data;
    let source;
    if (mapboxToken) {
      const coords = `${fromCoord.lon},${fromCoord.lat};${toCoord.lon},${toCoord.lat}`;
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${encodeURIComponent(coords)}?access_token=${mapboxToken}&overview=false`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('mapbox failed');
      const mb = await response.json();
      if (!mb.routes || mb.routes.length === 0) throw new Error('no route');
      data = { duration: mb.routes[0].duration, distance: mb.routes[0].distance };
      source = 'Mapbox (traffic)';
    } else {
      const coords = `${fromCoord.lon},${fromCoord.lat};${toCoord.lon},${toCoord.lat}`;
      const url = `http://router.project-osrm.org/route/v1/driving/${encodeURIComponent(coords)}?overview=false`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('osrm failed');
      const osrm = await response.json();
      if (!osrm.routes || osrm.routes.length === 0) throw new Error('no route');
      data = { duration: osrm.routes[0].duration, distance: osrm.routes[0].distance };
      source = 'OSRM (no live traffic)';
    }

    res.json({
      ...data,
      fromName: fromCoord.name,
      toName: toCoord.name,
      source
    });
  } catch (err) {
    console.error('Travel time error:', err.message);
    res.status(500).json({ error: 'travel time unavailable' });
  }
});

async function resolveCoordinates(input) {
  const coordMatch = input.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (coordMatch) {
    return { lat: parseFloat(coordMatch[1]), lon: parseFloat(coordMatch[2]), name: input };
  }
  const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(input)}&count=1`);
  if (!geoRes.ok) throw new Error('geocoding failed');
  const geoData = await geoRes.json();
  if (!geoData.results || geoData.results.length === 0) throw new Error('location not found');
  const place = geoData.results[0];
  return { lat: place.latitude, lon: place.longitude, name: place.name };
}

app.post('/api/upload', (req, res) => {
  const { filename, contentBase64 } = req.body;
  if (!filename || !contentBase64) {
    return res.status(400).json({ error: 'filename and contentBase64 required' });
  }

  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safeName) return res.status(400).json({ error: 'invalid filename' });

  const uploadDir = path.join(__dirname, 'data', 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  // If a file with the same name exists, add a counter
  let targetName = safeName;
  let targetPath = path.join(uploadDir, targetName);
  let counter = 1;
  const ext = path.extname(safeName);
  const base = path.basename(safeName, ext);
  while (fs.existsSync(targetPath)) {
    targetName = `${base}-${counter}${ext}`;
    targetPath = path.join(uploadDir, targetName);
    counter++;
  }

  try {
    const buffer = Buffer.from(contentBase64, 'base64');
    fs.writeFileSync(targetPath, buffer);
    res.json({ ok: true, url: `/api/uploads/${targetName}`, name: targetName });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: 'upload failed' });
  }
});

app.get('/api/uploads/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'data', 'uploads', path.basename(req.params.filename));
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'file not found' });
  }
});

app.post('/api/config', (req, res) => {
  applyConfig(req.body);
  res.json({ ok: true });
});

app.post('/api/reload', (req, res) => {
  broadcast({ type: 'command', command: 'reload' });
  res.json({ ok: true });
});

app.post('/api/push/:moduleId', (req, res) => {
  const { moduleId } = req.params;
  broadcast({ type: 'push', moduleId, data: req.body });
  res.json({ ok: true, moduleId });
});

app.get('/api/module/:moduleId/*', (req, res) => {
  const filePath = path.join(MODULES_DIR, req.params.moduleId, req.params[0]);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'module file not found' });
  }
});

app.get('/api/faces', (req, res) => {
  res.json(getFaces());
});

app.get('/api/faces/model', (req, res) => {
  res.json(faceService.getModelStatus());
});

app.get('/api/faces/training', (req, res) => {
  res.json(faceService.getTrainingStatus());
});

app.get('/api/faces/camera', (req, res) => {
  const faceLock = config.faceLock || {};
  const cameraDevice = (config.hardware || []).find(d => d.type === 'camera' && d.enabled !== false);
  res.json({
    camera: cameraDevice?.settings?.cameraIndex != null ? cameraDevice.settings.cameraIndex : (faceLock.camera != null ? faceLock.camera : 0),
    width: cameraDevice?.settings?.width || faceLock.cameraWidth || 640,
    height: cameraDevice?.settings?.height || faceLock.cameraHeight || 480,
    running: !!faceService.process || !!faceService.previewProcess,
    recognition: !!faceService.process,
    preview: !!faceService.previewProcess,
    testMode: faceService.testMode
  });
});

app.get('/api/faces/camera/preview', (req, res) => {
  const previewPath = faceService.previewPath || '/dev/shm/openmirror_preview.jpg';
  try {
    if (!fs.existsSync(previewPath)) {
      return res.status(404).json({ error: 'No preview available' });
    }
    const stats = fs.statSync(previewPath);
    const ageMs = Date.now() - stats.mtimeMs;
    if (ageMs > 5000) {
      return res.status(404).json({ error: 'Preview stale' });
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.resolve(previewPath));
  } catch (err) {
    console.error('Face preview error:', err.message);
    res.status(500).json({ error: 'Preview error' });
  }
});

app.post('/api/faces/test/start', (req, res) => {
  try {
    res.json(faceService.startTest());
  } catch (err) {
    console.error('Face test start error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/faces/test/stop', (req, res) => {
  try {
    res.json(faceService.stopTest());
  } catch (err) {
    console.error('Face test stop error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/faces/camera/preview/start', (req, res) => {
  try {
    res.json(faceService.startCameraPreview());
  } catch (err) {
    console.error('Camera preview start error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/faces/camera/preview/stop', (req, res) => {
  try {
    res.json(faceService.stopCameraPreview());
  } catch (err) {
    console.error('Camera preview stop error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/faces/:personId/photos', (req, res) => {
  const personId = req.params.personId;
  const name = req.body.name;
  const photos = req.body.photos || [];

  if (!name) return res.status(400).json({ error: 'name required' });
  if (photos.length === 0) return res.status(400).json({ error: 'photos required' });

  try {
    const result = faceService.savePhotos(personId, name, null, photos);

    config = loadConfig();
    config.faceLock = config.faceLock || {};
    config.faceLock.persons = config.faceLock.persons || [];
    // Preserve any existing page assignment the user set on the layout page.
    const existing = config.faceLock.persons.find(p => p.id === personId);
    const page = existing?.page || null;
    config.faceLock.persons = config.faceLock.persons.filter(p => p.id !== personId);
    config.faceLock.persons.push({ id: personId, name, page });
    saveConfig(config);

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Face photos save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/faces/:personId/train', (req, res) => {
  const personId = req.params.personId;
  const name = req.body.name;
  const algorithm = req.body.algorithm || config.faceLock?.algorithm || 'LBPH';

  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const status = faceService.startTraining(personId, name, algorithm);

    config = loadConfig();
    config.faceLock = config.faceLock || {};
    config.faceLock.persons = config.faceLock.persons || [];
    const existing = config.faceLock.persons.find(p => p.id === personId);
    const page = existing?.page || null;
    config.faceLock.persons = config.faceLock.persons.filter(p => p.id !== personId);
    config.faceLock.persons.push({ id: personId, name, page });
    config.faceLock.algorithm = algorithm;
    saveConfig(config);
    faceService.setConfig(config);

    res.json(status);
  } catch (err) {
    console.error('Face train start error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/faces/:personId', async (req, res) => {
  const personId = req.params.personId;
  const name = req.body.name;
  const algorithm = req.body.algorithm || config.faceLock?.algorithm || 'LBPH';

  if (!name) return res.status(400).json({ error: 'name required' });

  const uploads = req.body.photos || [];
  // photos is array of { filename, contentBase64 }
  const tempPaths = [];
  const uploadDir = path.join(__dirname, 'data', 'uploads');

  try {
    fs.mkdirSync(uploadDir, { recursive: true });

    uploads.forEach((photo, index) => {
      const safeName = path.basename(photo.filename || `photo-${index}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const tmpPath = path.join(uploadDir, `${personId}-${index}-${safeName}`);
      const buffer = Buffer.from(photo.contentBase64, 'base64');
      fs.writeFileSync(tmpPath, buffer);
      tempPaths.push(tmpPath);
    });

    const result = await faceService.train(personId, name, tempPaths, algorithm);

    // Clean up temp files
    tempPaths.forEach(p => {
      try { fs.rmSync(p); } catch (err) { /* ignore */ }
    });

    // Update config.faceLock.persons
    config = loadConfig();
    config.faceLock = config.faceLock || {};
    config.faceLock.persons = config.faceLock.persons || [];
    const legacyExisting = config.faceLock.persons.find(p => p.id === personId);
    const legacyPage = req.body.page != null ? req.body.page : (legacyExisting?.page || null);
    config.faceLock.persons = config.faceLock.persons.filter(p => p.id !== personId);
    config.faceLock.persons.push({ id: personId, name, page: legacyPage });
    config.faceLock.algorithm = algorithm;
    saveConfig(config);

    // Restart recognition with new model
    faceService.stop();
    faceService.setConfig(config);
    faceService.start();

    res.json({ ok: true, ...result });
  } catch (err) {
    tempPaths.forEach(p => {
      try { fs.rmSync(p); } catch (e) { /* ignore */ }
    });
    console.error('Face training error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/faces/:personId', async (req, res) => {
  try {
    await faceService.delete(req.params.personId);

    config = loadConfig();
    config.faceLock = config.faceLock || {};
    config.faceLock.persons = (config.faceLock.persons || []).filter(p => p.id !== req.params.personId);
    saveConfig(config);

    faceService.stop();
    faceService.setConfig(config);
    faceService.start();

    res.json({ ok: true });
  } catch (err) {
    console.error('Face delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hardware/schema', (req, res) => {
  if (!fs.existsSync(HARDWARE_SCHEMA_PATH)) {
    return res.json([]);
  }
  res.json(JSON.parse(fs.readFileSync(HARDWARE_SCHEMA_PATH, 'utf8')));
});

app.get('/api/hardware/gpio/:deviceId/:pin', (req, res) => {
  const pin = parseInt(req.params.pin, 10);
  if (isNaN(pin)) {
    return res.status(400).json({ error: 'Invalid pin number' });
  }
  const result = hardware.readGpio(req.params.deviceId, pin);
  if (result.error) {
    return res.status(404).json({ error: result.error });
  }
  res.json({ deviceId: req.params.deviceId, pin, value: result.value });
});

app.post('/api/hardware/speaker/:id/volume', (req, res) => {
  const device = (config.hardware || []).find(d => d.id === req.params.id && d.type === 'speaker');
  if (!device) return res.status(404).json({ error: 'speaker not found' });

  const volume = parseInt(req.body.volume, 10);
  if (isNaN(volume) || volume < 0 || volume > 100) {
    return res.status(400).json({ error: 'volume must be 0-100' });
  }

  const settings = device.settings || {};
  const audioOutput = settings.audioOutput || 'default';

  const { exec } = require('child_process');
  const cmd = `amixer -D ${shellQuote(audioOutput)} set Master ${volume}%`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error(`Speaker volume error for ${device.id}:`, err.message);
      return res.status(500).json({ error: err.message, stderr });
    }
    res.json({ ok: true, volume, stdout });
  });
});

app.post('/api/hardware/speaker/:id/test', (req, res) => {
  const device = (config.hardware || []).find(d => d.id === req.params.id && d.type === 'speaker');
  if (!device) return res.status(404).json({ error: 'speaker not found' });

  const settings = device.settings || {};
  const audioOutput = settings.audioOutput || 'default';
  const testFile = settings.testFile || '/usr/share/sounds/alsa/Front_Center.wav';

  const { exec } = require('child_process');
  const cmd = `aplay -D ${shellQuote(audioOutput)} ${shellQuote(testFile)}`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error(`Speaker test error for ${device.id}:`, err.message);
      return res.status(500).json({ error: err.message, stderr });
    }
    res.json({ ok: true, stdout });
  });
});

app.post('/api/hardware/microphone/:id/test', (req, res) => {
  const device = (config.hardware || []).find(d => d.id === req.params.id && d.type === 'microphone');
  if (!device) return res.status(404).json({ error: 'microphone not found' });

  const settings = device.settings || {};
  const usbDevice = settings.usbDevice;
  const duration = parseInt(settings.testDuration, 10) || 3;
  const sampleRate = parseInt(settings.sampleRate, 10) || 16000;

  // Find ALSA device matching the selected USB device if possible
  let alsaDevice = 'default';
  if (usbDevice) {
    const [vendorId, productId] = usbDevice.split(':');
    // Try to find a USB audio capture device. This is a best-effort guess.
    const { execSync } = require('child_process');
    try {
      const cards = execSync('cat /proc/asound/cards').toString();
      const lines = cards.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('USB') || (vendorId && lines[i].toLowerCase().includes(vendorId))) {
          alsaDevice = `plughw:${i}`;
          break;
        }
      }
    } catch (err) {
      // ignore
    }
  }

  const { exec } = require('child_process');
  const tmpFile = `/tmp/openmirror-mic-test-${device.id}.wav`;
  const cmd = `arecord -D ${shellQuote(alsaDevice)} -d ${duration} -f S16_LE -r ${sampleRate} -c 1 ${tmpFile}`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error(`Microphone test error for ${device.id}:`, err.message);
      return res.status(500).json({ error: err.message, stderr });
    }
    res.json({ ok: true, file: tmpFile, duration, sampleRate });
  });
});

app.get('/api/serialports', async (req, res) => {
  try {
    const { SerialPort } = require('serialport');
    const ports = await SerialPort.list();
    res.json(ports);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/usbdevices', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const output = await new Promise((resolve, reject) => {
      exec('lsusb', (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      });
    });

    const devices = output.split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const match = line.match(/^Bus\s+(\d+)\s+Device\s+(\d+):\s+ID\s+([0-9a-fA-F]{4}):([0-9a-fA-F]{4})\s+(.*)$/);
        if (!match) return null;
        return {
          bus: match[1],
          device: match[2],
          vendorId: match[3].toLowerCase(),
          productId: match[4].toLowerCase(),
          name: match[5].trim(),
          id: `${match[3].toLowerCase()}:${match[4].toLowerCase()}`
        };
      })
      .filter(Boolean);

    res.json(devices);
  } catch (err) {
    console.error('USB devices error:', err.message);
    res.json([]);
  }
});

app.get('/api/audiooutputs', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const output = await new Promise((resolve, reject) => {
      exec('aplay -l', (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      });
    });

    const devices = [];
    const cardRegex = /^card\s+(\d+):\s+([^[]+)\s+\[([^\]]+)\],\s*device\s+(\d+):\s+([^[]+)\s+\[([^\]]+)\]/i;
    output.split('\n').forEach(line => {
      const match = line.match(cardRegex);
      if (match) {
        devices.push({
          card: parseInt(match[1], 10),
          cardName: match[2].trim(),
          cardLabel: match[3].trim(),
          device: parseInt(match[4], 10),
          deviceName: match[5].trim(),
          deviceLabel: match[6].trim(),
          id: `hw:${match[1]},${match[4]}`,
          name: `${match[3].trim()} (${match[6].trim()})`
        });
      }
    });

    res.json(devices);
  } catch (err) {
    console.error('Audio outputs error:', err.message);
    res.json([]);
  }
});

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'hello' }));
});

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\"'\"'")}'`;
}

function parseICS(text) {
  // Unfold continuation lines (space or tab at start of line)
  const lines = [];
  text.split(/\r?\n/).forEach(line => {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  });

  const unescapeICS = value =>
    value.replace(/\\n/gi, '\n')
         .replace(/\\,/g, ',')
         .replace(/\\;/g, ';')
         .replace(/\\\\/g, '\\');

  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT' && current) {
      const start = parseICSTimestamp(current.DTSTART, current.DTSTART_PARAMS);
      const end = parseICSTimestamp(current.DTEND, current.DTEND_PARAMS);
      if (start) {
        events.push({
          title: unescapeICS(current.SUMMARY || ''),
          location: unescapeICS(current.LOCATION || ''),
          description: unescapeICS(current.DESCRIPTION || ''),
          start,
          end,
          allDay: current.DTSTART_PARAMS ? current.DTSTART_PARAMS.includes('VALUE=DATE') : false
        });
      }
      current = null;
    } else if (current) {
      const sep = line.indexOf(':');
      if (sep === -1) continue;
      const keyPart = line.slice(0, sep);
      const value = line.slice(sep + 1);
      const [key, ...params] = keyPart.split(';');
      const upperKey = key.toUpperCase();
      if (upperKey === 'DTSTART' || upperKey === 'DTEND') {
        current[upperKey] = value;
        current[`${upperKey}_PARAMS`] = params.map(p => p.toUpperCase());
      } else {
        current[upperKey] = value;
      }
    }
  }

  return events;
}

function parseICSTimestamp(value, params = []) {
  if (!value) return null;
  const isDate = params.includes('VALUE=DATE');

  if (/^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00`);
  }

  const iso = value
    .replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/, '$1-$2-$3T$4:$5:$6$7');
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : date;
}

function parseRSS(xml, limit = 10) {
  // Very small XML parser for RSS and Atom feeds
  const items = [];
  const isAtom = xml.includes('<feed');

  const tag = (source, name, fallback = '') => {
    const match = source.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
    return match ? match[1].replace(/<\/?!\[CDATA\[/gi, '').replace(/\]\]>/g, '').trim() : fallback;
  };

  const decodeHtmlEntities = html => html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  const stripHtml = html => decodeHtmlEntities(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  if (isAtom) {
    const entries = xml.split(/<entry[\s\S]*?>/i).slice(1);
    for (const entry of entries.slice(0, limit)) {
      items.push({
        title: stripHtml(tag(entry, 'title')),
        description: stripHtml(tag(entry, 'summary') || tag(entry, 'content')),
        link: tag(entry, 'link'),
        pubDate: tag(entry, 'updated') || tag(entry, 'published')
      });
    }
  } else {
    const entries = xml.split(/<item[\s\S]*?>/i).slice(1);
    for (const entry of entries.slice(0, limit)) {
      items.push({
        title: stripHtml(tag(entry, 'title')),
        description: stripHtml(tag(entry, 'description') || tag(entry, 'content:encoded')),
        link: tag(entry, 'link'),
        pubDate: tag(entry, 'pubDate') || tag(entry, 'date')
      });
    }
  }

  return items;
}

// JSON-friendly error handler — prevents HTML error pages on API routes.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const wantsJson = req.path.startsWith('/api') || (req.headers.accept || '').includes('application/json');
  console.error('Request error:', err.message);
  if (wantsJson) {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Internal server error' });
  } else {
    res.status(500).send('Internal server error');
  }
});

server.listen(PORT, () => {
  console.log(`OpenMirror server running on http://localhost:${PORT}`);
  hardware.start();
  presence.start({ hardware, faceService });
  mqttService.start();
  faceService.start();
  saasService.start();
});
