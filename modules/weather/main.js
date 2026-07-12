export default function ({ container, config, bus }) {
  const tempEl = container.querySelector('.weather-temp');
  const descEl = container.querySelector('.weather-desc');

  function onPush(event) {
    const data = event.detail;
    if (data.temp != null) tempEl.textContent = `${data.temp}°`;
    if (data.description) descEl.textContent = data.description;
  }

  bus.addEventListener('push:weather', onPush);

  if (config.location) {
    fetchLocalWeather(config.location);
  }

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
  }

  return {
    pause() {},
    resume() {}
  };
}
