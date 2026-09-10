const STATUS_LABELS = { todo: '待办', doing: '进行中', done: '已完成' };
const PRIORITY_LABELS = { low: '低', medium: '中', high: '高' };

let currentPage = 'dashboard';
let modalCallback = null;

const token = localStorage.getItem('admin_token');
if (!token) location.href = '/admin/login.html';

const user = JSON.parse(localStorage.getItem('admin_user') || '{}');
document.getElementById('currentUserName').textContent = user.name || '管理员';

const $ = (sel) => document.querySelector(sel);
const content = $('#content');
const modal = $('#modal');

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    location.href = '/admin/login.html';
    return;
  }
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function openModal(title, bodyHtml, onSubmit) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  modalCallback = onSubmit;
  modal.showModal();
}

function closeModal() {
  modal.close();
  modalCallback = null;
  $('#modalForm').reset();
}

$('#btnCloseModal').addEventListener('click', closeModal);
$('#btnCancel').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

$('#modalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (modalCallback) await modalCallback(new FormData(e.target));
});

$('#btnLogout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
  location.href = '/admin/login.html';
});

$('#sidebarNav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn) return;
  $$('.nav-item').forEach((b) => b.classList.remove('nav-item--active'));
  btn.classList.add('nav-item--active');
  navigate(btn.dataset.page);
});

function $$(sel) { return document.querySelectorAll(sel); }

const PAGE_TITLES = {
  dashboard: '仪表盘',
  tasks: '任务管理',
  users: '用户管理',
  logs: '操作日志',
  settings: '系统设置',
  profile: '个人中心',
};

function navigate(page) {
  currentPage = page;
  $('#pageTitle').textContent = PAGE_TITLES[page];
  const renderers = {
    dashboard: renderDashboard,
    tasks: () => renderTasks(1),
    users: () => renderUsers(1),
    logs: () => renderLogs(1),
    settings: renderSettings,
    profile: renderProfile,
  };
  renderers[page]?.();
}

// ── Dashboard ──

async function renderDashboard() {
  content.innerHTML = '<p class="empty">加载中...</p>';
  const data = await api('/api/admin/dashboard');

  content.innerHTML = `
    <div class="card-grid">
      <div class="stat-card"><span class="stat-card__value">${data.tasks.total}</span><span class="stat-card__label">任务总数</span></div>
      <div class="stat-card"><span class="stat-card__value" style="color:var(--warning)">${data.tasks.todo}</span><span class="stat-card__label">待办</span></div>
      <div class="stat-card"><span class="stat-card__value" style="color:var(--primary)">${data.tasks.doing}</span><span class="stat-card__label">进行中</span></div>
      <div class="stat-card"><span class="stat-card__value" style="color:var(--success)">${data.tasks.done}</span><span class="stat-card__label">已完成</span></div>
      <div class="stat-card"><span class="stat-card__value">${data.users.active}</span><span class="stat-card__label">活跃用户</span></div>
      <div class="stat-card"><span class="stat-card__value">${data.todayLogs}</span><span class="stat-card__label">今日操作</span></div>
    </div>
    <div class="two-col">
      <div class="panel">
        <div class="panel__header"><h3>最近任务</h3></div>
        <div class="panel__body">
          ${data.recentTasks.length ? data.recentTasks.map((t) => `
            <div class="log-item">
              <span class="badge badge--${t.status}">${STATUS_LABELS[t.status]}</span>
              ${esc(t.title)}
              <div class="log-item__time">${fmtDate(t.updatedAt)}</div>
            </div>
          `).join('') : '<p class="empty">暂无任务</p>'}
        </div>
      </div>
      <div class="panel">
        <div class="panel__header"><h3>最近操作</h3></div>
        <div class="panel__body">
          ${data.recentLogs.length ? data.recentLogs.map((l) => `
            <div class="log-item">
              <strong>${esc(l.userName)}</strong> · ${esc(l.action)} · ${esc(l.detail)}
              <div class="log-item__time">${fmtDate(l.createdAt)}</div>
            </div>
          `).join('') : '<p class="empty">暂无日志</p>'}
        </div>
      </div>
    </div>
  `;
}

