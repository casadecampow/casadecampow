(function () {
  const WA_NUMBER = '51904956522';
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const DIAS = ['D','L','M','X','J','V','S'];
  const TIPOS_CORTO = { boda: 'Boda', corporativo: 'Corp.', integracion: 'Integ.', concierto: 'Conc.', feria: 'Feria', otro: 'Otro' };

  function pad(n) { return String(n).padStart(2, '0'); }
  function toKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function fmtLarga(d) { return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; }
  function startOfToday() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
  function fromKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtCuando(iso) {
    try {
      return new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function initAvailabilityCalendar(selector, opts) {
    opts = opts || {};
    const root = document.querySelector(selector);
    if (!root) return;

    const readOnly = !!opts.readOnly;

    const today = startOfToday();
    let viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
    let occupied = new Set();
    let isAdmin = false;
    let adminUser = '';
    let details = {};
    let history = [];
    let types = {};
    let selected = null;
    let adminFormOpen = !!opts.autoOpenAdmin;

    root.innerHTML = `
      <div class="avail-card">
        <div class="avail-nav">
          <button type="button" data-nav="-1" aria-label="Mes anterior">&larr;</button>
          <div class="avail-month"></div>
          <button type="button" data-nav="1" aria-label="Mes siguiente">&rarr;</button>
        </div>
        <div class="avail-weekdays">${DIAS.map(d => `<span>${d}</span>`).join('')}</div>
        <div class="avail-grid"></div>
        <div class="avail-legend">
          <span><i class="dot-free"></i>Disponible</span>
          <span><i class="dot-busy"></i>Ocupado</span>
          <span><i class="dot-today"></i>Hoy</span>
        </div>
        <div class="avail-selected-slot"></div>
        <div class="avail-admin-bar"></div>
      </div>
    `;

    const monthLabel = root.querySelector('.avail-month');
    const grid = root.querySelector('.avail-grid');
    const selectedSlot = root.querySelector('.avail-selected-slot');
    const adminBar = root.querySelector('.avail-admin-bar');

    async function fetchState() {
      try {
        const r = await fetch('/api/calendar');
        const data = await r.json();
        occupied = new Set(data.occupied || []);
        isAdmin = readOnly ? false : !!data.isAdmin;
        adminUser = isAdmin ? (data.user || '') : '';
        details = isAdmin ? (data.details || {}) : {};
        history = isAdmin ? (data.history || []) : [];
        types = isAdmin ? (data.types || {}) : {};
      } catch (e) {
        occupied = new Set();
      }
    }

    function renderMonth() {
      monthLabel.textContent = `${MESES[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
      const prevBtn = root.querySelector('[data-nav="-1"]');
      const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      prevBtn.disabled = viewDate <= firstOfThisMonth;

      const year = viewDate.getFullYear(), month = viewDate.getMonth();
      const firstWeekday = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      let cells = '';
      for (let i = 0; i < firstWeekday; i++) cells += `<div class="avail-day is-empty"></div>`;
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const key = toKey(date);
        const isPast = date < today;
        const isBusy = occupied.has(key);
        const isToday = date.getTime() === today.getTime();
        const classes = ['avail-day'];
        if (isPast) classes.push('is-past');
        else classes.push(isBusy ? 'is-occupied' : 'is-available');
        if (isToday) classes.push('is-today');
        if (isAdmin && !isPast) classes.push('is-admin');
        if (selected === key) classes.push('is-selected');
        const det = isAdmin && isBusy ? details[key] : null;
        const tag = det ? `<small class="avail-tag">${esc(TIPOS_CORTO[det.type] || '')}</small>` : '';
        const title = det ? ` title="${esc((types[det.type] || det.type) + ' — ' + det.by)}"` : '';
        cells += `<div class="${classes.join(' ')}" data-date="${isPast ? '' : key}"${title}>${d}${tag}</div>`;
      }
      grid.innerHTML = cells;
    }

    function renderSelected() {
      if (!selected) { selectedSlot.innerHTML = ''; return; }
      const date = fromKey(selected);
      const isBusy = occupied.has(selected);

      if (isAdmin) {
        if (isBusy) {
          const det = details[selected];
          const info = det
            ? `<dl>
                <div><dt>Tipo</dt><dd>${esc(types[det.type] || det.type)}</dd></div>
                <div><dt>Cerrada por</dt><dd>${esc(det.by)}</dd></div>
                <div><dt>Registrada</dt><dd>${esc(fmtCuando(det.at))}</dd></div>
              </dl>`
            : `<p class="avail-panel-note">Sin registro: esta fecha se cerró antes de que existieran las cuentas del equipo.</p>`;
          selectedSlot.innerHTML = `
            <div class="avail-panel">
              <p class="avail-panel-title">Ocupada — <strong>${fmtLarga(date)}</strong></p>
              ${info}
              <button type="button" class="avail-btn avail-btn-light" data-release>Liberar fecha</button>
              <div class="avail-admin-msg" data-panel-msg></div>
            </div>`;
        } else {
          const opciones = Object.keys(types).map(k => `<option value="${esc(k)}">${esc(types[k])}</option>`).join('');
          selectedSlot.innerHTML = `
            <div class="avail-panel">
              <p class="avail-panel-title">Cerrar <strong>${fmtLarga(date)}</strong></p>
              <label class="avail-panel-label" for="avail-type">¿Para qué evento?</label>
              <select id="avail-type" data-type>
                <option value="" selected disabled>Elige el tipo de evento…</option>
                ${opciones}
              </select>
              <p class="avail-panel-note">Se registrará a nombre de <strong>${esc(adminUser)}</strong>.</p>
              <button type="button" class="avail-btn" data-close>Marcar como ocupada</button>
              <div class="avail-admin-msg" data-panel-msg></div>
            </div>`;
        }
        return;
      }

      if (isBusy) { selectedSlot.innerHTML = ''; return; }
      const msg = encodeURIComponent(`Hola! Quisiera consultar disponibilidad para el ${fmtLarga(date)}.`);
      selectedSlot.innerHTML = `
        <div class="avail-selected">
          <p>Fecha seleccionada<strong>${fmtLarga(date)}</strong></p>
          <a class="btn btn-gold" href="https://wa.me/${WA_NUMBER}?text=${msg}" target="_blank" rel="noopener">Consultar por WhatsApp →</a>
        </div>`;
    }

    function renderHistory() {
      if (!history.length) return '';
      const rows = history.map(h => {
        const f = h.date ? fmtLarga(fromKey(h.date)) : '';
        const t = h.type ? ` (${esc(types[h.type] || h.type)})` : '';
        return `<li><span>${esc(fmtCuando(h.at))}</span> ${esc(h.by)} ${esc(h.action)} el ${esc(f)}${t}</li>`;
      }).join('');
      return `<div class="avail-history"><p>Actividad reciente</p><ul>${rows}</ul></div>`;
    }

    function renderAdminBar() {
      if (readOnly) { adminBar.innerHTML = ''; return; }
      if (isAdmin) {
        adminBar.innerHTML = `
          <span class="avail-admin-active">Sesión de ${esc(adminUser)} — toca una fecha para cerrarla o ver sus datos</span>
          ${renderHistory()}
          <div style="margin-top:10px;"><button type="button" class="link" data-admin-logout>Cerrar sesión</button></div>`;
        return;
      }
      if (!adminFormOpen) {
        adminBar.innerHTML = `<button type="button" class="link" data-admin-open>Acceso del equipo</button>`;
        return;
      }
      adminBar.innerHTML = `
        <div class="avail-admin-form">
          <input type="text" placeholder="Usuario" data-admin-user autocomplete="username" autocapitalize="none" spellcheck="false">
          <input type="password" placeholder="Contraseña" data-admin-pass autocomplete="current-password">
          <button type="button" data-admin-submit>Entrar</button>
        </div>
        <div class="avail-admin-msg" data-admin-msg></div>`;
    }

    function render() {
      renderMonth();
      renderSelected();
      renderAdminBar();
    }

    function showPanelMsg(text, cls) {
      const el = root.querySelector('[data-panel-msg]');
      if (el) { el.textContent = text; el.className = 'avail-admin-msg ' + (cls || 'error'); }
    }

    async function post(url, body) {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let data = {};
      try { data = await r.json(); } catch (e) { /* respuesta sin cuerpo */ }
      return data;
    }

    root.addEventListener('click', async (e) => {
      const navBtn = e.target.closest('[data-nav]');
      if (navBtn) {
        const dir = Number(navBtn.dataset.nav);
        viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + dir, 1);
        selected = null;
        render();
        return;
      }

      const dayEl = e.target.closest('.avail-day[data-date]');
      if (dayEl && dayEl.dataset.date) {
        const key = dayEl.dataset.date;
        if (isAdmin) {
          selected = key;
          render();
        } else if (!occupied.has(key)) {
          selected = key;
          render();
        }
        return;
      }

      if (e.target.closest('[data-close]')) {
        const type = (root.querySelector('[data-type]') || {}).value;
        if (!type) { showPanelMsg('Elige el tipo de evento antes de marcar la fecha.'); return; }
        const data = await post('/api/admin/close', { date: selected, type });
        if (data.ok) {
          await fetchState();
          render();
        } else {
          showPanelMsg(data.error || 'No se pudo marcar la fecha.');
          if (data.error && /ocupada/i.test(data.error)) { await fetchState(); render(); }
        }
        return;
      }

      if (e.target.closest('[data-release]')) {
        const data = await post('/api/admin/release', { date: selected });
        if (data.ok) {
          selected = null;
          await fetchState();
          render();
        } else {
          showPanelMsg(data.error || 'No se pudo liberar la fecha.');
        }
        return;
      }

      if (e.target.closest('[data-admin-open]')) {
        adminFormOpen = true;
        render();
        return;
      }

      if (e.target.closest('[data-admin-submit]')) {
        const userInput = root.querySelector('[data-admin-user]');
        const passInput = root.querySelector('[data-admin-pass]');
        const msgEl = root.querySelector('[data-admin-msg]');
        const data = await post('/api/admin/login', { username: userInput.value, password: passInput.value });
        if (data.ok) {
          adminFormOpen = false;
          selected = null;
          await fetchState();
          render();
        } else if (msgEl) {
          msgEl.textContent = data.error || 'Error';
          msgEl.className = 'avail-admin-msg error';
        }
        return;
      }

      if (e.target.closest('[data-admin-logout]')) {
        await fetch('/api/admin/logout', { method: 'POST' });
        isAdmin = false;
        adminUser = '';
        details = {};
        history = [];
        selected = null;
        render();
        return;
      }
    });

    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('[data-admin-pass], [data-admin-user]')) {
        root.querySelector('[data-admin-submit]').click();
      }
    });

    fetchState().then(render);
  }

  window.initAvailabilityCalendar = initAvailabilityCalendar;
})();
