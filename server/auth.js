const crypto = require('crypto');
const { hashPassword } = require('./db');

const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000;

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function login(username, password, users) {
  const user = users.find(
    (u) => u.username === username && u.password === hashPassword(password) && u.status === 'active'
  );
  if (!user) return null;

  const token = createToken();
  sessions.set(token, {
    userId: user.id,
    expiresAt: Date.now() + SESSION_TTL,
  });
  return { token, user: sanitizeUser(user) };
}

function logout(token) {
  sessions.delete(token);
}

function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function sanitizeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: '未登录或会话已过期' });
  }
  req.session = session;
  req.token = token;
  next();
}

function requireAdmin(req, res, next) {
  const db = require('./db').readDb();
  const user = db.users.find((u) => u.id === req.session.userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: '无权限' });
  }
  req.currentUser = user;
  next();
}

module.exports = {
  login,
  logout,
  getSession,
  sanitizeUser,
  requireAuth,
  requireAdmin,
  hashPassword,
};
