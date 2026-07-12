# OpenMirror SaaS Protocol

This document describes the messages exchanged between an OpenMirror device and the SaaS backend.

## Connection

The device opens an **outbound** WebSocket to the SaaS backend:

```
wss://<saas-backend>/devices
```

## Authentication

The first message from the device must be `auth`:

```json
{
  "type": "auth",
  "licenseKey": "OM-XXXX-XXXX",
  "deviceId": "mirror-kitchen",
  "name": "Kitchen Mirror",
  "version": "0.11.0"
}
```

The backend replies:

```json
{ "type": "auth", "status": "ok", "tier": "business" }
```

or

```json
{ "type": "auth", "status": "error", "message": "invalid license" }
```

## Device → Backend

### `status` (periodic)

Sent every 30 seconds while connected.

```json
{
  "type": "status",
  "version": "0.11.0",
  "page": "Main",
  "sleeping": false,
  "uptime": 12345
}
```

### `telemetry`

Forwarded hardware / presence / face events. The device only sends events the user opted to share.

```json
{
  "type": "telemetry",
  "eventType": "motion.detected",
  "data": {}
}
```

### `log` (optional, Enterprise tier)

```json
{
  "type": "log",
  "level": "error",
  "message": "..."
}
```

## Backend → Device

### `config`

Pushes a full config object. The device saves it and restarts services.

```json
{
  "type": "config",
  "data": { /* full OpenMirror config */ }
}
```

### `command`

Dispatches a command on the device.

```json
{
  "type": "command",
  "command": "wake",
  "data": {}
}
```

Supported commands: `wake`, `sleep`, `page.next`, `page.previous`, `reload`, `ping`.

### `install-module`

Tells the device to download and install a module from the module store.

```json
{
  "type": "install-module",
  "moduleId": "weather",
  "version": "1.2.0",
  "downloadUrl": "https://store.openmirror.example/modules/weather-1.2.0.zip"
}
```

The device replies with:

```json
{ "type": "install-module", "moduleId": "weather", "status": "ok" }
```

or an error status.

## Backend → Dashboard

Dashboards connect to a separate namespace (e.g. `/dashboard`) and authenticate with a JWT. The backend forwards device `status` and `telemetry` messages to the user's dashboard, and routes dashboard messages to the selected device.
