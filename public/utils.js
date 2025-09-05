// public/utils.js
// Utilitários simples e genéricos

window.$ = (sel, root = document) => root.querySelector(sel);
window.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
window.el = (id) => document.getElementById(id);

function show(elem) {
  (typeof elem === 'string' ? el(elem) : elem)?.classList.remove('hidden');
}
function hide(elem) {
  (typeof elem === 'string' ? el(elem) : elem)?.classList.add('hidden');
}
function setText(id, txt) {
  const e = el(id); if (e) e.textContent = txt ?? '';
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
  if (v instanceof Date) {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const x = new Date(v);
  if (Number.isNaN(+x)) return null;
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

function fmtDate(d) {
  const x = dateOnly(d);
  if (!x) return '';
  const y = x.getFullYear();
  const m = String(x.getMonth()+1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
}
function fmtDateTime(d) {
  if (!d) return '';
  const x = (d instanceof Date) ? d : new Date(d);
  if (Number.isNaN(+x)) return '';
  const hh = String(x.getHours()).padStart(2, '0');
  const mm = String(x.getMinutes()).padStart(2, '0');
  return `${fmtDate(x)} ${hh}:${mm}`;
}
function toDateInputValue(date) {
  const x = (date instanceof Date) ? date : new Date(date);
  if (Number.isNaN(+x)) return '';
  const y = x.getFullYear();
  const m = String(x.getMonth()+1).padStart(2, '0');
  const d = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function toDateTimeLocalValue(date) {
  const x = (date instanceof Date) ? date : new Date(date);
  if (Number.isNaN(+x)) return '';
  const y = x.getFullYear();
  const m = String(x.getMonth()+1).padStart(2, '0');
  const d = String(x.getDate()).padStart(2, '0');
  const hh = String(x.getHours()).padStart(2, '0');
  const mm = String(x.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}
function daysBetween(a, b = new Date()) {
  const d1 = dateOnly(a), d2 = dateOnly(b);
  if (!d1 || !d2) return '';
  return Math.round((d2 - d1) / (24*3600*1000));
}

function yesNo(v) { return v ? 'Sim' : 'Não'; }

function renderTable(containerOrId, columns, rows) {
  const box = typeof containerOrId === 'string' ? el(containerOrId) : containerOrId;
  if (!box) return;
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  columns.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c.label;
    if (c.width) th.style.width = c.width;
    if (c.align) th.style.textAlign = c.align;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (!rows?.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = columns.length;
    td.textContent = '— sem dados —';
    td.style.textAlign = 'center';
    td.style.color = 'var(--ink-soft)';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.dataset.row = JSON.stringify(r);
      columns.forEach(c => {
        const td = document.createElement('td');
        let v = typeof c.value === 'function' ? c.value(r) : (c.key ? r[c.key] : undefined);
        if (c.render) {
          const out = c.render(r);
          if (out instanceof Node) td.appendChild(out);
          else if (out != null) td.innerHTML = out;
        } else {
          td.textContent = v ?? '';
        }
        if (c.align) td.style.textAlign = c.align;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }
  table.appendChild(tbody);
  box.innerHTML = '';
  box.appendChild(table);
  return { table, tbody };
}

async function callFn(name, { method = 'GET', body, headers } = {}) {
  const base = (window.APP_CONFIG && window.APP_CONFIG.NETLIFY_FUNCTIONS_BASE) || '/.netlify/functions';
  const url = `${base}/${name}`;
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const txt = await res.text();
    try { return { ok: res.ok, status: res.status, data: JSON.parse(txt) }; }
    catch { return { ok: res.ok, status: res.status, data: txt }; }
  } catch (e) {
    return { ok: false, status: 0, data: String(e) };
  }
}

// Velocímetros do Dashboard
function renderVelocimetros(containerId, items) {
  const box = el(containerId);
  if (!box) return;
  box.innerHTML = '';
  const max = Math.max(...items.map(it => it.count || 0), 1);
  items.forEach(it => {
    const pct = (it.count || 0) / max;
    const angle = -90 + pct * 180; // -90 a 90 graus
    const d = document.createElement('div');
    d.className = 'velocimetro';
    if (!it.count) d.classList.add('empty');
    d.innerHTML = `
      <div class="velocimetro-dial"></div>
      <div class="velocimetro-needle" style="transform: rotate(${angle}deg)"></div>
      <div class="velocimetro-content"><strong style="font-size:22px">${it.count ?? 0}</strong><br><small>${it.label}</small></div>
    `;
    box.appendChild(d);
  });
}

function renderProcessRings(containerId, items) {
  const box = el(containerId);
  if (!box) return;
  box.innerHTML = '';
  items.forEach(it => {
    window.Components?.ProcessRing?.create(box, {
      nup: it.status,
      status: `${it.count} proc.`,
      speed: it.avg,
      min: 0,
      max: 30
    });
  });
}

function fmtNUP(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 17);
  const p1 = d.slice(0, 5);
  const p2 = d.slice(5, 11);
  const p3 = d.slice(11, 15);
  const p4 = d.slice(15, 17);
  let out = p1;
  if (p2) out += '.' + p2;
  if (p3) out += '/' + p3;
  if (p4) out += '-' + p4;
  return out;
}

function bindNUPMask(id) {
  const input = el(id);
  if (!input) return;
  input.setAttribute('pattern', '^[0-9]{5}\\.[0-9]{6}/[0-9]{4}-[0-9]{2}$');
  input.addEventListener('input', () => {
    input.value = fmtNUP(input.value);
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

window.Utils = {
  show, hide, setText, setMsg, fmtDate, fmtDateTime, toDateInputValue,
  toDateTimeLocalValue, daysBetween, yesNo, renderTable, callFn, renderVelocimetros, renderProcessRings,
  fmtNUP, bindNUPMask
};
