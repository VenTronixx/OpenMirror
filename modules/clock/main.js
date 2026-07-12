export default function ({ container, config }) {
  const titleEl = container.querySelector('.clock-title');
  const timeEl = container.querySelector('.clock-time');
  const dateEl = container.querySelector('.clock-date');
  let interval = null;

  if (titleEl) {
    if (config.title) {
      titleEl.textContent = config.title;
      titleEl.style.display = '';
    } else {
      titleEl.style.display = 'none';
    }
  }

  if (dateEl && config.showDate === false) {
    dateEl.style.display = 'none';
  }

  const timeZone = config.timezone || config.timeZone;
  const timeOptions = { hour: '2-digit', minute: '2-digit' };
  const dateOptions = { month: 'long', day: 'numeric' };
  if (config.showWeekday !== false) {
    dateOptions.weekday = 'long';
  }

  if (timeZone) {
    timeOptions.timeZone = timeZone;
    dateOptions.timeZone = timeZone;
  }

  function update() {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString([], timeOptions);
    dateEl.textContent = now.toLocaleDateString([], dateOptions);
  }

  function start() {
    if (interval) return;
    update();
    interval = setInterval(update, 1000);
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
