const { EventEmitter } = require('events');
const mqtt = require('mqtt');

class MqttService extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config.mqtt || {};
    this.client = null;
    this.subscribedTopics = [];
  }

  setConfig(config) {
    this.config = config.mqtt || {};
  }

  start() {
    this.stop();
    if (!this.config.enabled) return;

    const broker = this.config.broker || {};
    const host = broker.host || 'localhost';
    const port = broker.port || 1883;
    const protocol = broker.protocol || 'mqtt';
    const url = `${protocol}://${host}:${port}`;
    const options = {
      clientId: broker.clientId || 'openmirror',
      reconnectPeriod: 5000,
      connectTimeout: 30 * 1000
    };

    if (broker.username) options.username = broker.username;
    if (broker.password) options.password = broker.password;

    console.log(`Connecting to MQTT broker at ${url}`);

    this.client = mqtt.connect(url, options);

    this.client.on('connect', () => {
      console.log('MQTT connected');
      this.subscribeToTopics();
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });

    this.client.on('error', err => {
      console.error('MQTT error:', err.message);
    });

    this.client.on('offline', () => {
      console.log('MQTT offline');
    });

    this.client.on('reconnect', () => {
      console.log('MQTT reconnecting...');
    });
  }

  stop() {
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
    this.subscribedTopics = [];
  }

  subscribeToTopics() {
    const subscriptions = this.config.subscribe || [];
    subscriptions.forEach(sub => {
      if (!sub.topic) return;
      this.client.subscribe(sub.topic, err => {
        if (err) {
          console.error(`MQTT subscribe error for ${sub.topic}:`, err.message);
        } else {
          console.log(`MQTT subscribed to ${sub.topic}`);
        }
      });
    });
  }

  handleMessage(topic, message) {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch (err) {
      payload = { raw: message.toString() };
    }

    const subscriptions = this.config.subscribe || [];
    const sub = subscriptions.find(s => s.topic === topic);
    const eventType = sub?.eventType || `mqtt.${topic.replace(/\//g, '.')}`;

    this.emit('event', {
      type: 'event',
      eventType,
      data: { topic, payload }
    });
  }

  publishHardware(event) {
    if (!this.client || !this.client.connected) return;
    const topic = this.config.publish?.hardware;
    if (!topic) return;

    this.client.publish(topic, JSON.stringify({
      eventType: event.eventType,
      data: event.data,
      timestamp: new Date().toISOString()
    }));
  }

  publishPresence(type) {
    if (!this.client || !this.client.connected) return;
    const topic = this.config.publish?.presence;
    if (!topic) return;

    this.client.publish(topic, JSON.stringify({
      state: type === 'presence.awake' ? 'awake' : 'sleeping',
      timestamp: new Date().toISOString()
    }));
  }
}

module.exports = MqttService;
