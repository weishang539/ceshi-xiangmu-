const express = require('express');
const path = require('path');
const { readDb, writeDb, genId, hashPassword, addLog } = require('./db');
const { login, logout, getSession, sanitizeUser, requireAuth, requireAdmin } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Public task API (workbench) ──

app.get('/api/tasks', (req, res) => {
  const db = readDb();
  const { status, search } = req.query;
  let tasks = [...db.tasks];
  if (status && status !== 'all') tasks = tasks.filter((t) => t.status === status);
  if (search) {
    const q = search.toLowerCase();
    tasks = tasks.filter(
      (t) => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
    );
  }
  tasks.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(tasks);
});

app.get('/api/tasks/stats', (_req, res) => {
  const db = readDb();
  res.json({
    total: db.tasks.length,
    todo: db.tasks.filter((t) => t.status === 'todo').length,
    doing: db.tasks.filter((t) => t.status === 'doing').length,
    done: db.tasks.filter((t) => t.status === 'done').length,
  });
});

app.post('/api/tasks', (req, res) => {
  const db = readDb();
  const { title, description, status, priority } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: '标题不能为空' });
  const now = new Date().toISOString();
  const task = {
    id: genId(),
    title: title.trim(),
    description: (description || '').trim(),
    status: status || 'todo',
    priority: priority || 'medium',
    assigneeId: 'admin',
    createdAt: now,
    updatedAt: now,
  };
  db.tasks.unshift(task);
  addLog(db, 'system', '创建任务', `创建任务「${task.title}」`);
  writeDb(db);
  res.status(201).json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const db = readDb();
  const idx = db.tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '任务不存在' });
  const { title, description, status, priority } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: '标题不能为空' });
  db.tasks[idx] = {
    ...db.tasks[idx],
    title: title.trim(),
    description: (description || '').trim(),
    status: status || db.tasks[idx].status,
    priority: priority || db.tasks[idx].priority,
    updatedAt: new Date().toISOString(),
  };
  addLog(db, 'system', '更新任务', `更新任务「${db.tasks[idx].title}」`);
  writeDb(db);
  res.json(db.tasks[idx]);
});

app.delete('/api/tasks/:id', (req, res) => {
  const db = readDb();
  const task = db.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  db.tasks = db.tasks.filter((t) => t.id !== req.params.id);
  addLog(db, 'system', '删除任务', `删除任务「${task.title}」`);
  writeDb(db);
  res.json({ ok: true });
});

app.get('/api/settings/public', (_req, res) => {
  const db = readDb();
  res.json({ siteName: db.settings.siteName });
});

// ── Admin auth ──

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDb();
  const result = login(username, password, db.users);
  if (!result) return res.status(401).json({ error: '用户名或密码错误' });
  addLog(db, result.user.id, '登录', `${result.user.name} 登录系统`);
  writeDb(db);
  res.json(result);
});

app.post('/api/admin/logout', requireAuth, (req, res) => {
  logout(req.token);
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAuth, (req, res) => {
  const db = readDb();
  const user = db.users.find((u) => u.id === req.session.userId);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(sanitizeUser(user));
});

app.put('/api/admin/me/password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  const db = readDb();
  const user = db.users.find((u) => u.id === req.session.userId);
  if (!user || user.password !== hashPassword(oldPassword)) {
    return res.status(400).json({ error: '原密码错误' });
  }
  user.password = hashPassword(newPassword);
  addLog(db, user.id, '修改密码', `${user.name} 修改了密码`);
  writeDb(db);
  res.json({ ok: true });
});

// ── Admin dashboard ──

app.get('/api/admin/dashboard', requireAuth, requireAdmin, (_req, res) => {
  const db = readDb();
  const today = new Date().toISOString().slice(0, 10);
  res.json({
    tasks: {
      total: db.tasks.length,
      todo: db.tasks.filter((t) => t.status === 'todo').length,
      doing: db.tasks.filter((t) => t.status === 'doing').length,
      done: db.tasks.filter((t) => t.status === 'done').length,
    },
    users: {
      total: db.users.length,
      active: db.users.filter((u) => u.status === 'active').length,
    },
    todayLogs: db.logs.filter((l) => l.createdAt.startsWith(today)).length,
    recentTasks: [...db.tasks]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 5),
    recentLogs: db.logs.slice(0, 8),
  });
});

// ── Admin tasks ──

app.get('/api/admin/tasks', requireAuth, requireAdmin, (req, res) => {
  const db = readDb();
  const { status, search, page = 1, pageSize = 10 } = req.query;
  let tasks = [...db.tasks];
  if (status && status !== 'all') tasks = tasks.filter((t) => t.status === status);
  if (search) {
    const q = search.toLowerCase();
    tasks = tasks.filter(
      (t) => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
    );
  }
  tasks.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const total = tasks.length;
  const ps = Number(pageSize);
  const pg = Number(page);
  const items = tasks.slice((pg - 1) * ps, pg * ps);
  const users = db.users;
  const enriched = items.map((t) => ({
    ...t,
    assigneeName: users.find((u) => u.id === t.assigneeId)?.name || '-',
  }));
  res.json({ items: enriched, total, page: pg, pageSize: ps });
});

