# Raspberry Pi Setup Guide

This guide covers installing and running OpenMirror on a Raspberry Pi in kiosk mode with automatic screen rotation.

Tested on:
- Raspberry Pi 3 Model B
- Raspbian GNU/Linux 13 (trixie)
- Chromium 149

## Important: Use X11, not Wayland

Raspberry Pi OS defaults to a Wayland-based desktop (`labwc`) on newer versions. Modern Chromium cannot render correctly under Wayland on the Pi 3 — you will see a white/blank screen or no browser window at all.

**Switch to X11 before setting up OpenMirror.**

### Switch to X11 via command line

Edit `/etc/lightdm/lightdm.conf` as root:

```bash
sudo sed -i 's/^user-session=.*/user-session=rpd-x/' /etc/lightdm/lightdm.conf
sudo sed -i 's/^autologin-session=.*/autologin-session=rpd-x/' /etc/lightdm/lightdm.conf
sudo sed -i 's/^greeter-session=.*/greeter-session=pi-greeter/' /etc/lightdm/lightdm.conf
```

Then reboot:

```bash
sudo reboot
```

The session should now be `rpd-x` (LXDE/Openbox).

## 1. Install Node.js and npm

```bash
sudo apt update
sudo apt install -y nodejs npm
```

Make sure Node.js is at least version 18:

```bash
node --version
npm --version
```

## 2. Copy OpenMirror to the Pi

If you have the project locally, copy it to the Pi (excluding `node_modules`):

```bash
# On your local machine
tar --exclude='node_modules' --exclude='.git' -czf openmirror.tar.gz .
scp openmirror.tar.gz pi@raspberrypi.local:/home/pi/
```

On the Pi:

```bash
mkdir -p ~/openmirror
cd ~/openmirror
tar -xzf ~/openmirror.tar.gz
rm ~/openmirror.tar.gz
npm install
```

## 3. Start OpenMirror automatically

Create a systemd user service:

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/openmirror.service <<'EOF'
[Unit]
Description=OpenMirror Smart Mirror Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/openmirror/openmirror
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable openmirror.service
systemctl --user start openmirror.service
```

Enable lingering so the user service can start before login:

```bash
sudo loginctl enable-linger $(whoami)
```

## 4. Start Chromium kiosk automatically

Create the browser start script:

```bash
mkdir -p ~/openmirror/scripts
cat > ~/openmirror/scripts/start-browser.sh <<'EOF'
#!/bin/bash

# Wait for OpenMirror server
for i in $(seq 1 60); do
  if curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 | grep -q '^200$'; then
    break
  fi
  sleep 1
done

# Rotate display to portrait (90° clockwise). Change 'right' to 'left' if needed.
for output in HDMI-1 HDMI-2; do
  if xrandr --output $output --rotate right 2>/dev/null; then
    break
  fi
done

# Disable screen blanking / power management so the monitor stays on
xset s off 2>/dev/null
xset -dpms 2>/dev/null
xset s noblank 2>/dev/null

# Kill any existing Chromium
pkill -9 chromium 2>/dev/null
sleep 1

# Start Chromium in kiosk mode
# These flags are required for Chromium to render on Pi 3 / Raspbian 13 X11
/usr/lib/chromium/chromium \
  --kiosk \
  --ozone-platform=x11 \
  --enable-features=UseOzonePlatform \
  --disable-gpu \
  --disable-gpu-compositing \
  --disable-software-rasterizer \
  --no-sandbox \
  --single-process \
  --password-store=basic \
  --no-first-run \
  --no-default-browser-check \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate \
  http://localhost:3000
EOF

chmod +x ~/openmirror/scripts/start-browser.sh
```

Add it to the X11 autostart. The `xset` lines make sure the monitor never goes to sleep:

```bash
mkdir -p ~/.config/lxsession/rpd-x
cat > ~/.config/lxsession/rpd-x/autostart <<'EOF'
@xset s off
@xset -dpms
@xset s noblank
@/home/openmirror/openmirror/scripts/start-browser.sh
EOF
```

If you want to be extra safe, also tell LightDM to start the X server without screen blanking:

```bash
sudo sed -i '/^\[Seat:\*\]/a xserver-command=X -s 0 -dpms' /etc/lightdm/lightdm.conf
```

Reboot:

```bash
sudo reboot
```

## 5. Adjust rotation direction

If the screen is rotated the wrong way, edit `~/openmirror/scripts/start-browser.sh` and change:

```bash
xrandr --output $output --rotate right
```

to:

```bash
xrandr --output $output --rotate left
```

Then reboot.

## Troubleshooting

### White/blank browser screen

You are likely still on Wayland, or Chromium is missing the required flags. Make sure you switched to X11 and are using the exact flags listed above.

### Browser does not open on boot

- Check that the session is `rpd-x`: `ps aux | grep lxsession`
- Check the autostart file exists: `cat ~/.config/lxsession/rpd-x/autostart`
- Check that the script is executable: `chmod +x ~/openmirror/scripts/start-browser.sh`

### Display not rotating

- Make sure `xrandr` can see the output: `xrandr`
- The output name may differ (e.g. `HDMI-1`, `HDMI-2`). Update the loop in `start-browser.sh` accordingly.

### Monitor goes dark / sleeps

This should not happen, because screen blanking is disabled in three places:

1. `start-browser.sh` runs `xset s off`, `xset -dpms`, and `xset s noblank`
2. The X11 autostart also runs these `xset` commands before Chromium
3. `scripts/setup-pi.sh` configures LightDM with `xserver-command=X -s 0 -dpms`

If the screen still blanks, check the current settings while the mirror is running:

```bash
xset q | grep -E "DPMS|timeout|Blanking"
```

You can also force the display on manually:

```bash
xset s off
xset -dpms
xset s noblank
```

### Keyring password dialog

The `--password-store=basic` flag prevents Chromium from asking for a keyring password.