// ── Tasks ──

let taskFilter = { status: 'all', search: '' };

async function renderTasks(page) {
  content.innerHTML = '<p class="empty">加载中...</p>';
  const params = new URLSearchParams({ page, pageSize: 10, ...taskFilter });
  const data = await api(`/api/admin/tasks?${params}`);
  const users = await api('/api/admin/users?pageSize=100');

  content.innerHTML = `
    <div class="toolbar">
      <input type="search" id="taskSearch" placeholder="搜索任务..." value="${esc(taskFilter.search)}" />
      <select id="taskStatusFilter">
        <option value="all">全部状态</option>
        <option value="todo">待办</option>
        <option value="doing">进行中</option>
        <option value="done">已完成</option>
      </select>
      <button class="btn btn--primary" id="btnAddTask">+ 新建任务</button>
    </div>
    <div class="panel">
      <div class="table-wrap">
        <table>
          <thead><tr><th>标题</th><th>状态</th><th>优先级</th><th>负责人</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody>
            ${data.items.length ? data.items.map((t) => `
              <tr data-id="${t.id}">
                <td>${esc(t.title)}</td>
                <td><span class="badge badge--${t.status}">${STATUS_LABELS[t.status]}</span></td>
                <td><span class="badge badge--${t.priority}">${PRIORITY_LABELS[t.priority]}</span></td>
                <td>${esc(t.assigneeName)}</td>
                <td>${fmtDate(t.updatedAt)}</td>
                <td class="actions">
                  <button class="btn btn--ghost btn--sm" data-action="edit">编辑</button>
                  <button class="btn btn--danger btn--sm" data-action="delete">删除</button>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="6" class="empty">暂无数据</td></tr>'}
          </tbody>
        </table>
      </div>
      ${renderPagination(data, renderTasks)}
    </div>
  `;

  $('#taskStatusFilter').value = taskFilter.status;
  $('#taskSearch').addEventListener('input', (e) => {
    taskFilter.search = e.target.value;
    renderTasks(1);
  });
  $('#taskStatusFilter').addEventListener('change', (e) => {
    taskFilter.status = e.target.value;
    renderTasks(1);
  });
  $('#btnAddTask').addEventListener('click', () => showTaskModal(null, users.items));
  content.querySelector('tbody').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr');
    if (!tr?.dataset.id) return;
    const task = data.items.find((t) => t.id === tr.dataset.id);
    if (e.target.dataset.action === 'edit') showTaskModal(task, users.items);
    if (e.target.dataset.action === 'delete') {
      if (confirm('确定删除？')) {
        await api(`/api/admin/tasks/${tr.dataset.id}`, { method: 'DELETE' });
        renderTasks(page);
      }
    }
  });
}

function showTaskModal(task, users) {
  const userOpts = users.map((u) => `<option value="${u.id}" ${task?.assigneeId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  openModal(task ? '编辑任务' : '新建任务', `
    <label class="field"><span>标题</span><input name="title" required value="${esc(task?.title || '')}" /></label>
    <label class="field"><span>描述</span><textarea name="description" rows="3">${esc(task?.description || '')}</textarea></label>
    <label class="field"><span>状态</span><select name="status">
      <option value="todo" ${task?.status === 'todo' ? 'selected' : ''}>待办</option>
      <option value="doing" ${task?.status === 'doing' ? 'selected' : ''}>进行中</option>
      <option value="done" ${task?.status === 'done' ? 'selected' : ''}>已完成</option>
    </select></label>
    <label class="field"><span>优先级</span><select name="priority">
      <option value="low" ${task?.priority === 'low' ? 'selected' : ''}>低</option>
      <option value="medium" ${!task || task.priority === 'medium' ? 'selected' : ''}>中</option>
      <option value="high" ${task?.priority === 'high' ? 'selected' : ''}>高</option>
    </select></label>
    <label class="field"><span>负责人</span><select name="assigneeId">${userOpts}</select></label>
  `, async (fd) => {
    const body = Object.fromEntries(fd);
    if (task) {
      await api(`/api/admin/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/admin/tasks', { method: 'POST', body: JSON.stringify(body) });
    }
    closeModal();
    renderTasks(1);
  });
}

// ── Users ──

let userSearch = '';

async function renderUsers(page) {
  content.innerHTML = '<p class="empty">加载中...</p>';
  const params = new URLSearchParams({ page, pageSize: 10, search: userSearch });
  const data = await api(`/api/admin/users?${params}`);

  content.innerHTML = `
    <div class="toolbar">
      <input type="search" id="userSearch" placeholder="搜索用户..." value="${esc(userSearch)}" />
      <button class="btn btn--primary" id="btnAddUser">+ 新建用户</button>
    </div>
    <div class="panel">
      <div class="table-wrap">
        <table>
          <thead><tr><th>用户名</th><th>姓名</th><th>邮箱</th><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>
            ${data.items.map((u) => `
              <tr data-id="${u.id}">
                <td>${esc(u.username)}</td>
                <td>${esc(u.name)}</td>
                <td>${esc(u.email || '-')}</td>
                <td><span class="badge badge--${u.role}">${u.role === 'admin' ? '管理员' : '普通用户'}</span></td>
                <td><span class="badge badge--${u.status === 'active' ? 'active' : 'disabled'}">${u.status === 'active' ? '正常' : '禁用'}</span></td>
                <td>${fmtDate(u.createdAt)}</td>
                <td class="actions">
                  <button class="btn btn--ghost btn--sm" data-action="edit">编辑</button>
                  <button class="btn btn--danger btn--sm" data-action="delete">删除</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${renderPagination(data, renderUsers)}
    </div>
  `;

  $('#userSearch').addEventListener('input', (e) => { userSearch = e.target.value; renderUsers(1); });
  $('#btnAddUser').addEventListener('click', () => showUserModal(null));
  content.querySelector('tbody').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr');
    if (!tr?.dataset.id) return;
    const u = data.items.find((x) => x.id === tr.dataset.id);
    if (e.target.dataset.action === 'edit') showUserModal(u);
    if (e.target.dataset.action === 'delete') {
      if (confirm('确定删除该用户？')) {
        await api(`/api/admin/users/${tr.dataset.id}`, { method: 'DELETE' });
        renderUsers(page);
      }
    }
  });
}

function showUserModal(u) {
  openModal(u ? '编辑用户' : '新建用户', `
    ${u ? '' : '<label class="field"><span>用户名</span><input name="username" required /></label>'}
    ${u ? '' : '<label class="field"><span>密码</span><input name="password" type="password" required minlength="6" /></label>'}
    <label class="field"><span>姓名</span><input name="name" required value="${esc(u?.name || '')}" /></label>
    <label class="field"><span>邮箱</span><input name="email" type="email" value="${esc(u?.email || '')}" /></label>
    <label class="field"><span>角色</span><select name="role">
      <option value="user" ${u?.role === 'user' ? 'selected' : ''}>普通用户</option>
      <option value="admin" ${u?.role === 'admin' ? 'selected' : ''}>管理员</option>
    </select></label>
    ${u ? `<label class="field"><span>状态</span><select name="status">
      <option value="active" ${u.status === 'active' ? 'selected' : ''}>正常</option>
      <option value="disabled" ${u.status === 'disabled' ? 'selected' : ''}>禁用</option>
    </select></label>
    <label class="field"><span>重置密码（留空不修改）</span><input name="password" type="password" minlength="6" /></label>` : ''}
  `, async (fd) => {
    const body = Object.fromEntries(fd);
    if (u) {
      if (!body.password) delete body.password;
      await api(`/api/admin/users/${u.id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await api('/api/admin/users', { method: 'POST', body: JSON.stringify(body) });
    }
    closeModal();
    renderUsers(1);
  });
}

// ── Logs ──

async function renderLogs(page) {
  content.innerHTML = '<p class="empty">加载中...</p>';
  const data = await api(`/api/admin/logs?page=${page}&pageSize=20`);

  content.innerHTML = `
    <div class="panel">
      <div class="table-wrap">
        <table>
          <thead><tr><th>时间</th><th>操作人</th><th>操作</th><th>详情</th></tr></thead>
          <tbody>
            ${data.items.map((l) => `
              <tr>
                <td>${fmtDate(l.createdAt)}</td>
                <td>${esc(l.userName)}</td>
                <td>${esc(l.action)}</td>
                <td>${esc(l.detail)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${renderPagination(data, renderLogs)}
    </div>
  `;
}

// ── Settings ──

async function renderSettings() {
  content.innerHTML = '<p class="empty">加载中...</p>';
  const settings = await api('/api/admin/settings');

  content.innerHTML = `
    <div class="panel" style="max-width:480px">
      <div class="panel__header"><h3>系统设置</h3></div>
      <div class="panel__body">
        <form id="settingsForm" style="display:flex;flex-direction:column;gap:16px">
          <label class="field"><span>站点名称</span><input name="siteName" value="${esc(settings.siteName)}" required /></label>
          <label class="field"><span>每页条数</span><input name="pageSize" type="number" min="5" max="50" value="${settings.pageSize}" /></label>
          <label class="field"><span>允许注册</span><select name="allowRegister">
            <option value="false" ${!settings.allowRegister ? 'selected' : ''}>否</option>
            <option value="true" ${settings.allowRegister ? 'selected' : ''}>是</option>
          </select></label>
          <button type="submit" class="btn btn--primary" style="align-self:flex-start">保存设置</button>
        </form>
      </div>
    </div>
  `;

  $('#settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      siteName: fd.get('siteName'),
      pageSize: Number(fd.get('pageSize')),
      allowRegister: fd.get('allowRegister') === 'true',
    };
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
    alert('设置已保存');
  });
}

// ── Profile ──

async function renderProfile() {
  const me = await api('/api/admin/me');

  content.innerHTML = `
    <div class="panel" style="max-width:480px">
      <div class="panel__header"><h3>个人信息</h3></div>
      <div class="panel__body">
        <p style="margin-bottom:16px;color:var(--text-muted);font-size:0.9rem">
          用户名：${esc(me.username)} · 角色：${me.role === 'admin' ? '管理员' : '普通用户'}
        </p>
        <form id="pwdForm" style="display:flex;flex-direction:column;gap:16px">
          <label class="field"><span>原密码</span><input name="oldPassword" type="password" required /></label>
          <label class="field"><span>新密码</span><input name="newPassword" type="password" required minlength="6" /></label>
          <label class="field"><span>确认新密码</span><input name="confirmPassword" type="password" required minlength="6" /></label>
          <button type="submit" class="btn btn--primary" style="align-self:flex-start">修改密码</button>
        </form>
      </div>
    </div>
  `;

  $('#pwdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get('newPassword') !== fd.get('confirmPassword')) {
      alert('两次密码不一致');
      return;
    }
    await api('/api/admin/me/password', {
      method: 'PUT',
      body: JSON.stringify({
        oldPassword: fd.get('oldPassword'),
        newPassword: fd.get('newPassword'),
      }),
    });
    alert('密码修改成功，请重新登录');
    localStorage.removeItem('admin_token');
    location.href = '/admin/login.html';
  });
}

function renderPagination(data, renderFn) {
  const totalPages = Math.ceil(data.total / data.pageSize) || 1;
  if (totalPages <= 1) return '';
  return `
    <div class="pagination">
      <button class="btn btn--ghost btn--sm" ${data.page <= 1 ? 'disabled' : ''} data-page="${data.page - 1}">上一页</button>
      <span>第 ${data.page} / ${totalPages} 页，共 ${data.total} 条</span>
      <button class="btn btn--ghost btn--sm" ${data.page >= totalPages ? 'disabled' : ''} data-page="${data.page + 1}">下一页</button>
    </div>
  `.replace(/data-page="(\d+)"/g, (_, p) => {
    return `data-page="${p}"`;
  });
}

content.addEventListener('click', (e) => {
  const btn = e.target.closest('.pagination [data-page]');
  if (!btn || btn.disabled) return;
  const page = Number(btn.dataset.page);
  if (!page) return;
  const renderers = { tasks: renderTasks, users: renderUsers, logs: renderLogs };
  renderers[currentPage]?.(page);
});

navigate('dashboard');
