<script>
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

function fmtDate(d) {
  if (!d) return '';
  const x = (d instanceof Date) ? d : new Date(d);
  if (Number.isNaN(+x)) return '';
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
  const d1 = new Date(a), d2 = new Date(b);
  if (Number.isNaN(+d1) || Number.isNaN(+d2)) return '';
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
        const v = typeof c.value === 'function' ? c.value(r) : r[c.key];
        td.textContent = v ?? '';
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
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers||{}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const txt = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(txt) }; }
  catch { return { ok: res.ok, status: res.status, data: txt }; }
}

// Rings do Dashboard
function renderRings(containerId, items) {
  const box = el(containerId);
  if (!box) return;
  box.innerHTML = '';
  items.forEach(it => {
    const d = document.createElement('div');
    d.className = 'ring';
    d.innerHTML = `<div><strong style="font-size:22px">${it.count ?? 0}</strong><br><small>${it.label}</small></div>`;
    box.appendChild(d);
  });
}

window.Utils = {
  show, hide, setText, setMsg, fmtDate, fmtDateTime, toDateInputValue,
  toDateTimeLocalValue, daysBetween, yesNo, renderTable, callFn, renderRings
};
</script>
