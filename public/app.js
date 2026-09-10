const STATUS_LABELS = {
  todo: '待办',
  doing: '进行中',
  done: '已完成',
};

const PRIORITY_LABELS = {
  low: '低',
  medium: '中',
  high: '高',
};

let tasks = [];
let currentFilter = 'all';
let searchQuery = '';
let editingId = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const taskList = $('#taskList');
const emptyState = $('#emptyState');
const taskModal = $('#taskModal');
const taskForm = $('#taskForm');
const modalTitle = $('#modalTitle');

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

async function loadTasks() {
  const params = new URLSearchParams();
  if (currentFilter !== 'all') params.set('status', currentFilter);
  if (searchQuery) params.set('search', searchQuery);
  tasks = await api(`/api/tasks?${params}`);
}

async function loadStats() {
  const stats = await api('/api/tasks/stats');
  $('#statTotal').textContent = stats.total;
  $('#statTodo').textContent = stats.todo;
  $('#statDoing').textContent = stats.doing;
  $('#statDone').textContent = stats.done;
}

async function loadSiteName() {
  try {
    const { siteName } = await api('/api/settings/public');
    if (siteName) {
      document.title = siteName;
      $('h1').textContent = siteName;
    }
  } catch { /* ignore */ }
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderTasks() {
  loadStats();

  if (tasks.length === 0) {
    taskList.innerHTML = '';
    emptyState.hidden = false;
    emptyState.querySelector('h2').textContent = searchQuery || currentFilter !== 'all' ? '没有匹配的任务' : '还没有任务';
    emptyState.querySelector('p').textContent = searchQuery || currentFilter !== 'all' ? '试试调整筛选或搜索条件' : '点击「新建任务」开始记录你的工作';
    return;
  }

  emptyState.hidden = true;
  taskList.innerHTML = tasks
    .map(
      (task) => `
    <article class="task-card" data-id="${task.id}">
      <span class="task-card__status task-card__status--${task.status}">${STATUS_LABELS[task.status]}</span>
      <div class="task-card__body">
        <h3 class="task-card__title${task.status === 'done' ? ' task-card__title--done' : ''}">${escapeHtml(task.title)}</h3>
        ${task.description ? `<p class="task-card__desc">${escapeHtml(task.description)}</p>` : ''}
        <div class="task-card__meta">
          <span class="task-card__priority task-card__priority--${task.priority}">优先级：${PRIORITY_LABELS[task.priority]}</span>
          <span>更新于 ${formatDate(task.updatedAt)}</span>
        </div>
      </div>
      <div class="task-card__actions">
        <button type="button" class="btn--icon" data-action="cycle" title="切换状态">↻</button>
        <button type="button" class="btn--icon" data-action="edit" title="编辑">✎</button>
        <button type="button" class="btn--danger" data-action="delete" title="删除">删除</button>
      </div>
    </article>
  `
    )
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openModal(task = null) {
  editingId = task ? task.id : null;
  modalTitle.textContent = task ? '编辑任务' : '新建任务';
  $('#taskTitle').value = task ? task.title : '';
  $('#taskDesc').value = task ? task.description || '' : '';
  $('#taskStatus').value = task ? task.status : 'todo';
  $('#taskPriority').value = task ? task.priority : 'medium';
  taskModal.showModal();
  $('#taskTitle').focus();
}

function closeModal() {
  taskModal.close();
  editingId = null;
  taskForm.reset();
}

async function refresh() {
  try {
    await loadTasks();
    renderTasks();
  } catch (err) {
    console.error(err);
  }
}

async function saveTask(e) {
  e.preventDefault();
  const title = $('#taskTitle').value.trim();
  if (!title) return;

  const body = {
    title,
    description: $('#taskDesc').value.trim(),
    status: $('#taskStatus').value,
    priority: $('#taskPriority').value,
  };

  if (editingId) {
    await api(`/api/tasks/${editingId}`, { method: 'PUT', body: JSON.stringify(body) });
  } else {
    await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
  }

  closeModal();
  await refresh();
}

async function cycleStatus(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  const order = ['todo', 'doing', 'done'];
  const next = order[(order.indexOf(task.status) + 1) % order.length];
  await api(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...task, status: next }),
  });
  await refresh();
}

async function deleteTask(id) {
  if (!confirm('确定删除这条任务吗？')) return;
  await api(`/api/tasks/${id}`, { method: 'DELETE' });
  await refresh();
}

function init() {
  loadSiteName();
  refresh();

  $('#btnNewTask').addEventListener('click', () => openModal());
  $('#btnCloseModal').addEventListener('click', closeModal);
  $('#btnCancel').addEventListener('click', closeModal);
  taskForm.addEventListener('submit', saveTask);

  taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) closeModal();
  });

  let searchTimer;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      refresh();
    }, 300);
  });

  $('#filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    $$('.filter-btn').forEach((b) => b.classList.remove('filter-btn--active'));
    btn.classList.add('filter-btn--active');
    currentFilter = btn.dataset.filter;
    refresh();
  });

  taskList.addEventListener('click', (e) => {
    const card = e.target.closest('.task-card');
    if (!card) return;
    const id = card.dataset.id;
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'edit') {
      const task = tasks.find((t) => t.id === id);
      if (task) openModal(task);
    } else if (action === 'delete') {
      deleteTask(id);
    } else if (action === 'cycle') {
      cycleStatus(id);
    }
  });
}

init();
