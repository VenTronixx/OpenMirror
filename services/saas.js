const { EventEmitter } = require('events');
const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const DEFAULT_STATUS_INTERVAL_MS = 30_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_RECONNECT_BASE_MS = 2_000;
const DEFAULT_RECONNECT_MAX_MS = 60_000;

class SaasService extends EventEmitter {
  /**
   * @param {object} config - Full OpenMirror config.
   * @param {object} handlers - Callbacks provided by server.js.
   * @param {function} handlers.applyConfig - (newConfig) => void
   * @param {function} handlers.broadcastCommand - (command, data) => void
   * @param {function} [handlers.log] - (level, message) => void
   */
  constructor(config = {}, handlers = {}) {
    super();
    this.config = config;
    this.handlers = handlers;
    this.socket = null;
    this.authenticated = false;
    this.tier = null;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.statusTimer = null;
    this.reconnectDelay = DEFAULT_RECONNECT_BASE_MS;
    this.started = false;
  }

  setConfig(config) {
    const hadConfig = this.config.saas;
    this.config = config;

    // If SaaS settings changed while running, reconnect so the new
    // backendUrl / licenseKey / deviceId take effect immediately.
    if (this.started && hadConfig && this._saasConfigChanged(hadConfig, config.saas || {})) {
      this.start();
    }
  }

  start() {
    this.started = true;
    this.stopConnection();

    const saas = this.config.saas || {};
    if (!saas.enabled || !saas.backendUrl) {
      this._log('info', 'SaaS remote disabled or no backend URL configured');
      return;
    }

    this._connect();
  }

  stop() {
    this.started = false;
    this.stopConnection();
  }

  stopConnection() {
    this._clearTimers();
    if (this.socket) {
      try {
        this.socket.terminate();
      } catch (err) {
        // ignore
      }
      this.socket = null;
    }
    this.authenticated = false;
    this.tier = null;
  }

  /**
   * Report a local event that should be forwarded as telemetry.
   * The device only forwards event types enabled in config.saas.telemetry.
   */
  reportEvent(eventType, data) {
    if (!this.authenticated) return;
    const telemetry = (this.config.saas || {}).telemetry || {};
    const category = eventType.split('.')[0];
    if (!telemetry[category] && !telemetry.all) return;
    this._send('telemetry', { eventType, data, timestamp: new Date().toISOString() });
  }

