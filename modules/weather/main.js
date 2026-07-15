import { fitText } from '../shared/autoFit.js';

export default function ({ container, config, bus }) {
  const tempEl = container.querySelector('.weather-temp');
  const descEl = container.querySelector('.weather-desc');

  function onPush(event) {
    const data = event.detail;
    if (data.temp != null) tempEl.textContent = `${data.temp}°`;
    if (data.description) descEl.textContent = data.description;
    fitter?.fit();
  }

  bus.addEventListener('push:weather', onPush);

  const fitter = fitText({
    container,
    main: '.weather-temp',
    sub: descEl ? ['.weather-desc'] : [],
    scale: config.fontScale,
    mainRatio: 0.75,
    subRatio: 0.28,
    widthRatio: 1.8
  });

  async function fetchLocalWeather(location) {
    try {
      const lang = config.language || 'en-US';
      const provider = config.provider || 'wttr';
      const response = await fetch(`/api/weather?location=${encodeURIComponent(location)}&language=${encodeURIComponent(lang)}&provider=${encodeURIComponent(provider)}`);
      const data = await response.json();
      if (data.description) descEl.textContent = data.description;
      if (data.temp) tempEl.textContent = data.temp;
    } catch (err) {
      descEl.textContent = 'Weather unavailable';
    }
    fitter?.fit();
  }

  if (config.location) {
    fetchLocalWeather(config.location);
  }

  return {
    pause() {},
    resume() {},
    destroy() {
      fitter?.destroy();
    }
  };
}
