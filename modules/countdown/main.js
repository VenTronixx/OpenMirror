export default function ({ container, config }) {
  const titleEl = container.querySelector('.countdown-title');
  const displayEl = container.querySelector('.countdown-display');
  const finishedEl = container.querySelector('.countdown-finished');
  const secondsEl = container.querySelector('.countdown-seconds');
  let interval = null;

  if (titleEl && config.title) {
    titleEl.textContent = config.title;
  }

  const showSeconds = String(config.showSeconds).toLowerCase() !== 'false';
  if (secondsEl) {
    secondsEl.classList.toggle('hidden', !showSeconds);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function update() {
    const target = config.targetDate ? new Date(config.targetDate) : null;
    if (!target || isNaN(target.getTime())) {
      displayEl.classList.add('hidden');
      finishedEl.classList.remove('hidden');
      finishedEl.textContent = 'Set a target date';
      return;
    }

    const now = new Date();
    const diff = target - now;

    if (diff <= 0) {
      displayEl.classList.add('hidden');
      finishedEl.classList.remove('hidden');
      finishedEl.textContent = config.finishedText || "It's time!";
      return;
    }

    displayEl.classList.remove('hidden');
    finishedEl.classList.add('hidden');

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    const daysEl = displayEl.querySelector('[data-unit="days"]');
    const hoursEl = displayEl.querySelector('[data-unit="hours"]');
    const minutesEl = displayEl.querySelector('[data-unit="minutes"]');
    const secondsValueEl = displayEl.querySelector('[data-unit="seconds"]');

    if (daysEl) daysEl.textContent = pad(days);
    if (hoursEl) hoursEl.textContent = pad(hours);
    if (minutesEl) minutesEl.textContent = pad(minutes);
    if (secondsValueEl) secondsValueEl.textContent = pad(seconds);
  }

  function start() {
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
