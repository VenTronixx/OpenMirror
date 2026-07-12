export default function ({ container, config }) {
  const titleEl = container.querySelector('.todoist-title');
  const listEl = container.querySelector('.todoist-list');
  let interval = null;

  if (titleEl && config.title) titleEl.textContent = config.title;

  const maxTasks = Math.max(1, parseInt(config.maxTasks, 10) || 8);
  const refreshMinutes = Math.max(1, parseInt(config.refreshInterval, 10) || 5);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function load() {
    if (!config.token) {
      listEl.innerHTML = '<li class="todoist-empty">Add your Todoist API token</li>';
      return;
    }

    try {
      const params = new URLSearchParams({ token: config.token, limit: maxTasks });
      if (config.projectId) params.set('projectId', config.projectId);
      const res = await fetch(`/api/todoist?${params}`);
      if (!res.ok) throw new Error('todoist fetch failed');
      const tasks = await res.json();

      if (!Array.isArray(tasks) || tasks.length === 0) {
        listEl.innerHTML = '<li class="todoist-empty">No tasks</li>';
        return;
      }

      listEl.innerHTML = tasks.map(task => `
        <li class="${task.isCompleted ? 'done' : ''}">
          <span title="${escapeHtml(task.description || '')}">${escapeHtml(task.content)}</span>
        </li>
      `).join('');
    } catch (err) {
      listEl.innerHTML = '<li class="todoist-empty">Tasks unavailable</li>';
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
