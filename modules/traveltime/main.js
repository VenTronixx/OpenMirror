export default function ({ container, config }) {
  const titleEl = container.querySelector('.travel-title');
  const routeEl = container.querySelector('.travel-route');
  const durationEl = container.querySelector('.travel-duration');
  const distanceEl = container.querySelector('.travel-distance');
  const sourceEl = container.querySelector('.travel-source');
  let interval = null;

  if (titleEl && config.title) titleEl.textContent = config.title;

  const refreshMinutes = Math.max(1, parseInt(config.refreshInterval, 10) || 5);

  function formatDuration(seconds) {
    if (!seconds) return '--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
  }

  function formatDistance(meters) {
    if (!meters) return '--';
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)} m`;
  }

  async function load() {
    if (!config.from || !config.to) {
      routeEl.textContent = 'Set From and To locations';
      return;
    }

    try {
      const params = new URLSearchParams({
        from: config.from,
        to: config.to
      });
      if (config.mapboxToken) params.set('mapboxToken', config.mapboxToken);

      const res = await fetch(`/api/traveltime?${params}`);
      if (!res.ok) throw new Error('travel time fetch failed');
      const data = await res.json();

      routeEl.textContent = `${data.fromName || config.from} → ${data.toName || config.to}`;
      durationEl.textContent = formatDuration(data.duration);
      distanceEl.textContent = formatDistance(data.distance);
      sourceEl.textContent = data.source || '';
    } catch (err) {
      routeEl.textContent = 'Unavailable';
      durationEl.textContent = '--';
      distanceEl.textContent = '--';
      sourceEl.textContent = '';
    }
  }

  function start() {
    if (interval) return;
    load();
    interval = setInterval(load, refreshMinutes * 60 * 1000);
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
