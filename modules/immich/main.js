export default function ({ container, config }) {
  const titleEl = container.querySelector('.immich-title');
  const imgEl = container.querySelector('.immich-photo');
  let photos = [];
  let index = 0;
  let interval = null;

  if (titleEl && config.title) titleEl.textContent = config.title;

  const intervalSec = Math.max(3, parseInt(config.interval, 10) || 10);

  async function load() {
    if (!config.url || !config.apiKey || !config.albumId) {
      imgEl.alt = 'Add Immich URL, API key and album ID';
      return;
    }

    try {
      const res = await fetch(`/api/immich?url=${encodeURIComponent(config.url)}&apiKey=${encodeURIComponent(config.apiKey)}&albumId=${encodeURIComponent(config.albumId)}`);
      if (!res.ok) throw new Error('immich fetch failed');
      photos = await res.json();
      if (Array.isArray(photos) && photos.length > 0) {
        showPhoto(0);
      } else {
        imgEl.alt = 'No photos found';
      }
    } catch (err) {
      imgEl.alt = 'Immich unavailable';
    }
  }

  function showPhoto(i) {
    if (!photos.length) return;
    index = ((i % photos.length) + photos.length) % photos.length;
    imgEl.classList.remove('loaded');
    imgEl.onload = () => imgEl.classList.add('loaded');
    imgEl.src = photos[index];
  }

  function next() {
    showPhoto(index + 1);
  }

  function start() {
    if (interval) return;
    load();
    interval = setInterval(next, intervalSec * 1000);
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
