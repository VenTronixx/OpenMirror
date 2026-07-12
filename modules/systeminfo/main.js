export default function ({ container, config }) {
  const titleEl = container.querySelector('.system-title');
  const cpuEl = container.querySelector('.system-cpu');
  const memEl = container.querySelector('.system-mem');
  const diskEl = container.querySelector('.system-disk');
  const uptimeEl = container.querySelector('.system-uptime');
  let interval = null;

  if (titleEl && config.title) titleEl.textContent = config.title;

  const refreshSeconds = Math.max(3, parseInt(config.refreshInterval, 10) || 10);
  const showCpu = config.showCpu || 'both';

  function formatBytes(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    return bytes + ' B';
  }

  function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    return `${h}h ${m}m`;
  }

  async function load() {
    try {
      const res = await fetch('/api/system');
      if (!res.ok) throw new Error('system fetch failed');
      const data = await res.json();

      if (showCpu === 'temp') cpuEl.textContent = data.cpuTemp || '--';
      else if (showCpu === 'load') cpuEl.textContent = data.cpuLoad ? data.cpuLoad.join(', ') : '--';
      else if (showCpu === 'both') cpuEl.textContent = `${data.cpuTemp || '--'} / ${data.cpuLoad ? data.cpuLoad.join(', ') : '--'}`;
      else cpuEl.textContent = 'off';

      memEl.textContent = `${formatBytes(data.memoryUsed || 0)} / ${formatBytes(data.memoryTotal || 0)}`;
      diskEl.textContent = `${formatBytes(data.diskUsed || 0)} / ${formatBytes(data.diskTotal || 0)}`;
      uptimeEl.textContent = formatUptime(data.uptime || 0);
    } catch (err) {
      cpuEl.textContent = '?';
      memEl.textContent = '?';
      diskEl.textContent = '?';
      uptimeEl.textContent = '?';
    }
  }

  function start() {
    if (interval) return;
    load();
    interval = setInterval(load, refreshSeconds * 1000);
  }

  function pause() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  start();
  return { start, pause, resume: start };
}
