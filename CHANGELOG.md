# Changelog

All notable changes to OpenMirror are documented in this file.

## [Unreleased]

### Added

- Expanded README with the full project story, repository link, and descriptions for all built-in modules.
- Repository URLs in README, docs, and package.json now point to `https://github.com/VenTronixx/OpenMirror`.
- `.gitignore` now excludes the external website, SaaS planning, and strategic blueprint directories.

### Changed

- README install and clone commands updated to the new repository location.
- Included modules section now covers all current modules with practical examples.

### In progress

- Face training and camera improvements.
- General stability, setup, and module quality improvements.

## [0.11.0] - 2026-07-10

### Removed

- Removed the local-network Remote Management feature (server/client WebSocket mode, `/remote` path, and `/remote.html` dashboard).
- Removed the `remote` config section from the default config.
- Remote control is now provided exclusively through the Cloud/SaaS connection.

## [0.10.0] - 2026-07-04

### Added

- Remote management system for controlling multiple mirrors
- Server mode: accept WebSocket connections from remote mirror clients
- Client mode: mirror connects to a central server and receives config/commands
- Remote dashboard at `/remote.html`
- View connected clients, push config, and send commands
- Broadcast reload, wake, and sleep commands to all clients
- Token-based authentication for remote connections
- Heartbeat tracking for remote clients
- Remote management settings in the setup dashboard
- New `remote` config section

### Changed

- Server now supports two WebSocket paths: `/ws` for local mirrors and `/remote` for remote clients
- Mirror frontend can operate in client mode and receive remote config updates
- Setup dashboard includes Remote Management section
- Default config includes remote management with standalone mode

## [0.9.0] - 2026-07-03

### Added

- Radar sensor hardware type
- Support for HLK-LD2410 mmWave radar in text mode
- Support for generic serial radar with configurable presence strings
- Automatic parsing of ON/OFF presence states from radar serial output
- Radar settings in the hardware setup form

### Changed

- Hardware schema now includes a `radar` type
- Hardware service handles radar-specific serial parsing
- Hardware documentation updated with radar examples

## [0.8.0] - 2026-07-03

### Added

- Voice command support using the browser's Web Speech API
- Configurable wake word, for example "mirror"
- Custom voice commands mapped to events
- Built-in voice actions for next/previous page and wake/sleep
- Voice settings in the setup dashboard
- New `voice` config section
- New `public/js/voice.js` service

### Changed

- Mirror frontend starts voice recognition when enabled
- Modules can listen to voice command events through the shared bus
- Setup dashboard includes Voice Commands section
- Default config includes a disabled voice section with example commands

## [0.7.0] - 2026-07-03

### Added

- MQTT bridge service for home automation integration
- Publish hardware events to an MQTT topic
- Publish presence state changes to an MQTT topic
- Subscribe to MQTT topics and forward messages to modules as events
- MQTT settings in the setup dashboard
- Reconnect logic for MQTT broker connection
- New `mqtt` dependency and config section

### Changed

- Server now broadcasts MQTT, hardware, and presence events through the same WebSocket channel
- Setup dashboard includes MQTT broker, publish, and subscribe configuration
- Default config includes a disabled MQTT bridge with example settings

## [0.6.0] - 2026-07-03

### Added

- Presence service for automatic wake and sleep
- Wake on hardware events such as motion detection
- Sleep after a configurable timeout of no activity
- Optional shell commands to turn the physical display on or off
- Browser sleep overlay that dims the mirror when sleeping
- Presence settings in the setup dashboard
- New `presence` config section

### Changed

- Default config enables presence detection with the test motion device
- Mirror frontend handles `presence.awake` and `presence.sleeping` events
- Server broadcasts presence state changes to all clients
- Test motion device interval changed to 60 seconds to demonstrate sleep

## [0.5.0] - 2026-07-03

### Added

- Built-in hardware service for GPIO, USB serial, and test devices
- Hardware schema system for easy device configuration
- Hardware management UI in the setup dashboard
- Automatic serial port detection in the setup dashboard
- Generic hardware events broadcast to all modules via WebSocket
- Test device included in default config for out-of-the-box testing
- New `/api/hardware/schema` endpoint
- New `/api/serialports` endpoint

### Changed

- Config format now includes a `hardware` array
- Mirror frontend dispatches generic hardware events to the module bus
- Setup dashboard reorganized with a Hardware section
- Server restarts hardware service automatically when config is saved

## [0.4.0] - 2026-07-03

### Added

- Face lock feature using the camera and face recognition
- Browser-based face descriptor computation in the setup dashboard
- Add, delete and manage known faces from the setup dashboard
- Map each recognized person to a specific page
- Automatic return to default page or rotation when no face is detected
- Optional camera preview overlay on the mirror
- New `/api/faces` endpoints for storing and retrieving face descriptors
- Privacy-first local storage of face descriptors in `data/faces/`

### Changed

- Default config now includes a disabled `faceLock` section
- Setup dashboard sidebar reorganized with Face Lock section
- Mirror frontend can pause rotation when a known face is detected

## [0.3.0] - 2026-07-03

### Added

- Multi-page layout support
- Page rotation with configurable interval
- Page tabs in the setup dashboard
- Add, rename, and delete pages from the setup dashboard
- Module lifecycle hooks: `pause` and `resume`
- Clock module now pauses when hidden and resumes when shown

### Changed

- Config format now uses `pages` array instead of a single `modules` object
- Mirror frontend pre-renders all pages and toggles visibility for smooth rotation
- Setup dashboard includes rotation settings and page management controls
- Default config includes two pages: Main and Focus

## [0.2.0] - 2026-07-03

### Added

- Visual setup dashboard at `/setup.html`
- Drag and drop module placement
- Resize modules with corner handles
- Coordinate-based layout config with grid columns and rows

### Changed

- Config format moved from region-based layout (`top-left`, `top-right`, etc.) to coordinate-based layout (`x`, `y`, `width`, `height`)
- Mirror frontend now renders modules using CSS grid placement
- Module documentation updated for new config format

## [0.1.0] - 2026-07-03

### Added

- Initial release of OpenMirror
- Express server with static file serving
- Module loader that scans the `modules/` folder
- Nine-region CSS grid layout
- Clock module with live time and date
- Weather module with wttr.in integration and push API support
- HTTP API for health, modules, config, and pushing data
- WebSocket support for real-time updates
- One-command installers for Linux, macOS, and Windows
- Raspberry Pi kiosk setup script
- SD card image builder concept script
- Documentation: README, install guide, module guide, and API guide

### Notes

- This is the first public version. APIs may change in future releases.
