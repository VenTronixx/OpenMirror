const { EventEmitter } = require('events');

class HardwareService extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.devices = new Map();
  }

  setConfig(config) {
    this.config = config;
  }

  start() {
    this.stop();
    if (!this.config.hardware || !Array.isArray(this.config.hardware)) return;
    this.config.hardware.forEach(device => {
      if (device.enabled !== false) this.startDevice(device);
    });
  }

  stop() {
    this.devices.forEach(device => {
      try {
        if (device.instance && typeof device.instance.close === 'function') {
          device.instance.close();
        }
        if (device.instance && typeof device.instance.unwatch === 'function') {
          device.instance.unwatch();
        }
      } catch (err) {
        console.error(`Error stopping device ${device.id}:`, err.message);
      }
    });
    this.devices.clear();
  }

  startDevice(device) {
    try {
      if (device.type === 'gpio') this.startGpio(device);
      else if (device.type === 'radar') this.startRadar(device);
      else if (device.type === 'serial') this.startSerial(device);
      else if (device.type === 'speaker') this.startSpeaker(device);
      else if (device.type === 'microphone') this.startMicrophone(device);
      else if (device.type === 'camera') this.startCamera(device);
      else if (device.type === 'test') this.startTest(device);
      else console.warn(`Unknown hardware type: ${device.type}`);
    } catch (err) {
      console.error(`Failed to start hardware device ${device.id}:`, err.message);
    }
  }

  startGpio(device) {
    let Gpio;
    try {
      Gpio = require('onoff').Gpio;
    } catch (err) {
      throw new Error('onoff package not installed. Run: npm install onoff');
    }

    const settings = device.settings || {};
    const pins = Array.isArray(settings.pins) && settings.pins.length > 0
      ? settings.pins
      : [{ pin: settings.pin, edge: settings.edge || 'both', event: device.events?.high || device.events?.low }];

    const instances = [];
    pins.forEach(pinConfig => {
      const pin = parseInt(pinConfig.pin, 10);
      const edge = pinConfig.edge || 'both';
      const eventName = pinConfig.event;

      if (isNaN(pin)) {
        console.warn(`GPIO ${device.id}: invalid pin, skipping`);
        return;
      }

      const gpio = new Gpio(pin, 'in', edge);
      instances.push(gpio);

      gpio.watch((err, value) => {
        if (err) {
          console.error(`GPIO ${device.id} pin ${pin} error:`, err.message);
          return;
        }
        if (eventName) {
          this.emit('event', {
            type: 'event',
            eventType: eventName,
            data: { deviceId: device.id, value, pin }
          });
        }
      });

      console.log(`Started GPIO ${device.id} pin ${pin} (${edge})`);
    });

    this.devices.set(device.id, {
      type: 'gpio',
      instance: instances,
      close() {
        instances.forEach(gpio => gpio.unexport());
      }
    });
  }

  startRadar(device) {
    let SerialPort;
    try {
      SerialPort = require('serialport').SerialPort;
    } catch (err) {
      throw new Error('serialport package not installed. Run: npm install serialport');
    }

    const settings = device.settings || {};
    const path = settings.port;
    const baudRate = settings.baudRate || 115200;
    const model = settings.model || 'ld2410';
    const onString = (settings.onString || 'ON').toLowerCase();
    const offString = (settings.offString || 'OFF').toLowerCase();

    if (!path) {
      throw new Error('Serial port not configured');
    }

    const port = new SerialPort({ path, baudRate });
    let buffer = '';

    port.on('data', data => {
      buffer += data.toString();
      let lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const lower = trimmed.toLowerCase();
        let state = null;

        if (model === 'ld2410') {
          if (lower.includes('on')) state = 'detected';
          else if (lower.includes('off')) state = 'cleared';
        } else {
          if (lower.includes(onString)) state = 'detected';
          else if (lower.includes(offString)) state = 'cleared';
        }

        if (state === 'detected' && device.events?.detected) {
          this.emit('event', {
            type: 'event',
            eventType: device.events.detected,
            data: { deviceId: device.id, raw: trimmed, state }
          });
        } else if (state === 'cleared' && device.events?.cleared) {
          this.emit('event', {
            type: 'event',
            eventType: device.events.cleared,
            data: { deviceId: device.id, raw: trimmed, state }
          });
        }
      });
    });

    port.on('error', err => {
      console.error(`Radar device ${device.id} error:`, err.message);
    });

    this.devices.set(device.id, { type: 'radar', instance: port });
    console.log(`Started radar device ${device.id} (${model}) on ${path}`);
  }

  startSerial(device) {
    let SerialPort;
    try {
      SerialPort = require('serialport').SerialPort;
    } catch (err) {
      throw new Error('serialport package not installed. Run: npm install serialport');
    }

    const settings = device.settings || {};
    const path = settings.port;
    const baudRate = settings.baudRate || 9600;

    if (!path) {
      throw new Error('Serial port not configured');
    }

    const port = new SerialPort({ path, baudRate });
    let buffer = '';

    port.on('data', data => {
      buffer += data.toString();

      if (device.parser === 'json') {
        let lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            const parsed = JSON.parse(trimmed);
            this.emit('event', {
              type: 'event',
              eventType: device.events?.trigger || `hardware.${device.id}`,
              data: { deviceId: device.id, ...parsed }
            });
          } catch (err) {
            this.emit('event', {
              type: 'event',
              eventType: device.events?.trigger || `hardware.${device.id}`,
              data: { deviceId: device.id, raw: trimmed }
            });
          }
        });
      } else {
        const trimmed = buffer.trim();
        buffer = '';
        if (!trimmed) return;
        this.emit('event', {
          type: 'event',
          eventType: device.events?.trigger || `hardware.${device.id}`,
          data: { deviceId: device.id, raw: trimmed }
        });
      }
    });

    port.on('error', err => {
      console.error(`Serial device ${device.id} error:`, err.message);
    });

    this.devices.set(device.id, { type: 'serial', instance: port });
    console.log(`Started serial device ${device.id} on ${path}`);
  }

  startSpeaker(device) {
    const settings = device.settings || {};
    const audioOutput = settings.audioOutput || 'default';
    console.log(`Configured speaker ${device.id} (output: ${audioOutput})`);
    this.devices.set(device.id, {
      type: 'speaker',
      instance: { settings },
      close() {}
    });
  }

  startMicrophone(device) {
    const settings = device.settings || {};
    const usbDevice = settings.usbDevice || 'default';
    console.log(`Configured microphone ${device.id} (USB: ${usbDevice})`);
    this.devices.set(device.id, {
      type: 'microphone',
      instance: { settings },
      close() {}
    });
  }

  startCamera(device) {
    const settings = device.settings || {};
    const cameraIndex = settings.cameraIndex != null ? settings.cameraIndex : 0;
    console.log(`Configured camera ${device.id} (index: ${cameraIndex})`);
    this.devices.set(device.id, {
      type: 'camera',
      instance: { settings },
      close() {}
    });
  }

  startTest(device) {
    const settings = device.settings || {};
    const interval = (settings.interval || 5) * 1000;
    const eventName = device.events?.trigger || `hardware.${device.id}`;

    const timer = setInterval(() => {
      this.emit('event', {
        type: 'event',
        eventType: eventName,
        data: { deviceId: device.id, value: 1, timestamp: Date.now() }
      });
    }, interval);

    this.devices.set(device.id, { type: 'test', instance: { close: () => clearInterval(timer) } });
    console.log(`Started test device ${device.id} with interval ${interval}ms`);
  }
}

module.exports = HardwareService;