  /**
   * Download and install a module from the module store.
   * Returns a promise resolving to { ok: true } or { ok: false, error }.
   */
  async installModule(moduleId, version, downloadUrl) {
    const modulesDir = path.join(__dirname, '..', 'modules');
    const targetDir = path.join(modulesDir, moduleId);
    const manifestPath = path.join(targetDir, 'manifest.json');

    try {
      // Already installed at the requested version?
      if (fs.existsSync(manifestPath)) {
        const current = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (current.version === version) {
          return { ok: true, message: 'already installed' };
        }
      }

      const downloadsDir = path.join(__dirname, '..', 'data', 'downloads');
      fs.mkdirSync(downloadsDir, { recursive: true });

      const ext = path.extname(new URL(downloadUrl).pathname) || '.zip';
      const archivePath = path.join(downloadsDir, `${moduleId}-${version}${ext}`);
      const extractDir = path.join(downloadsDir, `${moduleId}-${version}`);

      await this._downloadFile(downloadUrl, archivePath);
      await this._extractArchive(archivePath, extractDir);

      // Validate extracted folder contains a manifest.
      const extractedManifestPath = path.join(extractDir, 'manifest.json');
      if (!fs.existsSync(extractedManifestPath)) {
        throw new Error('Downloaded module is missing manifest.json');
      }
      const manifest = JSON.parse(fs.readFileSync(extractedManifestPath, 'utf8'));
      if (manifest.name && manifest.name.toLowerCase().replace(/\s+/g, '-') !== moduleId) {
        // Allow either matching id or generic name; this is a soft check.
      }

      // Replace existing module.
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.renameSync(extractDir, targetDir);
      fs.rmSync(archivePath, { force: true });

      this._log('info', `Installed module ${moduleId}@${version}`);
      return { ok: true };
    } catch (err) {
      this._log('error', `Failed to install module ${moduleId}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  _connect() {
    const saas = this.config.saas || {};
    const url = saas.backendUrl;
    const deviceId = saas.deviceId || this._generateId();
    const name = saas.deviceName || saas.deviceId || 'OpenMirror';

    try {
      this.socket = new WebSocket(url);
    } catch (err) {
      this._log('error', `Invalid SaaS backend URL ${url}: ${err.message}`);
      this._scheduleReconnect();
      return;
    }

    this.socket.on('open', () => {
      this.reconnectDelay = DEFAULT_RECONNECT_BASE_MS;
      this._send('auth', {
        licenseKey: saas.licenseKey || '',
        deviceId,
        name,
        version: this._getVersion()
      });
    });

    this.socket.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString());
        this._handleMessage(msg);
      } catch (err) {
        this._log('error', 'SaaS message parse error: ' + err.message);
      }
    });

    this.socket.on('error', err => {
      this._log('error', 'SaaS WebSocket error: ' + err.message);
    });

    this.socket.on('close', () => {
      this.authenticated = false;
      this.tier = null;
      this.emit('disconnected');
      this._scheduleReconnect();
    });
  }

  _handleMessage(msg) {
    if (msg.type === 'auth') {
      if (msg.status === 'ok') {
        this.authenticated = true;
        this.tier = msg.tier || null;
        this.emit('authenticated', { tier: this.tier });
        this._startMaintenanceTimers();
        this._sendStatus();
        this._log('info', `SaaS authenticated; tier=${this.tier || 'unknown'}`);
      } else {
        this._log('error', 'SaaS authentication failed: ' + (msg.message || 'unknown'));
        // Do not reconnect immediately on auth failure; stop trying.
        this.stopConnection();
        this.started = false;
      }
      return;
    }

    if (!this.authenticated) return;

    switch (msg.type) {
      case 'config':
        if (typeof this.handlers.applyConfig === 'function' && msg.data) {
          this._log('info', 'SaaS pushed new config');
          this.handlers.applyConfig(msg.data);
        }
        break;

      case 'command':
        if (typeof this.handlers.broadcastCommand === 'function') {
          this._log('info', `SaaS command received: ${msg.command}`);
          this.handlers.broadcastCommand(msg.command, msg.data);
        }
        break;

      case 'install-module':
        this._handleInstallModule(msg);
        break;

      default:
        // ignore unknown messages
        break;
    }
  }

  _handleInstallModule(msg) {
    const { moduleId, version, downloadUrl } = msg;
    if (!moduleId || !downloadUrl) {
      this._send('install-module', { moduleId, status: 'error', error: 'missing fields' });
      return;
    }
    this.installModule(moduleId, version || 'latest', downloadUrl).then(result => {
      this._send('install-module', {
        moduleId,
        status: result.ok ? 'ok' : 'error',
        error: result.error
      });
    });
  }

  _send(type, payload = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type, ...payload }));
  }

  _sendStatus() {
    this._send('status', {
      version: this._getVersion(),
      uptime: Math.floor(process.uptime()),
      platform: process.platform,
      hostname: os.hostname()
    });
  }

  _startMaintenanceTimers() {
    this._clearTimers();
    this.heartbeatTimer = setInterval(() => {
      this._send('heartbeat');
    }, DEFAULT_HEARTBEAT_INTERVAL_MS);
    this.statusTimer = setInterval(() => {
      this._sendStatus();
    }, DEFAULT_STATUS_INTERVAL_MS);
  }

  _scheduleReconnect() {
    if (!this.started) return;
    this._clearTimers();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, DEFAULT_RECONNECT_MAX_MS);
      this._connect();
    }, this.reconnectDelay);
  }

  _clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.statusTimer = null;
  }

  _saasConfigChanged(a, b) {
    return (
      a.enabled !== b.enabled ||
      a.backendUrl !== b.backendUrl ||
      a.licenseKey !== b.licenseKey ||
      a.deviceId !== b.deviceId ||
      a.deviceName !== b.deviceName
    );
  }

  _log(level, message) {
    if (typeof this.handlers.log === 'function') {
      this.handlers.log(level, message);
    } else {
      console.log(`[saas] ${message}`);
    }
  }

  _generateId() {
    return Math.random().toString(36).substring(2, 10);
  }

  _getVersion() {
    try {
      return require('../package.json').version;
    } catch {
      return 'unknown';
    }
  }

  _downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      const file = fs.createWriteStream(dest);
      const req = client.get(url, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this._downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      });
      req.on('error', reject);
      file.on('error', reject);
    });
  }

  _extractArchive(archivePath, destDir) {
    return new Promise((resolve, reject) => {
      fs.mkdirSync(destDir, { recursive: true });

      // Prefer unzip on Unix, tar on Windows. Both can usually handle .zip.
      const isWindows = process.platform === 'win32';
      const cmd = isWindows ? 'tar' : 'unzip';
      const args = isWindows
        ? ['-xf', archivePath, '-C', destDir]
        : ['-o', archivePath, '-d', destDir];

      const proc = spawn(cmd, args, { stdio: 'ignore' });
      proc.on('close', code => {
        if (code === 0) return resolve();
        // Fallback to tar on Unix if unzip is not available.
        if (!isWindows) {
          const fallback = spawn('tar', ['-xf', archivePath, '-C', destDir], { stdio: 'ignore' });
          fallback.on('close', code2 => {
            if (code2 === 0) return resolve();
            reject(new Error(`Failed to extract module archive (exit ${code2})`));
          });
          fallback.on('error', err => reject(new Error(`tar fallback failed: ${err.message}`)));
        } else {
          reject(new Error(`Failed to extract module archive (exit ${code})`));
        }
      });
      proc.on('error', err => {
        // unzip not available; try tar.
        const fallback = spawn('tar', ['-xf', archivePath, '-C', destDir], { stdio: 'ignore' });
        fallback.on('close', code2 => {
          if (code2 === 0) return resolve();
          reject(new Error(`Extraction failed: ${err.message}`));
        });
        fallback.on('error', err2 => reject(new Error(`Extraction failed: ${err2.message}`)));
      });
    });
  }
}

module.exports = SaasService;
