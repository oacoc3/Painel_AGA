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
    { key: 'nup', label: 'NUP', value: r => r.nup },
    {
      key: 'type_label',
      label: 'Tipo',
      value: r => r.type_label || r.type || ''
    },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const REMOCAO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const OBRAS_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
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
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  const MONITOR_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'type', label: 'Tipo' },
    { key: 'number', label: 'Número', value: r => (r.number ? String(r.number).padStart(6, '0') : '') }
  ];

  const DOAGA_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  const ADHEL_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : '') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  function bindRowLinks(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      try {
        const data = JSON.parse(tr.dataset.row);
        if (!data?.nup) return;
        tr.addEventListener('click', () => {
          sessionStorage.setItem('procPreSelect', data.nup);
          window.location.href = 'processos.html';
        });
      } catch {}
    });
  }

  function renderPareceres() {
    const rows = pareceres.slice(0, 8);
    const { tbody } = Utils.renderTable('pareceres', PARECERES_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  function renderRemocao() {
    const rows = remocao.slice(0, 8);
    const { tbody } = Utils.renderTable('remocao', REMOCAO_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  function renderObras() {
    const rows = obras.slice(0, 8);
    const { tbody } = Utils.renderTable('obras', OBRAS_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  function renderSobrestamento() {
    const rows = sobrestamento.slice(0, 8);
    const { tbody } = Utils.renderTable('sobrestamento', SOBRESTAMENTO_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  function renderMonitor() {
    const rows = monitor.slice(0, 8);
    const { tbody } = Utils.renderTable('monitor', MONITOR_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  function getDoagaRows() {
    return doaga;
  }

  function renderDOAGA() {
    const rows = getDoagaRows();
    const { tbody } = Utils.renderTable('prazoDOAGA', DOAGA_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  // >>> FALTAVA ESTA FUNÇÃO <<<
  function renderADHEL() {
    const rows = adhel.slice(0, 6);
    const { tbody } = Utils.renderTable('adhel', ADHEL_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadPareceres() {
    const { data } = await sb.from('v_prazo_pareceres')
      .select('nup,type,due_date,days_remaining')
      .order('due_date', { ascending: true });

    const { data: sigData } = await sb.from('v_prazo_sigadaer_ext')
      .select('nup,type,due_date,deadline_days,days_remaining');

    const normalizeType = t => (t || '').toUpperCase().trim();
    const preferidos = ['OPR_AD', 'PREF'];

    const parecerRows = (data || [])
      .filter(row => preferidos.includes(normalizeType(row.type)))
      .map(row => ({
        ...row,
        origin: 'parecer',
        type_label: `Parecer ${row.type}`
      }));

    const sigadaerRows = (sigData || [])
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
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('nup,due_date,days_remaining')
      .order('due_date', { ascending: true });

    remocao = (data || []).sort(
      (a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderRemocao();
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,due_date,days_remaining,em_atraso')
      .order('due_date', { ascending: true });

    obras = (data || []).sort(
      (a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderObras();
  }

  async function loadSobrestamento() {
    const { data } = await sb.from('v_prazo_sobrestamento')
      .select('nup,due_date,days_remaining')
      .order('due_date', { ascending: true });

    sobrestamento = (data || []).sort(
      (a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderSobrestamento();
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup,type,number');
    monitor = data || [];
    renderMonitor();
  }

  async function loadDOAGA() {
    const { data } = await sb.from('v_prazo_do_aga')
      .select('nup,due_date,days_remaining');
    doaga = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
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

  function exportPrazoPDF(section) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const lineHeight = 16;
    const margin = 40;

    const sections = {
      pareceres: { title: 'Pareceres/Info', cols: PARECERES_COLUMNS, rows: pareceres.slice(0, 8) },
      obras: { title: 'Término de Obra', cols: OBRAS_COLUMNS, rows: obras.slice(0, 8) },
      sobrestamento: { title: 'Sobrestamento', cols: SOBRESTAMENTO_COLUMNS, rows: sobrestamento.slice(0, 8) },
      doaga: { title: 'Prazo DO-AGA', cols: DOAGA_COLUMNS, rows: getDoagaRows().slice(0, 10) },
      revogar: { title: 'Revogar plano', cols: DOAGA_COLUMNS, rows: getDoagaRows().slice(0, 10) },
      adhel: { title: 'Leitura/Expedição', cols: ADHEL_COLUMNS, rows: adhel.slice(0, 6) },
      monitor: { title: 'Monitorar Tramitação', cols: MONITOR_COLUMNS, rows: monitor.slice(0, 8) }
    };

    const cfg = sections[section];
    if (!cfg) return;

    let cursorY = margin;

    function addParagraph(text) {
      doc.text(String(text ?? ''), margin, cursorY);
    }
    function addGap(px) { cursorY += px; }

    doc.setFont('helvetica', 'bold');
    addParagraph(cfg.title);
    doc.setFont('helvetica', 'normal');
    addGap(8);

    cfg.rows.forEach(r => {
      const line = cfg.cols
        .map(col => {
          const label = col.label;
          const value = (typeof col.value === 'function') ? col.value(r) : r[col.key];
          if (value == null || value === '') return '';
          return label ? `${label}: ${value}` : String(value);
        })
        .filter(Boolean)
        .join('  |  ');
      addParagraph(line);
      addGap(lineHeight / 2);
    });

    const url = doc.output('bloburl');
    const win = window.open(url, '_blank');
    if (win) win.opener = null;
  }

  function bindPdfButtons() {
    document.querySelectorAll('[data-pdf]').forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.getAttribute('data-pdf');
        exportPrazoPDF(section);
      });
    });
  }

  function init() {
    bindPdfButtons();
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
