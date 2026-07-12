# Setup Dashboard

OpenMirror includes a visual setup dashboard. You can use it to arrange modules without editing JSON files.

## Open the dashboard

Start the server and open:

```text
http://localhost:3000/setup.html
```

## How to use

1. Drag a module from the sidebar onto the grid.
2. Drag a placed module to move it.
3. Drag the blue corner handle to resize it.
4. Click the red x to remove a module.
5. Switch between pages using the tabs above the grid.
6. Click **+ Add page** to create a new page.
7. Set the page rotation interval and enable or disable rotation.
8. If your mirror screen is rotated 90°, enable **Portrait preview** so the grid matches the real display.
9. Review the config JSON in the sidebar.
10. Click **Save Layout**.
11. Open the mirror at `http://localhost:3000` to see the pages rotate.

## Voice Commands

OpenMirror supports voice commands through the browser's Web Speech API. This works in Chromium-based browsers such as Chrome and Edge.

### How it works

1. The mirror listens for speech continuously.
2. If the wake word is detected, the mirror checks the rest of the phrase for a known command.
3. The command is dispatched as an event that modules can listen to.
4. Built-in actions handle page navigation and wake/sleep.

### Settings

- **Enable voice commands**: turn the feature on or off
- **Require wake word**: if checked, commands only work after saying the wake word
- **Wake word**: the word that activates listening, default is "mirror"
- **Language**: speech recognition language, default is `en-US`
- **Commands**: one per line, format `phrase=event`

### Default commands

```text
next page=page.next
previous page=page.previous
go to sleep=presence.sleep
wake up=presence.wake
```

### Module example

```javascript
export default function ({ container, bus }) {
  const statusEl = container.querySelector('.status');

  bus.addEventListener('voice.weather', event => {
    statusEl.textContent = 'Weather requested by voice';
  });
}
```

### Notes

- Voice recognition requires a microphone and browser permission.
- It works on `localhost` without HTTPS. On a real mirror, you may need HTTPS.
- Internet connection may be required depending on the browser's speech engine.

## MQTT Bridge

OpenMirror can connect to an MQTT broker to publish hardware and presence events, and to receive commands from home automation systems.

### How it works

- Hardware events are published to a topic like `openmirror/hardware`
- Presence state changes are published to a topic like `openmirror/presence`
- Subscribed topics receive messages and forward them as events to modules

### Settings

- **Enable MQTT bridge**: turn the feature on or off
- **Broker host, port, protocol**: MQTT broker connection details
- **Client ID**: identifier for this mirror
- **Username / Password**: optional broker credentials
- **Hardware publish topic**: topic for hardware events
- **Presence publish topic**: topic for presence state changes
- **Subscribe topics**: one per line, format `topic=eventType`

### Example subscribe topics

```text
openmirror/command=mqtt.command
home/livingroom/light=light.changed
```

### Example published message

Topic: `openmirror/hardware`

```json
{
  "eventType": "motion.detected",
  "data": { "deviceId": "test-motion", "value": 1 },
  "timestamp": "2026-07-03T20:00:00.000Z"
}
```

### Module example

```javascript
export default function ({ container, bus }) {
  const statusEl = container.querySelector('.status');

  bus.addEventListener('mqtt.command', event => {
    statusEl.textContent = event.detail.payload.message;
  });
}
```

## Presence wake and sleep

OpenMirror can automatically wake the mirror when someone is nearby and put it to sleep when no one is present.

### How it works

1. A hardware device sends a wake event, for example `motion.detected`.
2. The mirror wakes up and shows the active page.
3. If no wake event arrives within the timeout, the mirror goes to sleep.
4. Optionally, the server runs a shell command to turn the physical display on or off.

### Settings

- **Enable presence wake/sleep**: turn the feature on or off
- **Wake events**: comma separated list of event names that wake the mirror
- **Sleep events**: comma separated list of event names that immediately put the mirror to sleep
- **Sleep timeout**: seconds of inactivity before the mirror sleeps
- **Display on command**: shell command to turn the display on (example: `vcgencmd display_power 1`)
- **Display off command**: shell command to turn the display off (example: `vcgencmd display_power 0`)

### Display commands per platform

- Raspberry Pi: `vcgencmd display_power 1` and `vcgencmd display_power 0`
- Linux with X11: `xset dpms force on` and `xset dpms force off`
- Windows: `powercfg /setacvalueindex` or third-party tools like NirCmd
- Leave blank to only dim the screen in the browser

### Default behavior

The default config enables presence detection with the test motion device. The mirror wakes on `motion.detected` and sleeps after 30 seconds of no motion.

## Hardware

