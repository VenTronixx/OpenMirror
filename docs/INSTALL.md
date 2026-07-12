# Installation Guide

OpenMirror requires Node.js 18 or newer.

## Check Node.js

```bash
node -v
```

If Node.js is missing or older than version 18, install it from [https://nodejs.org](https://nodejs.org).

## Install with one command

### Linux and macOS

```bash
curl -sSL https://raw.githubusercontent.com/VenTronixx/OpenMirror/main/install.sh | bash
```

### Windows

```powershell
Invoke-WebRequest -Uri https://raw.githubusercontent.com/VenTronixx/OpenMirror/main/install.bat -OutFile install.bat; .\install.bat
```

## Install manually

1. Clone or download the project.
2. Open a terminal in the project folder.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000` in your browser.

## Raspberry Pi kiosk mode

For a detailed Pi setup guide (including the required X11 switch and Chromium flags for Raspbian 13), see [`PI_SETUP.md`](PI_SETUP.md).

You can also run the automated setup script:

```bash
bash scripts/setup-pi.sh
```

Then reboot. Chromium will open in kiosk mode and show the mirror.

## Pre-flashed SD card image

For a ready-to-use SD card, build a custom Raspberry Pi OS image with the project pre-installed. See `scripts/build-image.sh` for a concept and links to the official pi-gen tool.

## Update

To update later, run:

```bash
git pull
npm install
```
