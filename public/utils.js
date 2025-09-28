// public/utils.js
(function() {
  function el(id) { return document.getElementById(id); }
  function $$ (sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }

  function setText(id, txt) {
    const e = el(id);
    if (e) e.textContent = txt || '';
  }

  function setMsg(id, txt, isError = false) {
    const e = el(id);
    if (!e) return;
    e.textContent = txt || '';
    e.classList.toggle('error', !!isError);
  }

  function fmtDate(x) {
    if (!x) return '';
    try {
      if (typeof x === 'string') {
        const d = new Date(x);
        if (!Number.isNaN(d.getTime())) x = d;
      }
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      }).format(x);
    } catch (_) {
      return '';
    }
  }

  function fmtDateTime(x) {
    if (!x) return '';
    try {
      if (typeof x === 'string') {
        const d = new Date(x);
        if (!Number.isNaN(d.getTime())) x = d;
      }
      const dt = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      }).format(x);
      const tm = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit'
      }).format(x);
      return `${dt} ${tm}`;
    } catch (_) {
      return '';
    }
  }

  function toDateInputValue(d) {
    if (!d) return '';
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
    return x.toISOString().slice(0, 10);
  }

  function toDateTimeLocalValue(d) {
    if (!d) return '';
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return '';
    x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
    return x.toISOString().slice(0, 16);
  }

  function daysBetween(a, b) {
    if (!a || !b) return '';
    const da = new Date(a);
    const db = new Date(b);
    if (Number.isNaN(da) || Number.isNaN(db)) return '';
    const ms = Math.abs(db - da);
    return Math.floor(ms / (24 * 3600 * 1000));
  }

  function renderTable(container, { headers = [], rows = [] } = {}) {
    if (!container) return null;
    container.innerHTML = '';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    const trh = document.createElement('tr');
    headers.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);

    rows.forEach(r => {
      const tr = document.createElement('tr');
      r.forEach(c => {
        const td = document.createElement('td');
        if (c && typeof c === 'object' && ('text' in c || 'html' in c)) {
          if ('html' in c) td.innerHTML = c.html;
          else td.textContent = c.text || '';
          if (c.className) td.className = c.className;
          if (c.title) td.title = c.title;
        } else {
          td.textContent = c == null ? '' : String(c);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    container.appendChild(table);
    return { thead, tbody, table };
  }

  async function callFn(name, payload) {
    const res = await fetch(`/.netlify/functions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    try {
      return await res.json();
    } catch (_) {
      return { ok: false, error: 'Resposta inválida do servidor' };
    }
  }

  // Máscara NUP no padrão SEI: 00000.000000/0000-00
  function bindNUPMask(id) {
    const input = typeof id === 'string' ? el(id) : id;
    if (!input) return;
    input.addEventListener('input', () => {
      const d = input.value.replace(/\D/g, '').slice(0, 17);
      let v = d.slice(0, 5);
      if (d.length > 5) v += '.' + d.slice(5, 11);
      if (d.length > 11) v += '/' + d.slice(11, 15);
      if (d.length > 15) v += '-' + d.slice(15, 17);
      input.value = v;
    });
  }

  // Máscara no formato do banco: XXXXXX/XXXX-XX (6+4+2 dígitos)
  function bindNUPBankMask(id) {
    const input = typeof id === 'string' ? el(id) : id;
    if (!input) return;
    input.addEventListener('input', () => {
      const d = input.value.replace(/\D/g, '').slice(0, 12);
      let v = d.slice(0, 6);
      if (d.length > 6) v += '/' + d.slice(6, 10);
      if (d.length > 10) v += '-' + d.slice(10, 12);
      input.value = v;
    });
  }

  // Novas utilitárias para barras de processo
  function band(value, min, max) {
    const t = (value - min) / Math.max(1e-6, (max - min));
    if (t <= 1 / 3) return 'ok';
    if (t <= 2 / 3) return 'warn';
    return 'bad';
  }

  function renderProcess(container, bars = []) {
    if (!container) return;
    container.innerHTML = '';
    bars.forEach(b => {
      const bar = document.createElement('div');
      bar.className = `pbar ${band(b.value, b.min, b.max)}`;
      const header = document.createElement('div');
      header.className = 'pbar-h';
      header.textContent = b.label || '';
      const track = document.createElement('div');
      track.className = 'pbar-t';
      const fill = document.createElement('div');
      fill.className = 'pbar-f';
      const pct = Math.max(0, Math.min(100, (b.value - b.min) / Math.max(1e-6, (b.max - b.min)) * 100));
      fill.style.width = `${pct}%`;
      if (b.value == null) {
        fill.classList.add('no-data');
      }
      track.appendChild(fill);
      bar.appendChild(header);
      bar.appendChild(track);
      container.appendChild(bar);
    });
  }

  window.el = el;
  window.$$ = $$;
  window.Utils = {
    setText,
    setMsg,
    fmtDate,
    fmtDateTime,
    toDateInputValue,
    toDateTimeLocalValue,
    daysBetween,
    renderTable,
    callFn,
    bindNUPMask,
    bindNUPBankMask,
    renderProcess
  };
})();

// public/safety-guards.js (importado ao final)
(function() {
  const ACCESS_DENIED_MESSAGE = 'Seu perfil não possui permissão para executar esta ação.';
  function currentUserRole() {
    try {
      const raw = localStorage.getItem('profile');
      if (!raw) return '';
      const p = JSON.parse(raw);
      return p.role || '';
    } catch (_) { return ''; }
  }
  function canRoleWrite(moduleKey) {
    const role = currentUserRole();
    if (!role) return false;
    switch (moduleKey) {
      case 'admin': return role === 'Administrador';
      default: return role !== 'Visitante';
    }
  }
  function ensureWrite(moduleKey, options = {}) {
    if (canRoleWrite(moduleKey)) return true;
    if (options.silent) return false;

    const message = options.message || ACCESS_DENIED_MESSAGE;
    const targetId = options.msgId || options.messageId;
    if (targetId) {
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        setMsg(targetId, message, true);
      }
    }
    if (typeof options.onMessage === 'function') {
      try {
        options.onMessage(message);
      } catch (_) {
        // ignore
      }
    }
    try {
      window.alert(message);
    } catch (_) { /* ignore */ }
    return false;
  }

  window.AccessGuards = {
    message: ACCESS_DENIED_MESSAGE,
    getRole: currentUserRole,
    canWrite: canRoleWrite,
    ensureWrite
  };
})();
