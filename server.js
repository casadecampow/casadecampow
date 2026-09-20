const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 7080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'casaw2026';
const DATA_FILE = path.join(__dirname, 'data', 'calendar.json');

function loadCalendar() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { occupied: [] };
  }
}

function saveCalendar(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'casa-w-dev-secret-cambiar-en-produccion',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 },
}));

app.get('/api/calendar', (req, res) => {
  const data = loadCalendar();
  res.json({ occupied: data.occupied, isAdmin: !!req.session.isAdmin });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.post('/api/admin/toggle', (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(403).json({ ok: false, error: 'No autorizado' });
  }
  const { date } = req.body || {};
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return res.status(400).json({ ok: false, error: 'Fecha inválida' });
  }
  const data = loadCalendar();
  const set = new Set(data.occupied);
  let occupied;
  if (set.has(date)) {
    set.delete(date);
    occupied = false;
  } else {
    set.add(date);
    occupied = true;
  }
  data.occupied = Array.from(set).sort();
  saveCalendar(data);
  res.json({ ok: true, date, occupied });
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Casa W corriendo en http://localhost:${PORT}`);
});
