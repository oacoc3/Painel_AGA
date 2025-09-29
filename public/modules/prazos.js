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

  function getPareceresRows() {
    return pareceres;
  }

  function renderPareceres() {
    const rows = getPareceresRows();
    const { tbody } = Utils.renderTable('prazoParec', PARECERES_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadPareceres() {
    const [intRes, extRes] = await Promise.all([
      sb
        .from('v_prazo_pareceres')
        .select('nup,type,due_date,days_remaining,deadline_days'),
      sb
        .from('v_prazo_pareceres_externos')
        .select('nup,type,due_date,days_remaining,deadline_days')
    ]);

    const normalize = rows => (Array.isArray(rows) ? rows : []);

    const parecerRows = normalize(intRes.data)
      .filter(row => ['ATM', 'DT', 'CGNA'].includes(row.type))
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
      .filter(row => row.due_date)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderPareceres();
  }

  function getRemocaoRows() {
    return remocao;
  }

  function renderRemocao() {
    const rows = getRemocaoRows();
    const { tbody } = Utils.renderTable('prazoRemocao', REMOCAO_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('nup,due_date,days_remaining');
    remocao = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderRemocao();
  }

  function getObraRows() {
    return obras;
  }

  function renderObra() {
    const rows = getObraRows();
    const { tbody } = Utils.renderTable('prazoObra', OBRAS_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,due_date,days_remaining,em_atraso');
    obras = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderObra();
  }

  function getSobrestamentoRows() {
    return sobrestamento;
  }

  function renderSobrestamento() {
    const rows = getSobrestamentoRows();
    const { tbody } = Utils.renderTable('prazoSobrestamento', SOBRESTAMENTO_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadSobrestamento() {
    const { data } = await sb.from('v_prazo_sobrestamento')
      .select('nup,due_date,days_remaining');
    sobrestamento = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderSobrestamento();
  }

  function getMonitorRows() {
    return monitor;
  }

  function renderMonitor() {
    const rows = getMonitorRows();
    const { tbody } = Utils.renderTable('prazoMonit', MONITOR_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup,type,number');
    monitor = data || [];
    renderMonitor();
  }

  function getDoagaRows() {
    return doaga;
  }

  function renderDOAGA() {
    const rows = getDoagaRows();
    const { tbody } = Utils.renderTable('prazoDOAGA', DOAGA_COLUMNS, rows);
    bindRowLinks(tbody);
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

  function getAdhelRows() {
    return adhel;
  }

  function renderADHEL() {
    const rows = getAdhelRows();
    const { tbody } = Utils.renderTable('prazoADHEL', ADHEL_COLUMNS, rows);
    bindRowLinks(tbody);
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

  

  

  function init() {}

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
