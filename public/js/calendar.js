(function () {
  const WA_NUMBER = '51904956522';
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const DIAS = ['D','L','M','X','J','V','S'];

  function pad(n) { return String(n).padStart(2, '0'); }
  function toKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function fmtLarga(d) { return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; }
  function startOfToday() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }

  function initAvailabilityCalendar(selector, opts) {
    opts = opts || {};
    const root = document.querySelector(selector);
    if (!root) return;

    const readOnly = !!opts.readOnly;

    const today = startOfToday();
    let viewDate = new Date(today.getFullYear(), today.getMonth(), 1);
    let occupied = new Set();
    let isAdmin = false;
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
        cells += `<div class="${classes.join(' ')}" data-date="${isPast ? '' : key}">${d}</div>`;
      }
      grid.innerHTML = cells;
    }

    function renderSelected() {
      if (!selected) { selectedSlot.innerHTML = ''; return; }
      const [y, m, d] = selected.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const isBusy = occupied.has(selected);
      if (isAdmin) { selectedSlot.innerHTML = ''; return; }
      if (isBusy) { selectedSlot.innerHTML = ''; return; }
      const msg = encodeURIComponent(`Hola! Quisiera consultar disponibilidad para el ${fmtLarga(date)}.`);
      selectedSlot.innerHTML = `
        <div class="avail-selected">
          <p>Fecha seleccionada<strong>${fmtLarga(date)}</strong></p>
          <a class="btn btn-gold" href="https://wa.me/${WA_NUMBER}?text=${msg}" target="_blank" rel="noopener">Consultar por WhatsApp →</a>
        </div>`;
    }

    function renderAdminBar() {
      if (readOnly) { adminBar.innerHTML = ''; return; }
      if (isAdmin) {
        adminBar.innerHTML = `
          <span class="avail-admin-active">Modo administrador — toca una fecha para marcarla</span>
          <div style="margin-top:10px;"><button type="button" class="link" data-admin-logout>Cerrar sesión</button></div>`;
        return;
      }
      if (!adminFormOpen) {
        adminBar.innerHTML = `<button type="button" class="link" data-admin-open>Acceso administrador</button>`;
        return;
      }
      adminBar.innerHTML = `
        <div class="avail-admin-form">
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
          const r = await fetch('/api/admin/toggle', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: key }),
          });
          const data = await r.json();
          if (data.ok) {
            if (data.occupied) occupied.add(key); else occupied.delete(key);
            render();
          }
        } else if (!occupied.has(key)) {
          selected = key;
          render();
        }
        return;
      }

      if (e.target.closest('[data-admin-open]')) {
        adminFormOpen = true;
        render();
        return;
      }

      if (e.target.closest('[data-admin-submit]')) {
        const input = root.querySelector('[data-admin-pass]');
        const msgEl = root.querySelector('[data-admin-msg]');
        const r = await fetch('/api/admin/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: input.value }),
        });
        const data = await r.json();
        if (data.ok) {
          isAdmin = true;
          adminFormOpen = false;
          selected = null;
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
        render();
        return;
      }
    });

    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('[data-admin-pass]')) {
        root.querySelector('[data-admin-submit]').click();
      }
    });

    fetchState().then(render);
  }

  window.initAvailabilityCalendar = initAvailabilityCalendar;
})();
