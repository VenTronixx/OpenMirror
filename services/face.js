const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FACES_DIR = path.join(__dirname, '..', 'data', 'faces');
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');
const PREVIEW_PATH = '/dev/shm/openmirror_preview.jpg';

function spawnPython(args, options) {
  // The Node process may inherit a huge RLIMIT_NOFILE from libuv. That can
  // make the dynamic linker / OpenCV/GStreamer startup pathologically slow,
  // so force a sensible fd limit for the Python child.
  const safeArgs = args.map(a => `'${String(a).replace(/'/g, "'\\''")}'`).join(' ');
  return spawn('bash', ['-c', `ulimit -n 1024; exec python3 ${safeArgs}`], options);
}

class FaceService extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.process = null;
    this.currentPersonId = null;
    this.releaseTimer = null;
    this.lostTimer = null;
    this.testMode = false;
    this.previewPath = PREVIEW_PATH;
    this.training = { state: 'idle', personId: null, name: null, error: null, startedAt: null, finishedAt: null, result: null };
  }

  getTrainingStatus() {
    return { ...this.training };
  }

  setTrainingState(state, extras = {}) {
    this.training = { ...this.training, state, ...extras };
    this.emit('training', this.training);
  }

  setConfig(config) {
    this.config = config;
  }

  start() {
    this.stop();

    const faceLock = this.config.faceLock || {};
    if (!faceLock.enabled && !this.testMode) {
      console.log('Face lock disabled');
      return;
    }

    const modelPath = path.join(FACES_DIR, 'trainer.yml');
    if (!fs.existsSync(modelPath)) {
      console.log('Face model not trained yet. Face lock waiting for training.');
      return;
    }

    const labelsPath = path.join(FACES_DIR, 'labels.json');
    const algorithmPath = path.join(FACES_DIR, 'algorithm.json');
    const algorithm = fs.existsSync(algorithmPath)
      ? JSON.parse(fs.readFileSync(algorithmPath, 'utf8')).algorithm
      : 'LBPH';

    const threshold = faceLock.confidenceThreshold != null
      ? Math.round(faceLock.confidenceThreshold * 100)
      : 80;

    const hardwareConfig = this.config.hardware || [];
    const cameraDevice = hardwareConfig.find(d => d.type === 'camera' && d.enabled !== false);
    const cameraIndex = cameraDevice?.settings?.cameraIndex != null ? cameraDevice.settings.cameraIndex : (faceLock.camera != null ? faceLock.camera : 0);
    const cameraWidth = cameraDevice?.settings?.width || faceLock.cameraWidth || 640;
    const cameraHeight = cameraDevice?.settings?.height || faceLock.cameraHeight || 480;

    const args = [
      path.join(SCRIPTS_DIR, 'recognize_face.py'),
      '--model', modelPath,
      '--labels', labelsPath,
      '--algorithm', algorithm,
      '--threshold', String(threshold),
      '--interval', String(faceLock.scanInterval || 1),
      '--lost-frames', String((faceLock.releaseDelay || 3) + 2),
      '--camera', String(cameraIndex),
      '--width', String(cameraWidth),
      '--height', String(cameraHeight),
      '--preview', PREVIEW_PATH,
      '--preview-interval', '0.2'
    ];

    console.log(`Starting face recognition (${algorithm})`);
    this.process = spawnPython(args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let buffer = '';
    this.process.stdout.on('data', data => {
      buffer += data.toString();
      let lines = buffer.split('\n');
      buffer = lines.pop() || '';
      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const msg = JSON.parse(trimmed);
          this.handleRecognitionEvent(msg);
        } catch (err) {
          console.error('Face recognition output parse error:', trimmed);
        }
      });
    });

    this.process.stderr.on('data', data => {
      console.error('Face recognition stderr:', data.toString().trim());
    });

    this.process.on('close', code => {
      console.log(`Face recognition process exited with code ${code}`);
      this.process = null;
      // If we were only running for a test and face lock is off, do not restart.
      if (this.testMode && !this.config.faceLock?.enabled) {
        this.testMode = false;
      }
    });
  }

  stop() {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    if (this.lostTimer) {
      clearTimeout(this.lostTimer);
      this.lostTimer = null;
    }
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch (err) {
        // ignore
      }
      this.process = null;
    }
  }

  startTest() {
    if (this.testMode && this.process) {
      return { ok: true, message: 'Test already running' };
    }
    const modelPath = path.join(FACES_DIR, 'trainer.yml');
    if (!fs.existsSync(modelPath)) {
      throw new Error('No trained face model available. Train a face first.');
    }
    this.testMode = true;
    this.start();
    return { ok: true, message: 'Face recognition test started' };
  }

  stopTest() {
    const wasTestMode = this.testMode;
    this.testMode = false;
    if (wasTestMode && !this.config.faceLock?.enabled) {
      this.stop();
    }
    return { ok: true, message: 'Face recognition test stopped' };
  }

  handleRecognitionEvent(msg) {
    if (msg.event === 'error') {
      console.error('Face recognition error:', msg.message);
      return;
    }

    if (msg.event === 'detected') {
      this.currentPersonId = msg.personId;
      if (this.releaseTimer) {
        clearTimeout(this.releaseTimer);
        this.releaseTimer = null;
      }
      this.emit('face', { type: 'detected', personId: msg.personId, confidence: msg.confidence });
      return;
    }

    if (msg.event === 'unknown') {
      this.currentPersonId = 'unknown';
      this.scheduleClear();
      this.emit('face', { type: 'unknown' });
      return;
    }

    if (msg.event === 'lost') {
      this.scheduleClear();
      this.emit('face', { type: 'lost' });
    }
  }

  scheduleClear() {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    const releaseDelay = (this.config.faceLock?.releaseDelay || 3) * 1000;
    this.releaseTimer = setTimeout(() => {
      this.currentPersonId = null;
      this.emit('face', { type: 'cleared' });
    }, releaseDelay);
  }

  savePhotos(personId, name, page, photos) {
    fs.mkdirSync(FACES_DIR, { recursive: true });
    const personDir = path.join(FACES_DIR, personId);
    const originalDir = path.join(personDir, 'photos', 'original');
    fs.mkdirSync(originalDir, { recursive: true });

    // Write originals
    photos.forEach((photo, index) => {
      const safeName = path.basename(photo.filename || `photo-${index}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const ext = path.extname(safeName) || '.jpg';
      const destPath = path.join(originalDir, `${index + 1}${ext}`);
      const buffer = Buffer.from(photo.contentBase64, 'base64');
      fs.writeFileSync(destPath, buffer);
    });

    // Write/update label
    const labelPath = path.join(personDir, 'label.json');
    fs.writeFileSync(labelPath, JSON.stringify({ id: personId, name, page }, null, 2));

    return { ok: true, saved: photos.length };
  }

  async train(personId, name, photoPaths, algorithm = 'LBPH') {
    fs.mkdirSync(FACES_DIR, { recursive: true });

    return new Promise((resolve, reject) => {
      const args = [
        path.join(SCRIPTS_DIR, 'train_face.py'),
        '--person', personId,
        '--name', name,
        '--outdir', FACES_DIR,
        '--algorithm', algorithm,
        '--photos',
        ...photoPaths
      ];

      const proc = spawnPython(args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      let errorOutput = '';

      proc.stdout.on('data', data => {
        output += data.toString();
      });

      proc.stderr.on('data', data => {
        errorOutput += data.toString();
      });

      proc.on('close', code => {
        let result = null;
        try {
          const lines = output.split('\n').filter(Boolean);
          result = JSON.parse(lines[lines.length - 1]);
        } catch (err) {
          result = null;
        }

        if (code !== 0) {
          const message = errorOutput || (result && result.error) || 'Training failed';
          return reject(new Error(message));
        }

        if (!result || !result.ok) {
          return reject(new Error((result && result.error) || 'Training failed'));
        }

        resolve(result);
      });
    });
  }

  startTraining(personId, name, algorithm = 'LBPH') {
    if (this.training.state === 'training') {
      throw new Error('Training already in progress');
    }

    const originalDir = path.join(FACES_DIR, personId, 'photos', 'original');
    if (!fs.existsSync(originalDir)) {
      throw new Error('No photos uploaded for this person');
    }

    const photoPaths = fs.readdirSync(originalDir).map(f => path.join(originalDir, f));
    if (photoPaths.length === 0) {
      throw new Error('No photos uploaded for this person');
    }

    this.setTrainingState('training', { personId, name, error: null, startedAt: Date.now(), finishedAt: null, result: null });

    this.train(personId, name, photoPaths, algorithm)
      .then(result => {
        this.setTrainingState('idle', { personId: null, name: null, error: null, finishedAt: Date.now(), result });
        this.stop();
        this.start();
      })
      .catch(err => {
        this.setTrainingState('error', { error: err.message, finishedAt: Date.now() });
      });

    return { ok: true, state: 'training', message: 'Training started' };
  }

  async delete(personId) {
    const personDir = path.join(FACES_DIR, personId);
    if (fs.existsSync(personDir)) {
      fs.rmSync(personDir, { recursive: true, force: true });
    }

    // If any persons remain, retrain; otherwise remove model files.
    const remaining = fs.existsSync(FACES_DIR)
      ? fs.readdirSync(FACES_DIR).filter(id => {
          const p = path.join(FACES_DIR, id);
          return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'label.json'));
        })
      : [];

    if (remaining.length === 0) {
      ['trainer.yml', 'labels.json', 'algorithm.json'].forEach(file => {
        const p = path.join(FACES_DIR, file);
        if (fs.existsSync(p)) fs.rmSync(p);
      });
      return { ok: true, retrained: false };
    }

    // Retrain with the first remaining person using the saved algorithm.
    const algorithm = this.getAlgorithm();
    const firstId = remaining[0];
    const label = JSON.parse(fs.readFileSync(path.join(FACES_DIR, firstId, 'label.json'), 'utf8'));
    const originalDir = path.join(FACES_DIR, firstId, 'photos', 'original');
    const photos = fs.existsSync(originalDir)
      ? fs.readdirSync(originalDir).map(f => path.join(originalDir, f))
      : [];

    if (photos.length === 0) {
      return { ok: true, retrained: false, warning: 'No photos to retrain' };
    }

    return this.train(firstId, label.name, photos, algorithm);
  }

  getPersons() {
    if (!fs.existsSync(FACES_DIR)) return [];
    return fs.readdirSync(FACES_DIR)
      .map(id => {
        const labelPath = path.join(FACES_DIR, id, 'label.json');
        if (!fs.existsSync(labelPath)) return null;
        const info = JSON.parse(fs.readFileSync(labelPath, 'utf8'));
        return { id: info.id || id, name: info.name };
      })
      .filter(Boolean);
  }

  getModelStatus() {
    const modelPath = path.join(FACES_DIR, 'trainer.yml');
    return {
      ready: fs.existsSync(modelPath),
      persons: this.getPersons().length,
      algorithm: this.getAlgorithm()
    };
  }

  getAlgorithm() {
    const algorithmPath = path.join(FACES_DIR, 'algorithm.json');
    if (fs.existsSync(algorithmPath)) {
      return JSON.parse(fs.readFileSync(algorithmPath, 'utf8')).algorithm;
    }
    return this.config.faceLock?.algorithm || 'LBPH';
  }
}

module.exports = FaceService;
