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

  let validationState = new Map();
  let processIdByNup = new Map();

  const ValidationFlags = window.Modules.validationFlags || null;

  function resolveProcessId(row) {
    if (!row) return null;
    if (row.process_id) return row.process_id;
    const id = processIdByNup.get(row.nup);
    if (id) row.process_id = id;
    return row.process_id || null;
  }

  function renderNupCell(cardType) {
    return (row) => {
      const procId = resolveProcessId(row);
      const hasFlag = cardType && ValidationFlags?.hasActive(validationState, procId, cardType);
      const badge = hasFlag ? '<div class="validar-flag"><span class="badge badge-validar">VALIDAR</span></div>' : '';
      return `<div>${row.nup || ''}${badge}</div>`;
    };
  }

  const PARECERES_COLUMNS = [
    { key: 'nup', label: 'NUP', render: renderNupCell('pareceres') },
    {
      key: 'type_label',
      label: 'Tipo',
      value: r => r.type_label || r.type || ''
    },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const REMOCAO_COLUMNS = [
    { key: 'nup', label: 'NUP', render: renderNupCell('remocao') },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const OBRAS_COLUMNS = [
    { key: 'nup', label: 'NUP', render: renderNupCell('obra') },
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
    { key: 'nup', label: 'NUP', render: renderNupCell('leitura') },
    { key: 'type', label: 'Tipo' },
    { key: 'number', label: 'Número', value: r => (r.number ? String(r.number).padStart(6, '0') : '') }
  ];

  const DOAGA_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  const ADHEL_COLUMNS = [
    { key: 'nup', label: 'NUP', render: renderNupCell('revogar') },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : '') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  function bindRowLinks(tbody, cardType) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      try {
        const data = JSON.parse(tr.dataset.row);
        if (!data?.nup) return;
        tr.addEventListener('click', () => {
          const payload = {
            nup: data.nup,
            cardType: cardType || null,
            processId: resolveProcessId(data) || null
          };
          sessionStorage.setItem('procPreSelect', JSON.stringify(payload));
          window.location.href = 'processos.html';
        });
      } catch (_) {}
    });
  }

  function getRowsForCard(cardType) {
    switch (cardType) {
      case 'pareceres': return pareceres;
      case 'remocao': return remocao;
      case 'obra': return obras;
      case 'leitura': return monitor;
      case 'revogar': return adhel;
      default: return [];
    }
  }

  function updateCardMeta(containerId, cardType) {
    const box = document.getElementById(containerId);
    const card = box?.closest('.card');
    const meta = card?.querySelector('.card-title-meta');
    if (!meta) return;
    if (!cardType || !ValidationFlags) {
      meta.innerHTML = '';
      return;
    }
    const rows = getRowsForCard(cardType);
    const hasFlag = rows.some(row => {
      const procId = resolveProcessId(row);
      return ValidationFlags.hasActive(validationState, procId, cardType);
    });
    meta.innerHTML = hasFlag ? '<span class="badge badge-validar">VALIDAR</span>' : '';
  }

  function getPareceresRows() {
    return pareceres;
  }

  function renderPareceres() {
    const rows = getPareceresRows();
    const { tbody } = Utils.renderTable('prazoParec', PARECERES_COLUMNS, rows);
    bindRowLinks(tbody, 'pareceres');
    updateCardMeta('prazoParec', 'pareceres');
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
  }

  function getRemocaoRows() {
    return remocao;
  }

  function renderRemocao() {
    const rows = getRemocaoRows();
    const { tbody } = Utils.renderTable('prazoRemocao', REMOCAO_COLUMNS, rows);
    bindRowLinks(tbody, 'remocao');
    updateCardMeta('prazoRemocao', 'remocao');
  }

  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('nup,due_date,days_remaining');
    remocao = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  }

  function getObraRows() {
    return obras;
  }

  function renderObra() {
    const rows = getObraRows();
    const { tbody } = Utils.renderTable('prazoObra', OBRAS_COLUMNS, rows);
    bindRowLinks(tbody, 'obra');
    updateCardMeta('prazoObra', 'obra');
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,due_date,days_remaining,em_atraso');
    obras = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  }

  function getSobrestamentoRows() {
    return sobrestamento;
  }

  function renderSobrestamento() {
    const rows = getSobrestamentoRows();
    const { tbody } = Utils.renderTable('prazoSobrestamento', SOBRESTAMENTO_COLUMNS, rows);
    bindRowLinks(tbody);
    updateCardMeta('prazoSobrestamento');
  }

  async function loadSobrestamento() {
    const { data } = await sb.from('v_prazo_sobrestamento')
      .select('nup,due_date,days_remaining');
    sobrestamento = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  }

  function getMonitorRows() {
    return monitor;
  }

  function renderMonitor() {
    const rows = getMonitorRows();
    const { tbody } = Utils.renderTable('prazoMonit', MONITOR_COLUMNS, rows);
    bindRowLinks(tbody, 'leitura');
    updateCardMeta('prazoMonit', 'leitura');
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup,type,number');
    monitor = data || [];
  }

  function getDoagaRows() {
    return doaga;
  }

  function renderDOAGA() {
    const rows = getDoagaRows();
    const { tbody } = Utils.renderTable('prazoDOAGA', DOAGA_COLUMNS, rows);
    bindRowLinks(tbody);
    updateCardMeta('prazoDOAGA');
  }

  async function loadDOAGA() {
    const { data } = await sb.from('v_prazo_do_aga')
      .select('nup,due_date,days_remaining');
    doaga = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
  }

  function getAdhelRows() {
    return adhel;
  }

  function renderADHEL() {
    const rows = getAdhelRows();
    const { tbody } = Utils.renderTable('prazoADHEL', ADHEL_COLUMNS, rows);
    bindRowLinks(tbody, 'revogar');
    updateCardMeta('prazoADHEL', 'revogar');
  }

  async function loadADHEL() {
    const { data } = await sb.from('v_prazo_ad_hel')
      .select('nup,due_date,days_remaining');
    adhel = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
  }

  async function assignProcessIds() {
    const nupSet = new Set();
    [pareceres, remocao, obras, monitor, adhel].forEach(list => {
      list.forEach(row => {
        if (row?.nup) nupSet.add(row.nup);
      });
    });
    if (!nupSet.size) {
      processIdByNup = new Map();
      return;
    }
    const nups = Array.from(nupSet);
    const { data, error } = await sb.from('processes').select('id,nup').in('nup', nups);
    if (error) throw error;
    processIdByNup = new Map();
    (data || []).forEach(item => {
      if (item?.nup != null) processIdByNup.set(item.nup, item.id);
    });
    const applyId = (list) => list.forEach(row => {
      const id = processIdByNup.get(row.nup);
      if (id) row.process_id = id;
    });
    [pareceres, remocao, obras, monitor, adhel].forEach(applyId);
  }

  async function refreshValidationState() {
    if (!ValidationFlags) {
      validationState = new Map();
      return;
    }
    const idSet = new Set();
    [pareceres, remocao, obras, monitor, adhel].forEach(list => {
      list.forEach(row => {
        const id = resolveProcessId(row);
        if (id) idSet.add(id);
      });
    });
    if (!idSet.size) {
      validationState = new Map();
      return;
    }
    validationState = await ValidationFlags.fetchForProcesses(Array.from(idSet));
  }

  function renderAll() {
    renderPareceres();
    renderRemocao();
    renderObra();
    renderSobrestamento();
    renderMonitor();
    renderDOAGA();
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
    try {
      await assignProcessIds();
    } catch (err) {
      console.warn('Falha ao associar processos aos NUPs', err);
      processIdByNup = new Map();
    }
    try {
      await refreshValidationState();
    } catch (err) {
      console.warn('Falha ao carregar sinalizações de validação', err);
      validationState = new Map();
    }
    renderAll();
  }

  return { init, load };
})();
