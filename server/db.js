const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  users: [
    {
      id: 'admin',
      username: 'admin',
      password: hashPassword('admin123'),
      name: '系统管理员',
      role: 'admin',
      email: 'admin@example.com',
      status: 'active',
      createdAt: new Date().toISOString(),
    },
  ],
  tasks: [],
  logs: [],
  settings: {
    siteName: '个人工作台',
    pageSize: 10,
    allowRegister: false,
  },
};

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function createDefaultDb() {
  const db = { ...DEFAULT_DB };
  const now = new Date().toISOString();
  db.tasks = [
    {
      id: genId(),
      title: '整理本周工作计划',
      description: '列出优先级最高的 3 项任务',
      status: 'todo',
      priority: 'high',
      assigneeId: 'admin',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: genId(),
      title: '回复客户邮件',
      description: '',
      status: 'doing',
      priority: 'medium',
      assigneeId: 'admin',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: genId(),
      title: '提交月度总结',
      description: '已完成并发送给主管',
      status: 'done',
      priority: 'low',
      assigneeId: 'admin',
      createdAt: now,
      updatedAt: now,
    },
  ];
  return db;
}

function ensureDb() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(createDefaultDb(), null, 2), 'utf-8');
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function writeDb(db) {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function addLog(db, userId, action, detail) {
  db.logs.unshift({
    id: genId(),
    userId,
    action,
    detail,
    createdAt: new Date().toISOString(),
  });
  if (db.logs.length > 200) db.logs.length = 200;
}

module.exports = {
  readDb,
  writeDb,
  genId,
  hashPassword,
  addLog,
};
