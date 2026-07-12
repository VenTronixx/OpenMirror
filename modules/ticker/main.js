export default function ({ container, config }) {
  const titleEl = container.querySelector('.ticker-title');
  const listEl = container.querySelector('.ticker-list');
  let interval = null;

  if (titleEl && config.title) titleEl.textContent = config.title;

  const refreshMinutes = Math.max(1, parseInt(config.refreshInterval, 10) || 5);

  function formatPrice(value, currency) {
    if (value === undefined || value === null) return '--';
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(value);
  }

  function formatChange(value) {
    if (value === undefined || value === null) return '--';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  async function load() {
    if (!config.symbols) {
      listEl.innerHTML = '<li class="ticker-empty">Add symbols in the config</li>';
      return;
    }

    try {
      const params = new URLSearchParams({
        symbols: config.symbols,
        currency: config.currency || 'usd'
      });
      if (config.stockToken) params.set('stockToken', config.stockToken);

      const res = await fetch(`/api/ticker?${params}`);
      if (!res.ok) throw new Error('ticker fetch failed');
      const items = await res.json();

      if (!Array.isArray(items) || items.length === 0) {
        listEl.innerHTML = '<li class="ticker-empty">No prices</li>';
        return;
      }

      listEl.innerHTML = items.map(item => `
        <li>
          <span class="ticker-symbol">${item.symbol}</span>
          <span>
            <span class="ticker-price">${formatPrice(item.price, config.currency || 'usd')}</span>
            <span class="ticker-change ${item.change24h >= 0 ? 'up' : 'down'}">${formatChange(item.change24h)}</span>
          </span>
        </li>
      `).join('');
    } catch (err) {
      listEl.innerHTML = '<li class="ticker-empty">Prices unavailable</li>';
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
