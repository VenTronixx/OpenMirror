# HTTP and WebSocket API

OpenMirror provides a built-in API so third-party services and hardware can send data without writing an addon.

## HTTP Endpoints

### GET /api/health

Returns server status.

```json
{
  "status": "ok",
  "version": "0.5.0"
}
```

### GET /api/modules

Lists all installed modules.

### GET /api/config

Returns the current layout configuration.

### POST /api/config

Updates the layout configuration. All connected clients will reload.

### POST /api/push/:moduleId

Pushes data to a specific module. The data is forwarded to all connected clients through WebSocket.

Example:

```bash
curl -X POST http://localhost:3000/api/push/weather \
  -H "Content-Type: application/json" \
  -d '{"temp": 22, "description": "Sunny"}'
```

### GET /api/faces

Lists all saved face descriptors for face lock.

### POST /api/faces/:personId

Saves face descriptors for a person.

Request body:

```json
{
  "name": "Timo",
  "page": "Personal",
  "descriptors": [
    [0.1, 0.2, ...]
  ]
}
```

### DELETE /api/faces/:personId

Deletes a saved face.

### GET /api/hardware/schema

Returns the schema for supported hardware types and their settings.

### GET /api/serialports

Lists available serial ports. Requires the serialport package to be installed.

### GET /api/weather?location=

Fetches current weather for the given location from wttr.in and returns it as JSON. Used by the built-in weather module so the browser does not need to call the third-party service directly.

Example:

```bash
curl 'http://localhost:3000/api/weather?location=Berlin'
```

Response:

```json
{
  "description": "Partly cloudy",
  "temp": "+19°C"
}
```

### GET /api/calendar?url=&limit=

Fetches an ICS calendar file from the given URL, parses it, and returns upcoming events as JSON. Used by the built-in calendar module because browsers cannot fetch arbitrary ICS links due to CORS.

Example:

```bash
curl 'http://localhost:3000/api/calendar?url=https://example.com/calendar.ics&limit=5'
```

Response:

```json
[
  {
    "title": "Team meeting",
    "start": "2026-07-08T10:00:00.000Z",
    "end": "2026-07-08T11:00:00.000Z",
    "allDay": false,
    "location": "Office"
  }
]
```

## WebSocket

Connect to `ws://localhost:3000/ws`.

Messages are JSON objects. The mirror handles these message types:

- `push`: data targeted at a specific module
- `event`: generic hardware or external event
- `config`: configuration has changed, clients should reload

To react to pushed data, listen for events with type `push` and the matching `moduleId`. To react to hardware events, listen for the event name configured in the hardware settings.

## Use cases

- Home automation systems can push sensor data
- Weather services can update the weather module
- Calendars can push upcoming events
- Radar or GPIO scripts on the Pi can push motion or distance data
- Hardware service can broadcast motion, button, or serial events to modules
- Face lock can trigger page switches based on recognized persons

No addon is required for simple data pushing or hardware events. If a service needs custom rendering, then a module makes sense.
