#!/usr/bin/env bash
set -e

HOST="192.168.178.66"
USER="openmirror"
PASS="openmirror"
HOSTKEY="AAAAC3NzaC1lZDI1NTE5AAAAII/vj9ehkImKUyz2i4GOPljiwNfRdL2oOsvuAvl86adz"
REMOTE_DIR="/home/openmirror/openmirror"
LOCAL_DIR="g:/magicmirror"

PSCP="pscp -pw ${PASS} -hostkey ${HOSTKEY} -batch"
PLINK="plink -ssh -batch -hostkey ${HOSTKEY} -pw ${PASS}"

echo "=== Backing up remote config ==="
${PLINK} ${USER}@${HOST} "cp ${REMOTE_DIR}/config/config.json ${REMOTE_DIR}/config/config.json.bak.$(date +%Y%m%d-%H%M%S)"

echo "=== Syncing shared module helpers ==="
if [ -d "${LOCAL_DIR}/modules/shared" ]; then
  ${PSCP} -r "${LOCAL_DIR}/modules/shared" ${USER}@${HOST}:${REMOTE_DIR}/modules/
fi

echo "=== Syncing modules ==="
for mod in airquality calendar clock countdown immich pollen rss spotify systeminfo ticker todoist traveltime weather; do
  if [ -d "${LOCAL_DIR}/modules/${mod}" ]; then
    ${PSCP} -r "${LOCAL_DIR}/modules/${mod}" ${USER}@${HOST}:${REMOTE_DIR}/modules/
  fi
done

echo "=== Removing obsolete modules on Pi ==="
${PLINK} ${USER}@${HOST} "rm -rf ${REMOTE_DIR}/modules/traffic ${REMOTE_DIR}/modules/weather-berlin ${REMOTE_DIR}/modules/ormoc-weather"

echo "=== Syncing server/service files ==="
${PSCP} "${LOCAL_DIR}/server.js" ${USER}@${HOST}:${REMOTE_DIR}/
${PSCP} "${LOCAL_DIR}/services/hardware.js" ${USER}@${HOST}:${REMOTE_DIR}/services/
${PSCP} "${LOCAL_DIR}/services/face.js" ${USER}@${HOST}:${REMOTE_DIR}/services/
${PSCP} "${LOCAL_DIR}/services/mqtt.js" ${USER}@${HOST}:${REMOTE_DIR}/services/
${PSCP} "${LOCAL_DIR}/services/presence.js" ${USER}@${HOST}:${REMOTE_DIR}/services/
${PSCP} "${LOCAL_DIR}/services/saas.js" ${USER}@${HOST}:${REMOTE_DIR}/services/
${PSCP} "${LOCAL_DIR}/config/hardware-schema.json" ${USER}@${HOST}:${REMOTE_DIR}/config/
${PSCP} "${LOCAL_DIR}/config/default.json" ${USER}@${HOST}:${REMOTE_DIR}/config/

echo "=== Syncing SaaS docs ==="
${PLINK} ${USER}@${HOST} "mkdir -p ${REMOTE_DIR}/saas ${REMOTE_DIR}/docs"
${PSCP} "${LOCAL_DIR}/saas/PLAN.md" ${USER}@${HOST}:${REMOTE_DIR}/saas/
${PSCP} "${LOCAL_DIR}/docs/SAAS_PROTOCOL.md" ${USER}@${HOST}:${REMOTE_DIR}/docs/

echo "=== Syncing face scripts ==="
${PSCP} "${LOCAL_DIR}/scripts/camera_utils.py" ${USER}@${HOST}:${REMOTE_DIR}/scripts/
${PSCP} "${LOCAL_DIR}/scripts/camera_preview.py" ${USER}@${HOST}:${REMOTE_DIR}/scripts/
${PSCP} "${LOCAL_DIR}/scripts/train_face.py" ${USER}@${HOST}:${REMOTE_DIR}/scripts/
${PSCP} "${LOCAL_DIR}/scripts/recognize_face.py" ${USER}@${HOST}:${REMOTE_DIR}/scripts/

echo "=== Syncing mirror UI ==="
${PSCP} "${LOCAL_DIR}/public/index.html" ${USER}@${HOST}:${REMOTE_DIR}/public/
${PSCP} "${LOCAL_DIR}/public/js/app.js" ${USER}@${HOST}:${REMOTE_DIR}/public/js/
${PSCP} "${LOCAL_DIR}/public/css/main.css" ${USER}@${HOST}:${REMOTE_DIR}/public/css/

echo "=== Syncing setup UI ==="
${PSCP} "${LOCAL_DIR}/public/setup.html" ${USER}@${HOST}:${REMOTE_DIR}/public/
${PSCP} "${LOCAL_DIR}/public/js/setup.js" ${USER}@${HOST}:${REMOTE_DIR}/public/js/
${PSCP} "${LOCAL_DIR}/public/css/setup.css" ${USER}@${HOST}:${REMOTE_DIR}/public/css/

echo "=== Cleaning config from removed modules ==="
${PLINK} ${USER}@${HOST} "node -e '
const fs = require(\"fs\");
const path = \"/home/openmirror/openmirror/config/config.json\";
const cfg = JSON.parse(fs.readFileSync(path, \"utf8\"));
const removed = [\"traffic\", \"weather-berlin\", \"ormoc-weather\"];
(cfg.pages || []).forEach(page => {
  removed.forEach(id => delete page.modules[id]);
});
fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
console.log(\"Config cleaned\");
'"

echo "=== Restarting openmirror service ==="
${PLINK} ${USER}@${HOST} "systemctl --user restart openmirror.service && systemctl --user status openmirror.service --no-pager"

echo "=== Done ==="
