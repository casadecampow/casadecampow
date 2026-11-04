const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 7080;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'calendar.json');

// Usuarios del panel. ADMIN_USERS = "gabriel:clave1,diego:clave2" (variable de Railway).
// Si no está definida, se mantiene el acceso anterior con ADMIN_PASSWORD (un solo usuario compartido).
function displayName(username) {
  const u = String(username || '').trim();
  return u.charAt(0).toUpperCase() + u.slice(1).toLowerCase();
}

function parseUsers() {
  const raw = process.env.ADMIN_USERS;
  if (!raw || !raw.trim()) return null;
  const users = new Map();
  for (const pair of raw.split(',')) {
    const i = pair.indexOf(':');
    if (i < 1) continue;
    const username = pair.slice(0, i).trim().toLowerCase();
    const password = pair.slice(i + 1);
    if (username && password) users.set(username, { name: displayName(username), password });
  }
  return users.size ? users : null;
}

const USERS = parseUsers();
const LEGACY_PASSWORD = process.env.ADMIN_PASSWORD || 'casaw2026';

function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function authenticate(username, password) {
  if (USERS) {
    const u = USERS.get(String(username || '').trim().toLowerCase());
    // Se compara siempre, exista o no el usuario, para no revelar cuáles existen.
    const ok = sameSecret(password, u ? u.password : crypto.randomBytes(16).toString('hex'));
    return u && ok ? u.name : null;
  }
  return sameSecret(password, LEGACY_PASSWORD) ? 'Administrador' : null;
}

const EVENT_TYPES = {
  boda: 'Boda',
  corporativo: 'Evento corporativo',
  integracion: 'Integración',
  concierto: 'Concierto',
  feria: 'Feria',
  otro: 'Otro',
};

function loadCalendar() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    data = {};
  }
  if (!Array.isArray(data.occupied)) data.occupied = [];
  if (!data.details || typeof data.details !== 'object') data.details = {};
  if (!Array.isArray(data.history)) data.history = [];
  return data;
}

function saveCalendar(data) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, DATA_FILE);
}

function addHistory(data, entry) {
  data.history.push({ ...entry, at: new Date().toISOString() });
  if (data.history.length > 200) data.history = data.history.slice(-200);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Límite simple de intentos de ingreso por IP: 8 fallidos cada 15 minutos.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
function tooManyFails(ip) {
  const a = attempts.get(ip);
  if (!a || Date.now() - a.first > WINDOW_MS) return false;
  return a.count >= MAX_FAILS;
}
function noteFail(ip) {
  const a = attempts.get(ip);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(ip, { first: Date.now(), count: 1 });
  else a.count += 1;
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'casa-w-dev-secret-cambiar-en-produccion',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8, sameSite: 'lax' },
}));

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(403).json({ ok: false, error: 'No autorizado' });
  next();
}

// Público: solo fechas ocupadas. Los detalles (tipo y quién cerró) son solo para el equipo.
app.get('/api/calendar', (req, res) => {
  const data = loadCalendar();
  const out = { occupied: data.occupied, isAdmin: !!req.session.isAdmin };
  if (req.session.isAdmin) {
    out.user = req.session.user || 'Administrador';
    out.details = data.details;
    out.history = data.history.slice(-10).reverse();
    out.types = EVENT_TYPES;
  }
  res.json(out);
});

app.get('/api/admin/session', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin, user: req.session.user || null });
});

app.post('/api/admin/login', (req, res) => {
  const ip = req.ip;
  if (tooManyFails(ip)) {
    return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' });
  }
  const { username, password } = req.body || {};
  const name = authenticate(username, password);
  if (name) {
    attempts.delete(ip);
    req.session.isAdmin = true;
    req.session.user = name;
    return res.json({ ok: true, user: name });
  }
  noteFail(ip);
  res.status(401).json({ ok: false, error: USERS ? 'Usuario o contraseña incorrectos' : 'Contraseña incorrecta' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.post('/api/admin/close', requireAdmin, (req, res) => {
  const { date, type } = req.body || {};
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return res.status(400).json({ ok: false, error: 'Fecha inválida' });
  }
  if (typeof type !== 'string' || !EVENT_TYPES[type]) {
    return res.status(400).json({ ok: false, error: 'Elige el tipo de evento' });
  }
  const data = loadCalendar();
  if (data.occupied.includes(date)) {
    return res.status(409).json({ ok: false, error: 'Esa fecha ya está ocupada' });
  }
  const by = req.session.user || 'Administrador';
  data.occupied = [...data.occupied, date].sort();
  data.details[date] = { type, by, at: new Date().toISOString() };
  addHistory(data, { action: 'cerró', date, type, by });
  saveCalendar(data);
  res.json({ ok: true, date, detail: data.details[date] });
});

app.post('/api/admin/release', requireAdmin, (req, res) => {
  const { date } = req.body || {};
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return res.status(400).json({ ok: false, error: 'Fecha inválida' });
  }
  const data = loadCalendar();
  if (!data.occupied.includes(date)) {
    return res.status(409).json({ ok: false, error: 'Esa fecha ya estaba libre' });
  }
  const prev = data.details[date];
  data.occupied = data.occupied.filter((d) => d !== date);
  delete data.details[date];
  addHistory(data, { action: 'liberó', date, type: prev ? prev.type : null, by: req.session.user || 'Administrador' });
  saveCalendar(data);
  res.json({ ok: true, date });
});

const DAY = 86400;
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders(res, filePath) {
    if (/\.(woff2|woff)$/i.test(filePath)) {
      res.setHeader('Cache-Control', `public, max-age=${DAY * 365}, immutable`);
    } else if (/\.(webp|jpe?g|png|svg|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', `public, max-age=${DAY * 30}`);
    } else if (/\.(css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', `public, max-age=${DAY}, must-revalidate`);
    } else if (/\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  },
}));

app.listen(PORT, () => {
  console.log(`Casa W corriendo en http://localhost:${PORT}`);
});
