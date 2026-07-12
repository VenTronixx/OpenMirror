export default function ({ container, config }) {
  const titleEl = container.querySelector('.calendar-title');
  const listView = container.querySelector('.calendar-list-view');
  const listEl = container.querySelector('.calendar-list');
  const gridView = container.querySelector('.calendar-grid-view');
  const gridEl = container.querySelector('.calendar-grid');
  let interval = null;

  if (titleEl && config.title) {
    titleEl.textContent = config.title;
  }

  const maxEvents = Math.max(1, parseInt(config.maxEvents, 10) || 10);
  const refreshMinutes = Math.max(1, parseInt(config.refreshInterval, 10) || 5);
  const viewMode = (config.viewMode || 'upcoming').toLowerCase();
  const isGridView = viewMode === 'week' || viewMode === 'month';

  listView.classList.toggle('hidden', isGridView);
  gridView.classList.toggle('hidden', !isGridView);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(iso, allDay) {
    const date = new Date(iso);
    const options = allDay
      ? { weekday: 'short', month: 'short', day: 'numeric' }
      : { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return date.toLocaleString([], options);
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }

  function getDayRange() {
    const days = [];
    const count = viewMode === 'week' ? 7 : 30;
    const now = new Date();
    for (let i = 0; i < count; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      d.setHours(0, 0, 0, 0);
      days.push(d);
    }
    return days;
  }

  function renderGrid(events) {
    gridEl.innerHTML = '';
    const days = getDayRange();
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Weekday headers
    weekdays.forEach(name => {
      const header = document.createElement('div');
      header.className = 'calendar-weekday-header';
      header.textContent = name;
      gridEl.appendChild(header);
    });

    // Fill empty cells before first day if it doesn't start on Monday
    // getDay(): 0 = Sun, 1 = Mon ... we want Mon first
    const firstDayOffset = (days[0].getDay() + 6) % 7;
    for (let i = 0; i < firstDayOffset; i++) {
      const empty = document.createElement('div');
      gridEl.appendChild(empty);
    }

    const today = new Date();

    days.forEach(day => {
      const cell = document.createElement('div');
      cell.className = 'calendar-day';
      if (isSameDay(day, today)) cell.classList.add('today');

      const number = document.createElement('div');
      number.className = 'calendar-day-number';
      number.textContent = day.getDate();
      cell.appendChild(number);

      const eventList = document.createElement('ul');
      eventList.className = 'calendar-day-events';

      const dayEvents = events.filter(ev => {
        const start = new Date(ev.start);
        return isSameDay(start, day);
      });

      dayEvents.slice(0, 4).forEach(ev => {
        const li = document.createElement('li');
        li.textContent = ev.title;
        li.title = ev.title;
        eventList.appendChild(li);
      });

      cell.appendChild(eventList);
      gridEl.appendChild(cell);
    });
  }

  function renderList(events) {
    listEl.innerHTML = events.map(event => `
      <li>
        <span class="calendar-date">${escapeHtml(formatDate(event.start, event.allDay))}</span>
        <span class="calendar-event-title" title="${escapeHtml(event.location ? `${event.title} – ${event.location}` : event.title)}">
          ${escapeHtml(event.title)}
        </span>
      </li>
    `).join('');
  }

  function getCalendarUrl() {
    if (config.icsUrl) return config.icsUrl;
    if (config.icsFile) return `/api/uploads/${config.icsFile}`;
    return null;
  }

  async function load() {
    const url = getCalendarUrl();
    if (!url) {
      if (isGridView) {
        gridEl.innerHTML = '<div class="calendar-empty">Add an ICS link or upload a file</div>';
      } else {
        listEl.innerHTML = '<li class="calendar-empty">Add an ICS link or upload a file in the config</li>';
      }
      return;
    }

    try {
      const response = await fetch(`/api/calendar?url=${encodeURIComponent(url)}&limit=${maxEvents * 5}`);
      if (!response.ok) throw new Error('calendar fetch failed');
      const events = await response.json();

      if (!Array.isArray(events) || events.length === 0) {
        if (isGridView) {
          gridEl.innerHTML = '<div class="calendar-empty">No events</div>';
        } else {
          listEl.innerHTML = '<li class="calendar-empty">No upcoming events</li>';
        }
        return;
      }

      if (isGridView) {
        renderGrid(events);
      } else {
        renderList(events.slice(0, maxEvents));
      }
    } catch (err) {
      if (isGridView) {
        gridEl.innerHTML = '<div class="calendar-empty">Calendar unavailable</div>';
      } else {
        listEl.innerHTML = '<li class="calendar-empty">Calendar unavailable</li>';
      }
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