app.post('/api/admin/tasks', requireAuth, requireAdmin, (req, res) => {
  const db = readDb();
  const { title, description, status, priority, assigneeId } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: '标题不能为空' });
  const now = new Date().toISOString();
  const task = {
    id: genId(),
    title: title.trim(),
    description: (description || '').trim(),
    status: status || 'todo',
    priority: priority || 'medium',
    assigneeId: assigneeId || req.currentUser.id,
    createdAt: now,
    updatedAt: now,
  };
  db.tasks.unshift(task);
  addLog(db, req.currentUser.id, '创建任务', `创建任务「${task.title}」`);
  writeDb(db);
  res.status(201).json(task);
});

app.put('/api/admin/tasks/:id', requireAuth, requireAdmin, (req, res) => {
  const db = readDb();
  const idx = db.tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '任务不存在' });
  const { title, description, status, priority, assigneeId } = req.body;
  db.tasks[idx] = {
    ...db.tasks[idx],
    title: title?.trim() || db.tasks[idx].title,
    description: description !== undefined ? description.trim() : db.tasks[idx].description,
    status: status || db.tasks[idx].status,
    priority: priority || db.tasks[idx].priority,
    assigneeId: assigneeId || db.tasks[idx].assigneeId,
    updatedAt: new Date().toISOString(),
  };
  addLog(db, req.currentUser.id, '更新任务', `更新任务「${db.tasks[idx].title}」`);
  writeDb(db);
  res.json(db.tasks[idx]);
});

app.delete('/api/admin/tasks/:id', requireAuth, requireAdmin, (req, res) => {
  const db = readDb();
  const task = db.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  db.tasks = db.tasks.filter((t) => t.id !== req.params.id);
  addLog(db, req.currentUser.id, '删除任务', `删除任务「${task.title}」`);
  writeDb(db);
  res.json({ ok: true });
});

// ── Admin users ──

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const db = readDb();
  const { search, page = 1, pageSize = 10 } = req.query;
  let users = db.users.map(sanitizeUser);
  if (search) {
    const q = search.toLowerCase();
    users = users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    );
  }
  const total = users.length;
  const ps = Number(pageSize);
  const pg = Number(page);
  const items = users.slice((pg - 1) * ps, pg * ps);
  res.json({ items, total, page: pg, pageSize: ps });
});

app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const db = readDb();
  const { username, password, name, email, role } = req.body;
  if (!username?.trim() || !password || !name?.trim()) {
    return res.status(400).json({ error: '用户名、密码、姓名不能为空' });
  }
  if (db.users.some((u) => u.username === username.trim())) {
    return res.status(400).json({ error: '用户名已存在' });
  }
  const user = {
    id: genId(),
    username: username.trim(),
    password: hashPassword(password),
    name: name.trim(),
    email: (email || '').trim(),
    role: role || 'user',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  addLog(db, req.currentUser.id, '创建用户', `创建用户「${user.name}」`);
  writeDb(db);
  res.status(201).json(sanitizeUser(user));
});

app.put('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const db = readDb();
  const idx = db.users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '用户不存在' });
  const { name, email, role, status, password } = req.body;
  if (name) db.users[idx].name = name.trim();
  if (email !== undefined) db.users[idx].email = email.trim();
  if (role) db.users[idx].role = role;
  if (status) db.users[idx].status = status;
  if (password) db.users[idx].password = hashPassword(password);
  addLog(db, req.currentUser.id, '更新用户', `更新用户「${db.users[idx].name}」`);
  writeDb(db);
  res.json(sanitizeUser(db.users[idx]));
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const db = readDb();
  if (req.params.id === req.currentUser.id) {
    return res.status(400).json({ error: '不能删除当前登录用户' });
  }
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  db.users = db.users.filter((u) => u.id !== req.params.id);
  addLog(db, req.currentUser.id, '删除用户', `删除用户「${user.name}」`);
  writeDb(db);
  res.json({ ok: true });
});

// ── Admin logs ──

app.get('/api/admin/logs', requireAuth, requireAdmin, (req, res) => {
  const db = readDb();
  const { page = 1, pageSize = 20 } = req.query;
  const ps = Number(pageSize);
  const pg = Number(page);
  const logs = db.logs.map((l) => ({
    ...l,
    userName: db.users.find((u) => u.id === l.userId)?.name || '系统',
  }));
  res.json({ items: logs.slice((pg - 1) * ps, pg * ps), total: logs.length, page: pg, pageSize: ps });
});

// ── Admin settings ──

app.get('/api/admin/settings', requireAuth, requireAdmin, (_req, res) => {
  res.json(readDb().settings);
});

app.put('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const db = readDb();
  const { siteName, pageSize, allowRegister } = req.body;
  if (siteName) db.settings.siteName = siteName.trim();
  if (pageSize) db.settings.pageSize = Number(pageSize);
  if (allowRegister !== undefined) db.settings.allowRegister = Boolean(allowRegister);
  addLog(db, req.currentUser.id, '更新设置', '更新系统设置');
  writeDb(db);
  res.json(db.settings);
});

// ── Static files ──

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

app.listen(PORT, () => {
  console.log(`工作台服务已启动: http://localhost:${PORT}`);
  console.log(`后台管理: http://localhost:${PORT}/admin/login.html`);
  console.log(`默认账号: admin / admin123`);
});
