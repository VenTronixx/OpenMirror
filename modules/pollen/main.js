export default function ({ container, config }) {
  const titleEl = container.querySelector('.pollen-title');
  const locationEl = container.querySelector('.pollen-location');
  const listEl = container.querySelector('.pollen-list');
  let interval = null;

  if (titleEl && config.title) titleEl.textContent = config.title;

  const refreshMinutes = Math.max(5, parseInt(config.refreshInterval, 10) || 30);
  const showValues = config.showValues !== false;

  function levelLabel(level) {
    const map = {
      none: 'None',
      low: 'Low',
      moderate: 'Moderate',
      high: 'High',
      'very-high': 'Very high'
    };
    return map[level] || level || 'Unknown';
  }

  function render(rows) {
    listEl.innerHTML = '';
    if (!rows || rows.length === 0) {
      listEl.innerHTML = '<div class="pollen-row"><span class="pollen-name">No data</span></div>';
      return;
    }

    const visibleRows = rows.filter(row => row.value > 0);
    if (visibleRows.length === 0) {
      listEl.innerHTML = '<div class="pollen-row"><span class="pollen-name">No pollen today</span></div>';
      return;
    }

    visibleRows.forEach(row => {
      const level = row.level || 'none';
      const label = levelLabel(level);
      const valueText = row.value != null ? `${Math.round(row.value)}` : '--';

      const el = document.createElement('div');
      el.className = 'pollen-row';
      el.innerHTML = `
        <span class="pollen-name">${row.name}</span>
        <div class="pollen-value-block">
          ${showValues ? `<span class="pollen-value">${valueText}</span>` : ''}
          <span class="pollen-level ${level}">${label}</span>
        </div>
      `;
      listEl.appendChild(el);
    });
  }

  async function load() {
    const provider = config.provider === 'dwd' ? 'dwd' : 'openmeteo';
    const queryLocation = provider === 'dwd'
      ? (config.dwdRegion || config.location)
      : config.location;

    if (!queryLocation) {
      locationEl.textContent = provider === 'dwd' ? 'Add a DWD region' : 'Add a city or region';
      render([]);
      return;
    }

    try {
      const res = await fetch(`/api/pollen?location=${encodeURIComponent(queryLocation)}&provider=${provider}`);
      if (!res.ok) throw new Error('pollen fetch failed');
      const data = await res.json();

      locationEl.textContent = data.location || queryLocation;
      render(data.pollen || []);
    } catch (err) {
      locationEl.textContent = 'Unavailable';
      render([]);
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
