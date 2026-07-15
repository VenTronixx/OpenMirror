# Changelog

All notable changes to OpenMirror are documented in this file.

## [Unreleased]

### Fixed

- GPIO hardware support rewritten to use `libgpiod` (`gpiomon`/`gpioget`) instead of `onoff`, because Raspberry Pi OS Bookworm disables the legacy sysfs GPIO interface. This makes GPIO input events and current-state reads actually work on the Pi.

### Added

- `GET /api/hardware/gpio/:deviceId/:pin` endpoint returns the last known state of a configured GPIO input pin.

## [0.12.0] - 2026-07-15

> **Baseline release.** This release gets the core platform and modules into a working, testable state. Many features are functional, but first releases are meant to establish the baseline of modules and functions — deeper integration, polish, and real-world testing are still in progress.

### Added

- Expanded README with the full project story, repository link, and descriptions for all built-in modules.
- Repository URLs in README, docs, and package.json now point to `https://github.com/VenTronixx/OpenMirror`.
- `.gitignore` now excludes the external website, SaaS planning, and strategic blueprint directories.
- New **Pollen** module with Open-Meteo (global) and DWD (Germany) data sources, sorted high to low, and optional raw value display.
- Searchable DWD region dropdown for the Pollen module (uses real DWD region names such as "Ostwestfalen").
- Conditional config field support (`visibleWhen`) in the setup dashboard; used to show the DWD region field only when the DWD provider is selected.
- Shared module auto-fit helper at `modules/shared/autoFit.js` for consistent font scaling across modules.
- JavaScript-driven auto-fit for Clock, Weather, Air Quality, and Calendar modules.
- Calendar grid/list view support with the "Max events" field hidden when a grid view is selected.
- Server endpoint `DELETE /api/modules/:moduleId` to permanently delete custom (duplicated) module folders.
- Trash-can delete button in the setup module list for custom modules, with a confirmation dialog and automatic cleanup of any placed instances.
- `ROADMAP.md` to track current work and upcoming plans.
- Per-person training progress text shown directly under the person's name in the Faces list while training is running.
- Camera hardware type is now dispatched correctly in the hardware service so a configured USB/Pi camera is no longer logged as "Unknown hardware type: camera".
- Face service now ensures the preview directory exists before starting the Python recognition process.
- New **Camera Preview** button in the Faces tab. Starts a lightweight preview process so you can verify the camera works without a trained face model.
- New `scripts/camera_preview.py` helper and `POST /api/faces/camera/preview/start|stop` endpoints.
- `scripts/deploy-pi.sh` now syncs the new `camera_preview.py` script to the Pi.
- Rewrote camera capture to use `ffmpeg` with V4L2 instead of OpenCV/picamera2, because the Pi's OpenCV/picamera2 backend hangs with this USB camera. Added `scripts/camera_utils.py` as a shared ffmpeg/picamera2/OpenCV camera abstraction.
- Recognition test mode now scans every 0.5 s (was 1 s) for a more responsive preview.
- Preview stale threshold relaxed from 3 s to 5 s to account for ffmpeg startup time.
- Setup dashboard camera preview now uses `fetch()` + blob URLs instead of direct `img.src`, so 404s during ffmpeg startup no longer break the image loader.
- Face recognition scripts now set OpenCV environment variables to disable GStreamer/V4L2 backend probing before importing `cv2`.
- Face recognition process registers `SIGTERM`/`SIGINT` handlers so the child `ffmpeg` capture process is always cleaned up on stop.
- Face recognition startup watchdog now allows up to 30 s for OpenCV to load on the Pi (was effectively killed after ~10 s).
- Setup dashboard shows a clearer "Loading face recognition model (this can take 10–20 s)…" message while the recognition process starts.
- Face-test WebSocket messages now include an `error` field and the UI displays recognition errors in red.
- Unknown face events in the test UI now show the confidence value so the threshold can be tuned more easily.
- Added a **Confidence threshold** slider in the Face Lock settings (under General settings) so the recognition tolerance can be adjusted without editing config files.

### Changed

- README install and clone commands updated to the new repository location.
- Included modules section now covers all current modules with practical examples.
- Preview grid in the setup dashboard now matches the real mirror CSS Grid layout and container sizing.
- Module preview header now floats above the module cell without consuming content space, fixing clipped badges and buttons.
- Clock and Weather modules refactored to use the shared auto-fit helper instead of fixed CSS font sizes.
- Air Quality and Calendar modules updated for container-based auto-fit sizing.
- Default `faceLock.confidenceThreshold` raised from `0.6` to `0.8` to be more tolerant while still filtering strangers.

### Fixed

- Custom module deletion now removes the module folder from disk; the previous "X" button only removed instances from the page config.
- LBPH recognition now resizes detected faces to 200×200 and adds the same 10% margin used during training, improving recognition accuracy and crop consistency.

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
