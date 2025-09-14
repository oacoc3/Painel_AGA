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

  // Normaliza valor para “apenas data” (00:00:00 local)
  function dateOnly(v) {
    if (!v) return null;
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const x = new Date(v);
    if (Number.isNaN(+x)) return null;
    return new Date(x.getFullYear(), x.getMonth(), x.getDate());
  }

  function fmtDate(d) {
    if (!d) return '';
    let x;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      x = dateOnly(d);
    } else {
      x = (d instanceof Date) ? d : new Date(d);
    }
    if (!x || Number.isNaN(+x)) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(x);
  }

  function fmtDateTime(d) {
    if (!d) return '';
    let x;
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      x = dateOnly(d);
    } else {
      x = (d instanceof Date) ? d : new Date(d);
    }
    if (!x || Number.isNaN(+x)) return '';
    const dt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(x);
    const tm = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit'
    }).format(x);
    return `${dt} ${tm}`;
  }

  function toDateInputValue(date) {
    if (!date) return '';
    let x;
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      x = dateOnly(date);
    } else {
      x = (date instanceof Date) ? date : new Date(date);
    }
    if (!x || Number.isNaN(+x)) return '';
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const d = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function toDateTimeLocalValue(date) {
    if (!date) return '';
    let x;
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      x = dateOnly(date);
    } else {
      x = (date instanceof Date) ? date : new Date(date);
    }
    if (!x || Number.isNaN(+x)) return '';
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const d = String(x.getDate()).padStart(2, '0');
    const hh = String(x.getHours()).padStart(2, '0');
    const mm = String(x.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${hh}:${mm}`;
  }

  function daysBetween(a, b = new Date()) {
    const d1 = dateOnly(a), d2 = dateOnly(b);
    if (!d1 || !d2) return '';
    return Math.round((d2 - d1) / (24 * 3600 * 1000));
  }

  // PATCH: agora aceita um contêiner (div/section/etc.) OU uma <table>.
  // Se for contêiner, cria a <table> internamente com <thead> e <tbody>.
  // Retorna { thead, tbody, table }.
  function renderTable(target, cols, rows = []) {
    const box = typeof target === 'string' ? el(target) : target;
    if (!box) return {};

    let table = box;
    if (table.tagName !== 'TABLE') {
      box.innerHTML = '';
      table = document.createElement('table');
      box.appendChild(table);
    }

    let thead = table.querySelector('thead');
    if (!thead) {
      thead = document.createElement('thead');
      table.appendChild(thead);
    }
    let tbody = table.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      table.appendChild(tbody);
    }

    // Cabeçalho
    thead.innerHTML = '';
    const trh = document.createElement('tr');
    cols.forEach(c => {
      const th = document.createElement('th');
      if (c.align) th.className = `align-${c.align}`;
      th.textContent = c.label;
      trh.appendChild(th);
    });
    thead.appendChild(trh);

    // Corpo
    tbody.innerHTML = '';
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.dataset.row = JSON.stringify(r);
      cols.forEach(c => {
        const td = document.createElement('td');
        if (c.align) td.className = `align-${c.align}`;
        if (typeof c.render === 'function') {
          const val = c.render(r);
          if (val instanceof Node) td.appendChild(val);
          else td.innerHTML = val;
        } else {
          let val = r[c.key];
          if (typeof c.value === 'function') val = c.value(r);
          if (val == null) val = '';
          td.textContent = val;
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
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
      return { error: { message: 'Resposta inválida' } };
    }
  }

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

  function renderProcessRings(id, items) {
    const container = el(id);
    if (!container) return;
    container.innerHTML = '';

    const max = Math.max(30, ...items.map(it => it.avg || 0));
    items.forEach(it => {
      window.AppComponents.ProcessRing.create(container, {
        nup: String(it.count ?? ''),
        status: it.status,
        speed: it.avg ?? 0,
        min: 0,
        max,
        sizeClass: 'sm',
        ariaLabel: `Velocidade média de ${it.status}`
      });
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
    renderProcessRings,
    dateOnly
  };
})();
