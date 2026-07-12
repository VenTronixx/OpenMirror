# OpenMirror

Repository: https://github.com/VenTronixx/OpenMirror

An open, easy, and modular smart mirror platform.

OpenMirror is designed to be simpler to set up and extend than existing smart mirror projects. It runs on Node.js, works in any modern browser, and supports Raspberry Pi kiosk mode.

## Why OpenMirror?

I used MagicMirror2 for many years. It taught me a lot, mostly about what a smart mirror should not feel like. The idea was great: a quiet display that shows the information you care about. But in practice it was fragile.

The cycle was always the same. Install a new module, edit the config file over SSH, restart, realize the JSON is malformed, fix it, restart again, discover the module depends on an old library, dig through the forum, apply a workaround, and finally get it running. Then, two weeks later, something else broke. A Node update killed a module. A sensor stopped triggering. The display would not wake up. I spent more time maintaining the mirror than using it. Sometimes I even forgot the SSH credentails because I not really cared!

Worst of all, every smart feature needed to be assembled at the Pi layer. Radar sensors, IR receivers, microphones, speakers and none of it was part of the mirror. It was a stack of separate scripts held together with hope.

OpenMirror is what I wish I had back then. It keeps the modularity and community spirit but adds the integration and reliability that were missing:

- **Modules are maintained together.** Built-in modules are versioned and tested with the core, so updates do not break them.
- **Hardware is part of the product.** GPIO, USB serial, radar, microphones, and displays are configured in the same browser UI.
- **Setup is visual.** Drag modules onto a grid, resize them, and fill out forms. You can still edit JSON when you want to, but you do not have to.
- **It is built to stay up.** Clear error handling and graceful fallbacks keep the mirror running even when a module misbehaves.

Your mirror should be background noise, not a side project.

## Features

- One-command install on Linux, macOS, and Windows
- Folder-based module system: drop a folder into `modules/` and it works
- Built-in HTTP and WebSocket API for third-party services
- Coordinate-based grid layout: drag, drop, and resize modules freely
- Visual setup dashboard at `/setup.html`
- Multiple pages with automatic rotation
- Module lifecycle hooks for pause and resume
- Face lock: show different pages for different people
- Built-in hardware service: GPIO, USB serial, radar and test devices
- Presence wake/sleep: dim or turn off display when no one is nearby
- MQTT bridge: integrate with Home Assistant and other automation systems
- Voice commands: wake word and custom commands using the browser speech API
- Remote/Fleet management: control many mirrors from one dashboard
- No build step required
- Ready for Raspberry Pi kiosk mode and future pre-flashed SD card images

## Quick Start

### One-command install (Linux and macOS)

```bash
curl -sSL https://raw.githubusercontent.com/VenTronixx/OpenMirror/main/install.sh | bash
```

### One-command install (Windows)

```powershell
Invoke-WebRequest -Uri https://raw.githubusercontent.com/VenTronixx/OpenMirror/main/install.bat -OutFile install.bat; .\install.bat
```

### Manual install

```bash
git clone https://github.com/VenTronixx/OpenMirror.git
cd openmirror
npm install
npm start
```

Then open `http://localhost:3000` in your browser.

For visual configuration, open `http://localhost:3000/setup.html`.

The default config includes two pages that rotate every 10 seconds. Face lock is disabled by default. A test motion device is enabled to demonstrate hardware events and presence wake/sleep. MQTT bridge, voice commands, and remote client mode are disabled by default. Remote server mode accepts connections without a token by default.

## Documentation

- [Installation Guide](docs/INSTALL.md)
- [Raspberry Pi Kiosk Setup](docs/PI_SETUP.md)
- [Creating Modules](docs/MODULES.md)
- [HTTP and WebSocket API](docs/API.md)
- [Setup Dashboard](docs/SETUP.md)

## Included Modules

OpenMirror ships with a set of ready-to-use modules. Each module is a folder inside `modules/`. Copy a folder to add another instance with its own settings.

- **Clock**: digital clock with date and optional timezone.  
  *Example: add one clock for your local time and another for a remote team member.*

- **Weather**: current conditions and forecast from wttr.in or Open-Meteo.  
  *Example: show the weather at home or at your travel destination.*

- **Air Quality**: air quality index and pollutant breakdown for any city using Open-Meteo.  
  *Example: display the AQI in your city so you know whether to open the windows.*

- **Calendar**: upcoming events from any ICS feed (Google Calendar, Nextcloud, Outlook, etc.).  
  *Example: add one calendar per family member or one for work and one for private events.*

- **Countdown**: counts down to a target date and time.  
  *Example: countdown to a birthday, holiday, product launch, or deadline.*

- **Immich Frame**: slideshow of photos from an Immich album.  
  *Example: rotate through family photos or vacation pictures.* Needs testing!

- **News / RSS**: headlines from any RSS or Atom feed.  
  *Example: keep up with Hacker News, local news, or a specific blog.*

- **Spotify**: embed a Spotify playlist or album.  
  *Example: start a focus playlist or show the currently playing album cover.* Needs testing!

- **System Info**: live CPU, memory, and disk usage of the mirror server.  
  *Example: monitor a Raspberry Pi's temperature and load at a glance.*

- **Ticker**: crypto and stock prices. Crypto works without an API key; stocks need a Finnhub token.  
  *Example: track Bitcoin, Ethereum, and your favorite tech stocks.*

- **Todoist**: tasks from a Todoist project.  
  *Example: show today's shopping list or work tasks on the mirror.* Needs testing!

- **Travel Time**: driving time between two places. Mapbox token enables live traffic; otherwise it falls back to OSRM.  
  *Example: check commute time before leaving the house.* Needs testing!

## Project Structure

```text
openmirror/
├── config/            # Configuration files
├── docs/              # Documentation
├── modules/           # Module folders
├── public/            # Frontend assets
├── scripts/           # Helper scripts for Pi and image building
├── server.js          # Main server
└── install.sh         # One-command installer
```

## License

MIT. See the package.json for details.
