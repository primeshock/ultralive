const User = require('../models/User');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateStreamKey } = require('../utils/streamKey');
const { signToken, setAuthCookie, clearAuthCookie } = require('../utils/jwt');
const { ownerUser } = require('../utils/serialize');
const { serverIp, rtmpPort, publicPort: apiPort } = require('../config/env');
const SiteSettings = require('../models/SiteSettings');
const LoginLog = require('../models/LoginLog');
const Organization = require('../models/Organization');

const USERNAME_RE = /^[a-z0-9_]{3,24}$/i;

async function register(req, res) {
  const settings = await SiteSettings.get();
  if (!settings.allowPublicRegister) {
    return res.status(403).json({ error: 'ثبت‌نام عمومی غیرفعال است. کانال‌ها فقط توسط ادمین ساخته می‌شوند.' });
  }
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-24 chars: letters, numbers, underscore' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = await User.findOne({ username: username.toLowerCase() });
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const passwordHash = await hashPassword(password);
  const streamKey = generateStreamKey();

  const user = await User.create({
    username: username.toLowerCase(),
    passwordHash,
    streamKey,
    displayName: username,
  });

  const token = signToken(user._id.toString());
  setAuthCookie(res, token);
  res.status(201).json({ user: ownerUser(user, { serverIp, rtmpPort, apiPort }) });
}

async function login(req, res) {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = await User.findOne({ username: username.toLowerCase() });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(user._id.toString());
  setAuthCookie(res, token);
  LoginLog.create({ username: user.username, action: 'login', ip: req.ip }).catch(() => {});
  res.json({ user: ownerUser(user, { serverIp, rtmpPort, apiPort }) });
}

function logout(req, res) {
  try {
    const token = req.cookies[require('../utils/jwt').COOKIE_NAME];
    if (token) {
      const { sub } = require('../utils/jwt').verifyToken(token);
      require('../models/User')
        .findById(sub)
        .then((u) => u && LoginLog.create({ username: u.username, action: 'logout', ip: req.ip }).catch(() => {}));
    }
  } catch {
    /* not logged in / expired — nothing to log */
  }
  clearAuthCookie(res);
  res.json({ ok: true });
}

function me(req, res) {
  const activeOrganization = req.organizationContext || (req.user.organizationId ? Organization.findById(req.user.organizationId) : null);
  Promise.resolve(activeOrganization).then((organization) => res.json({ user: ownerUser(req.user, { serverIp, rtmpPort, apiPort }), activeOrganization: organization || null }));
}

module.exports = { register, login, logout, me };
