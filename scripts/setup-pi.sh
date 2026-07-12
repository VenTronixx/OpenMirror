#!/bin/bash
set -e

echo "Setting up Raspberry Pi kiosk mode for OpenMirror..."

# Detect user
USER_NAME=${SUDO_USER:-$USER}
USER_HOME=$(eval echo "~$USER_NAME")
PROJECT_DIR="$USER_HOME/openmirror"

# Check session type and switch to X11 if needed
CURRENT_SESSION=$(grep -E '^user-session=' /etc/lightdm/lightdm.conf 2>/dev/null | cut -d= -f2 || true)
if [ "$CURRENT_SESSION" != "rpd-x" ]; then
  echo "Switching display server from Wayland to X11 (Chromium needs this on Pi)..."
  sudo sed -i 's/^user-session=.*/user-session=rpd-x/' /etc/lightdm/lightdm.conf
  sudo sed -i 's/^autologin-session=.*/autologin-session=rpd-x/' /etc/lightdm/lightdm.conf
  sudo sed -i 's/^greeter-session=.*/greeter-session=pi-greeter/' /etc/lightdm/lightdm.conf
  NEEDS_REBOOT=true
else
  echo "Display server is already X11."
  NEEDS_REBOOT=false
fi

# Install dependencies
echo "Installing dependencies..."
sudo apt update
sudo apt install -y nodejs npm chromium scrot curl unclutter python3-opencv python3-numpy opencv-data

# Enable auto-login (requires openmirror user or current user)
if ! grep -q "^autologin-user=" /etc/lightdm/lightdm.conf; then
  echo "Enabling auto-login for $USER_NAME..."
  sudo sed -i "s/^#\?autologin-user=.*/autologin-user=$USER_NAME/" /etc/lightdm/lightdm.conf
fi
if ! grep -q "^autologin-session=" /etc/lightdm/lightdm.conf; then
  sudo sed -i '/^autologin-user=/a autologin-session=rpd-x' /etc/lightdm/lightdm.conf
fi

# Create systemd user service for OpenMirror
mkdir -p "$USER_HOME/.config/systemd/user"
cat > "$USER_HOME/.config/systemd/user/openmirror.service" <<EOF
[Unit]
Description=OpenMirror Smart Mirror Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

chown -R "$USER_NAME:$USER_NAME" "$USER_HOME/.config"

# Enable lingering so the service starts before login
sudo loginctl enable-linger "$USER_NAME"

# Create browser start script
mkdir -p "$PROJECT_DIR/scripts"
cat > "$PROJECT_DIR/scripts/start-browser.sh" <<'EOF'
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

chmod +x "$PROJECT_DIR/scripts/start-browser.sh"
chown -R "$USER_NAME:$USER_NAME" "$PROJECT_DIR"

# Add to X11 autostart (xset lines are duplicated here as a safety net)
mkdir -p "$USER_HOME/.config/lxsession/rpd-x"
cat > "$USER_HOME/.config/lxsession/rpd-x/autostart" <<EOF
@xset s off
@xset -dpms
@xset s noblank
@$PROJECT_DIR/scripts/start-browser.sh
EOF

chown -R "$USER_NAME:$USER_NAME" "$USER_HOME/.config"

# Hide mouse cursor after 1 second of inactivity
UNCLUTTER_CMD="unclutter -idle 1 -root"
if ! grep -q "$UNCLUTTER_CMD" "$USER_HOME/.config/lxsession/rpd-x/autostart" 2>/dev/null; then
  echo "@$UNCLUTTER_CMD" >> "$USER_HOME/.config/lxsession/rpd-x/autostart"
fi

# Disable DPMS / screen blanking at the display manager level too
LIGHTDM_CONF=/etc/lightdm/lightdm.conf
if [ -f "$LIGHTDM_CONF" ]; then
  if ! grep -q "^xserver-command=X -s 0 -dpms" "$LIGHTDM_CONF"; then
    if grep -q "^\[Seat:\*\]" "$LIGHTDM_CONF"; then
      sudo sed -i '/^\[Seat:\*\]/a xserver-command=X -s 0 -dpms' "$LIGHTDM_CONF"
    else
      echo -e "\n[Seat:*]\nxserver-command=X -s 0 -dpms" | sudo tee -a "$LIGHTDM_CONF" > /dev/null
    fi
  fi
fi

# Enable and start the service as the target user
sudo -u "$USER_NAME" systemctl --user daemon-reload || true
sudo -u "$USER_NAME" systemctl --user enable openmirror.service || true
sudo -u "$USER_NAME" systemctl --user start openmirror.service || true

echo ""
echo "Kiosk mode configured."
if [ "$NEEDS_REBOOT" = true ]; then
  echo "A reboot is required to switch from Wayland to X11."
  echo "Please run: sudo reboot"
else
  echo "Reboot now or run 'npm start' and log in to test."
fi
