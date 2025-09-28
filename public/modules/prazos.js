// public/modules/prazos.js
window.Modules = window.Modules || {};
window.Modules.prazos = (() => {
  let pareceres = [];
  let remocao = [];
  let obras = [];
  let sobrestamento = [];
  let monitor = [];
  let doaga = [];
  let adhel = [];

const PARECERES_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup || "" },
    {
      key: 'type_label',
      label: 'Tipo',
      value: r => r.type_label || r.type || ''
    },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const REMOCAO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup || "" },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const OBRAS_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup || "" },
    {
      key: 'due_date',
      label: 'Prazo',
      value: r => Utils.fmtDate(r.due_date),
      render: r => {
        const prazo = Utils.fmtDate(r.due_date);
        if (!r.em_atraso) return `<div>${prazo}</div>`;
        return `<div>${prazo}</div><div class="text-danger">ADICIONAL</div>`;
      }
    },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const SOBRESTAMENTO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup || "" },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  const MONITOR_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup || "" },
    { key: 'type', label: 'Tipo' },
    { key: 'number', label: 'Número', value: r => (r.number ? String(r.number).padStart(6, '0') : '') }
  ];

  const DOAGA_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup || "" },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  const ADHEL_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup || "" },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : '') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  function normalize(rows) {
    return (rows || []).map(r => ({
      ...r,
      days_remaining:
        typeof r.days_remaining === 'number'
          ? r.days_remaining
          : (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : null)
    }));
  }

  function renderTable(el, columns, rows, opts = {}) {
    const root = document.querySelector(el);
    if (!root) return;
    root.innerHTML = '';

    const table = document.createElement('div');
    table.className = 'tbl';

    rows.forEach(r => {
      const line = document.createElement('div');
      line.className = 'tr';
      columns.forEach(col => {
        const cell = document.createElement('div');
        cell.className = 'td';
        let value = (typeof col.value === 'function') ? col.value(r) : r[col.key];
        if (col.render) {
          cell.innerHTML = col.render(r);
        } else {
          cell.textContent = (value == null ? '' : value);
        }
        if (col.label === '') cell.classList.add('td-right');
        line.appendChild(cell);
      });
      table.appendChild(line);
    });

    root.appendChild(table);

    if (opts.limit && rows.length > opts.limit) {
      const more = document.createElement('div');
      more.className = 'muted';
      more.textContent = `+${rows.length - opts.limit} itens`;
      root.appendChild(more);
    }
  }

  function bindPdfButtons() {
    const pdfButtons = document.querySelectorAll('[data-pdf]');
    pdfButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-pdf');
        switch (target) {
          case 'pareceres': exportPdfPareceres(); break;
          case 'obras': exportPdfObras(); break;
          case 'sobrestamento': exportPdfSobrestamento(); break;
          case 'doaga': exportPdfDOAGA(); break;
          case 'revogar': exportPdfRevogarPlano(); break;
          default: break;
        }
      });
    });
  }

  function renderPareceres() {
    const limit = 8;
    renderTable('#pareceres .tbl-wrap', PARECERES_COLUMNS, pareceres.slice(0, limit), { limit });
  }

  function renderRemocao() {
    const limit = 8;
    renderTable('#remocao .tbl-wrap', REMOCAO_COLUMNS, remocao.slice(0, limit), { limit });
  }

  function renderObras() {
    const limit = 8;
    renderTable('#obras .tbl-wrap', OBRAS_COLUMNS, obras.slice(0, limit), { limit });
  }

  function renderSobrestamento() {
    const limit = 8;
    renderTable('#sobrestamento .tbl-wrap', SOBRESTAMENTO_COLUMNS, sobrestamento.slice(0, limit), { limit });
  }

  function renderMonitor() {
    const limit = 8;
    renderTable('#monitor .tbl-wrap', MONITOR_COLUMNS, monitor.slice(0, limit), { limit });
  }

  function renderDOAGA() {
    const limit = 10;
    renderTable('#doaga .tbl-wrap', DOAGA_COLUMNS, doaga.slice(0, limit), { limit });
  }

  function renderADHEL() {
    const limit = 6;
    renderTable('#adhel .tbl-wrap', ADHEL_COLUMNS, adhel.slice(0, limit), { limit });
  }

  async function loadPareceres() {
    const sb = window.supabaseClient;

    // Pareceres (v_prazo_pareceres)
    const res = await sb.from('v_prazo_pareceres')
      .select('nup,type,due_date,days_remaining')
      .order('due_date', { ascending: true });

    // SIGADAER (v_prazo_sigadaer_ext)
    const extRes = await sb.from('v_prazo_sigadaer_ext')
      .select('nup,type,due_date,deadline_days,days_remaining');

    const normalizeType = t => (t || '').toUpperCase().trim();
    const preferidos = ['OPR_AD', 'PREF']; // tipos preferenciais para box "Pareceres/Info"

    const parecerRows = normalize(res.data)
      .filter(row => preferidos.includes(normalizeType(row.type)))
      .map(row => ({
        ...row,
        origin: 'parecer',
        type_label: `Parecer ${row.type}`
      }));

    const sigadaerRows = normalize(extRes.data)
      .filter(row => row.due_date || typeof row.deadline_days === 'number')
      .map(row => ({
        ...row,
        origin: 'sigadaer',
        type_label: `SIGADAER ${row.type}`,
        days_remaining:
          typeof row.days_remaining === 'number'
            ? row.days_remaining
            : Utils.daysBetween(new Date(), row.due_date)
      }));

    pareceres = [...parecerRows, ...sigadaerRows]
      .filter(r => r.type_label && r.nup)
      .sort((a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31'));

    renderPareceres();
  }

  async function loadRemocao() {
    const sb = window.supabaseClient;
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('nup,due_date,days_remaining')
      .order('due_date', { ascending: true });

    remocao = normalize(data).sort(
      (a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderRemocao();
  }

  async function loadObra() {
    const sb = window.supabaseClient;
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,due_date,days_remaining,em_atraso')
      .order('due_date', { ascending: true });

    obras = normalize(data).sort(
      (a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderObras();
  }

  async function loadSobrestamento() {
    const sb = window.supabaseClient;
    const { data } = await sb.from('v_prazo_sobrestamento')
      .select('nup,due_date,days_remaining')
      .order('due_date', { ascending: true });

    sobrestamento = normalize(data).sort(
      (a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderSobrestamento();
  }

  async function loadMonitor() {
    const sb = window.supabaseClient;
    const { data } = await sb.from('v_prazo_monitor')
      .select('nup,type,number')
      .order('type', { ascending: true })
      .order('number', { ascending: true });

    monitor = (data || []).sort((a, b) => String(a.type).localeCompare(String(b.type)));
    renderMonitor();
  }

  async function loadDOAGA() {
    const sb = window.supabaseClient;
    const { data } = await sb.from('v_prazo_doaga')
      .select('nup,due_date,days_remaining')
      .order('due_date', { ascending: true });

    doaga = normalize(data).sort(
      (a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderDOAGA();
  }

  async function loadADHEL() {
    const { data } = await sb.from('v_prazo_ad_hel')
      .select('nup,due_date,days_remaining');
    adhel = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderADHEL();
  }

  function init() {
    bindPdfButtons();
  }

  // --- Exportações PDF (mantidas, exibem NUP exatamente como no banco) ---
  function exportPdfPareceres() { exportSection('Pareceres/Info', PARECERES_COLUMNS, pareceres); }
  function exportPdfObras()      { exportSection('Término de Obra', OBRAS_COLUMNS, obras); }
  function exportPdfSobrestamento() { exportSection('Sobrestamento', SOBRESTAMENTO_COLUMNS, sobrestamento); }
  function exportPdfDOAGA()      { exportSection('Prazo DO-AGA', DOAGA_COLUMNS, doaga); }
  function exportPdfRevogarPlano() {
    const cols = [
      { key: 'nup', label: 'NUP', value: r => r.nup || "" },
      { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : '') },
      { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
    ];
    const rows = (doaga || []).slice(0, 10);
    exportSection('Revogar plano', cols, rows);
  }

  function exportSection(title, columns, rows) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const lineHeight = 16;
    const margin = 40;

    let cursorY = margin;

    function addText(text, x = margin, y = cursorY) {
      doc.text(String(text ?? ''), x, y);
      cursorY += lineHeight;
    }
    function addGap(px) { cursorY += px; }

    doc.setFont('helvetica', 'bold');
    addText(title);
    doc.setFont('helvetica', 'normal');
    addGap(8);

    rows.forEach(r => {
      const line = columns
        .map(col => {
          const label = col.label;
          const value = (typeof col.value === 'function') ? col.value(r) : r[col.key];
          if (value == null || value === '') return '';
          return label ? `${label}: ${value}` : String(value);
        })
        .filter(Boolean)
        .join('  |  ');
      addText(line);
    });

    const url = doc.output('bloburl');
    const win = window.open(url, '_blank');
    if (win) win.opener = null;
  }

  async function load() {
    await Promise.all([
      loadPareceres(),
      loadRemocao(),
      loadObra(),
      loadSobrestamento(),
      loadMonitor(),
      loadDOAGA(),
      loadADHEL()
    ]);
  }

  return { init, load };
})();
