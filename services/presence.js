const { EventEmitter } = require('events');
const { exec } = require('child_process');

class PresenceService extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config.presence || {};
    this.timer = null;
    this.awake = true;
    this.handlers = [];
    this.hardware = null;
    this.faceService = null;
  }

  setConfig(config) {
    this.config = config.presence || {};
  }

  start({ hardware, faceService } = {}) {
    this.stop();
    this.hardware = hardware;
    this.faceService = faceService;

    if (!this.config.enabled) {
      console.log('Presence service disabled');
      return;
    }

    const source = this.config.source || 'hardware';

    if (source === 'camera') {
      if (!this.faceService) {
        console.log('Presence source is camera but face service is unavailable');
        return;
      }
      console.log('Presence service started (camera source)');
      this.faceHandler = event => {
        if (event.type === 'detected' || event.type === 'unknown') {
          this.wake();
        } else if (event.type === 'lost' || event.type === 'cleared') {
          this.resetSleepTimer();
        }
      };
      this.faceService.on('face', this.faceHandler);
      this.resetSleepTimer();
      return;
    }

    // Default/hardware source
    if (!this.hardware) {
      console.log('Presence service disabled or no hardware available');
      return;
    }

    console.log('Presence service started (hardware source)');

    const wakeEvents = this.config.wakeEvents || ['motion.detected'];
    const sleepEvents = this.config.sleepEvents || [];

    wakeEvents.forEach(eventType => {
      const handler = event => {
        if (event.eventType === eventType) this.wake();
      };
      this.hardware.on('event', handler);
      this.handlers.push(handler);
    });

    sleepEvents.forEach(eventType => {
      const handler = event => {
        if (event.eventType === eventType) this.sleep();
      };
      this.hardware.on('event', handler);
      this.handlers.push(handler);
    });

    this.resetSleepTimer();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.hardware) {
      this.handlers.forEach(handler => this.hardware.removeListener('event', handler));
    }
    if (this.faceService && this.faceHandler) {
      this.faceService.removeListener('face', this.faceHandler);
    }
    this.handlers = [];
    this.hardware = null;
    this.faceService = null;
    this.faceHandler = null;
  }

  wake() {
    if (!this.awake) {
      this.awake = true;
      console.log('Presence: awake');
      this.runDisplayCommand('onCommand');
      this.emit('presence', { type: 'presence.awake', data: {} });
    }
    this.resetSleepTimer();
  }

  sleep() {
    if (this.awake) {
      this.awake = false;
      console.log('Presence: sleeping');
      this.runDisplayCommand('offCommand');
      this.emit('presence', { type: 'presence.sleeping', data: {} });
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  resetSleepTimer() {
    if (this.timer) clearTimeout(this.timer);
    const timeout = (this.config.timeout || 30) * 1000;
    this.timer = setTimeout(() => this.sleep(), timeout);
  }

  runDisplayCommand(commandKey) {
    const command = this.config.display && this.config.display[commandKey];
    if (!command) return;
    exec(command, err => {
      if (err) {
        console.error(`Presence command failed: ${command}`, err.message);
      }
    });
  }
}

module.exports = PresenceService;