OpenMirror has a built-in hardware service for GPIO, USB serial, and test devices. Modules can react to hardware events without writing device-specific code.

### Supported hardware types

- **GPIO Input**: Raspberry Pi GPIO pins for PIR, radar, or buttons
- **Radar Sensor**: Serial mmWave radar sensors such as HLK-LD2410
- **USB Serial**: Generic USB serial devices such as Arduino or custom sensors
- **Test Device**: Simulated device that fires events on an interval

### How to add hardware

1. In the setup dashboard, scroll to the Hardware section.
2. Select the hardware type.
3. Enter a name.
4. Fill in the settings:
   - GPIO: pin number and edge
   - Serial: port from the dropdown and baud rate
   - Test: interval in seconds
5. Enter the event name that modules will listen for.
6. Click **Add Hardware**.
7. Save the layout.

The server will start the device immediately. Any module can listen for the event name you configured.

### Radar sensors

For radar sensors that output serial data, use the **Radar Sensor** hardware type.

Supported models:

- **LD2410**: HLK-LD2410 mmWave radar. Default baud rate is 115200. The parser looks for `ON` and `OFF` in the serial output.
- **Generic**: Any serial radar that outputs configurable strings for presence and no presence.

Example LD2410 config:

```json
{
  "id": "entry-radar",
  "name": "Entry Radar",
  "type": "radar",
  "enabled": true,
  "settings": {
    "model": "ld2410",
    "port": "/dev/ttyUSB0",
    "baudRate": 115200
  },
  "events": {
    "detected": "motion.detected",
    "cleared": "motion.cleared"
  }
}
```

Make sure the serialport package is installed:

```bash
npm install serialport
```

### Example module listening to hardware

```javascript
export default function ({ container, bus }) {
  const statusEl = container.querySelector('.status');

  bus.addEventListener('motion.detected', event => {
    statusEl.textContent = 'Motion detected';
  });
}
```

### Serial devices

For USB serial, install the serialport package:

```bash
npm install serialport
```

The setup dashboard lists available ports automatically. If the package is not installed, the dropdown will be empty and you can type the port manually.

### GPIO devices

For Raspberry Pi GPIO, install the onoff package:

```bash
npm install onoff
```

## Face Lock

Face lock lets the mirror show different pages for different people. All processing happens locally in the browser.

### How to set up

1. In the setup dashboard, enable **Face Lock**.
2. Optionally enable **Show camera preview** to see what the camera sees.
3. Enter a name for the person.
4. Select which page to show for that person.
5. Select one or more photos with a clear view of the person's face.
6. Click **Add Face**.
7. Save the layout.
8. Open the mirror and allow camera access.

The mirror will now switch to the person's page when it recognizes them. After they leave, it returns to the default page or resumes rotation.

### Privacy notes

- Face descriptors are stored locally in `data/faces/`.
- No images or biometric data leave your device.
- The camera preview is optional and can be hidden.
- For production use, download the face-api models and host them locally instead of loading from a CDN.

## Config format

The dashboard saves a multi-page config:

```json
{
  "grid": {
    "columns": 12,
    "rows": 8
  },
  "rotation": {
    "enabled": true,
    "interval": 10
  },
  "screen": {
    "rotation": "normal"
  },
  "faceLock": {
    "enabled": false,
    "confidenceThreshold": 0.6,
    "releaseDelay": 3,
    "showPreview": false,
    "persons": [],
    "defaultPage": "Main",
    "unknownPage": "Main"
  },
  "mqtt": {
    "enabled": false,
    "broker": {
      "host": "localhost",
      "port": 1883,
      "protocol": "mqtt",
      "clientId": "openmirror",
      "username": "",
      "password": ""
    },
    "publish": {
      "hardware": "openmirror/hardware",
      "presence": "openmirror/presence"
    },
    "subscribe": [
      {
        "topic": "openmirror/command",
        "eventType": "mqtt.command"
      }
    ]
  },
  "presence": {
    "enabled": true,
    "wakeEvents": ["motion.detected"],
    "sleepEvents": [],
    "timeout": 30,
    "display": {
      "onCommand": "",
      "offCommand": ""
    }
  },
  "hardware": [
    {
      "id": "test-motion",
      "name": "Test Motion",
      "type": "test",
      "enabled": true,
      "settings": {
        "interval": 60
      },
      "events": {
        "trigger": "motion.detected"
      }
    }
  ],
  "pages": [
    {
      "name": "Main",
      "modules": {
        "clock": {
          "x": 0,
          "y": 0,
          "width": 4,
          "height": 2,
          "config": {}
        }
      }
    }
  ]
}
```

When you save, the server broadcasts the new config and all connected mirror windows reload automatically.
