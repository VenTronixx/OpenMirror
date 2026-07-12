export default function ({ container, config }) {
  const titleEl = container.querySelector('.rss-title');
  const listEl = container.querySelector('.rss-list');
  const slideEl = container.querySelector('.rss-slide');
  const slideTitleEl = container.querySelector('.rss-slide-title');
  const slideDescEl = container.querySelector('.rss-slide-desc');
  const slideDateEl = container.querySelector('.rss-slide-date');

  let refreshInterval = null;
  let slideInterval = null;
  let items = [];
  let slideIndex = 0;

  const maxItems = Math.max(1, parseInt(config.maxItems, 10) || 6);
  const refreshMinutes = Math.max(1, parseInt(config.refreshInterval, 10) || 10);
  const displayMode = config.displayMode === 'slide' ? 'slide' : 'list';
  const showSnippet = config.showSnippet !== false;
  const snippetLength = Math.max(0, parseInt(config.snippetLength, 10) || 120);
  const slideSeconds = Math.max(1, parseInt(config.slideInterval, 10) || 10);
  const snippetLines = Math.max(0, Math.min(3, parseInt(config.snippetLines, 10) ?? 1));
  const showDate = config.showDate !== false;

  if (titleEl && config.title) titleEl.textContent = config.title;

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function truncate(text, length) {
    if (!text) return '';
    if (length <= 0) return text;
    if (text.length <= length) return text;
    return text.substring(0, length).replace(/\s+\S*$/, '') + '…';
  }

  function renderList() {
    if (!Array.isArray(items) || items.length === 0) {
      listEl.innerHTML = '<li class="rss-empty">No headlines</li>';
      return;
    }

    listEl.innerHTML = items.map(item => {
      const desc = showSnippet && snippetLength > 0 && snippetLines > 0
        ? `<div class="rss-snippet" style="-webkit-line-clamp: ${snippetLines}">${escapeHtml(truncate(item.description, snippetLength))}</div>`
        : '';
      const date = showDate && item.pubDate
        ? `<span class="rss-date">${escapeHtml(formatDate(item.pubDate))}</span>`
        : '';
      return `
        <li>
          <a href="${escapeHtml(item.link || '#')}" target="_blank" title="${escapeHtml(item.title)}">
            ${escapeHtml(item.title)}
          </a>
          ${desc}
          ${date}
        </li>
      `;
    }).join('');
  }

  function renderSlide() {
    if (!Array.isArray(items) || items.length === 0) {
      slideTitleEl.textContent = 'No headlines';
      slideDescEl.textContent = '';
      slideDateEl.textContent = '';
      slideTitleEl.href = '#';
      return;
    }

    slideIndex = slideIndex % items.length;
    const item = items[slideIndex];
    slideTitleEl.textContent = item.title || 'Untitled';
    slideTitleEl.href = item.link || '#';
    slideTitleEl.title = item.title || '';
    slideDescEl.textContent = item.description || '';
    slideDateEl.textContent = showDate && item.pubDate ? formatDate(item.pubDate) : '';
    slideDateEl.classList.toggle('hidden', !(showDate && item.pubDate));
  }

  function nextSlide() {
    if (items.length === 0) return;
    slideIndex = (slideIndex + 1) % items.length;
    renderSlide();
  }

  function startSlideshow() {
    stopSlideshow();
    slideInterval = setInterval(nextSlide, slideSeconds * 1000);
  }

  function stopSlideshow() {
    if (slideInterval) {
      clearInterval(slideInterval);
      slideInterval = null;
    }
  }

  function applyMode() {
    if (displayMode === 'slide') {
      listEl.classList.add('hidden');
      slideEl.classList.remove('hidden');
      renderSlide();
      startSlideshow();
    } else {
      slideEl.classList.add('hidden');
      listEl.classList.remove('hidden');
      stopSlideshow();
      renderList();
    }
  }

  async function load() {
    if (!config.url) {
      listEl.innerHTML = '<li class="rss-empty">Add an RSS feed URL</li>';
      return;
    }

    try {
      const res = await fetch(`/api/rss?url=${encodeURIComponent(config.url)}&limit=${maxItems}`);
      if (!res.ok) throw new Error('rss fetch failed');
      items = await res.json();
      slideIndex = 0;
      applyMode();
    } catch (err) {
      listEl.innerHTML = '<li class="rss-empty">Headlines unavailable</li>';
      if (displayMode === 'slide') {
        slideTitleEl.textContent = 'Headlines unavailable';
        slideDescEl.textContent = '';
        slideDateEl.textContent = '';
      }
    }
  }

  function start() {
    if (refreshInterval) return;
    load();
    refreshInterval = setInterval(load, refreshMinutes * 60 * 1000);
  }

  function pause() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
    stopSlideshow();
  }

  function resume() {
    start();
    if (displayMode === 'slide') startSlideshow();
  }

  start();
  return { start, pause, resume };
}
