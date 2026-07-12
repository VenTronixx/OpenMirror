#!/bin/bash
set -e

echo "OpenMirror SD card image builder"
echo "This is a concept script. To build a real image, use the official pi-gen tool."
echo ""
echo "Steps for a pre-flashed OpenMirror image:"
echo "1. Clone https://github.com/RPi-Distro/pi-gen"
echo "2. Add a stage that installs Node.js 18+"
echo "3. Copy this project to /opt/openmirror"
echo "4. Create systemd service to run 'npm start' on boot"
echo "5. Enable Chromium kiosk autostart"
echo "6. Optionally pre-configure WiFi credentials"
echo "7. Build the image and flash to SD card"
