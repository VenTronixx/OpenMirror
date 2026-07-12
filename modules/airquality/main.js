export default function ({ container, config }) {
  const titleEl = container.querySelector('.air-title');
  const locationEl = container.querySelector('.air-location');
  const aqiEl = container.querySelector('.air-aqi');
  const pm25El = container.querySelector('.air-pm25');
  const pm10El = container.querySelector('.air-pm10');
  const o3El = container.querySelector('.air-o3');
  let interval = null;

  if (titleEl && config.title) titleEl.textContent = config.title;

  const refreshMinutes = Math.max(1, parseInt(config.refreshInterval, 10) || 10);

  async function load() {
    if (!config.location) {
      locationEl.textContent = 'Add a city';
      return;
    }

    try {
      const res = await fetch(`/api/airquality?location=${encodeURIComponent(config.location)}`);
      if (!res.ok) throw new Error('air quality fetch failed');
      const data = await res.json();

      locationEl.textContent = data.location || config.location;
      aqiEl.textContent = data.aqi != null ? data.aqi : '--';
      pm25El.textContent = data.pm25 != null ? data.pm25 : '--';
      pm10El.textContent = data.pm10 != null ? data.pm10 : '--';
      o3El.textContent = data.o3 != null ? data.o3 : '--';
    } catch (err) {
      locationEl.textContent = 'Unavailable';
      aqiEl.textContent = '--';
      pm25El.textContent = '--';
      pm10El.textContent = '--';
      o3El.textContent = '--';
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
