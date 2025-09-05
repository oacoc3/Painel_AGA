// public/modules/prazos.js
window.Modules = window.Modules || {};
window.Modules.prazos = (() => {
  let pareceres = [];
  let remocao = [];
  let obras = [];
  let monitor = [];
  let doaga = [];

  function renderPareceres() {
    const tipo = el('psTipo')?.value;
    let rows = pareceres;
    if (tipo) rows = rows.filter(r => r.type === tipo);
    Utils.renderTable('prazoParec', [
      { key: 'nup', label: 'NUP' },
      { key: 'type', label: 'Tipo' },
      { key: 'requested_at', label: 'Solicitado/Expedido em', value: r => Utils.fmtDate(r.requested_at) },
      { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => Utils.daysBetween(new Date(), r.due_date) }
    ], rows);
  }

  async function loadPareceres() {
    const [intRes, extRes] = await Promise.all([
      sb.from('v_prazo_pareceres').select('nup,type,requested_at,due_date,days_remaining'),
      sb.from('v_prazo_pareceres_externos').select('nup,type,requested_at,due_date,days_remaining')
    ]);
    pareceres = [...(intRes.data || []), ...(extRes.data || [])]
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderPareceres();
  }

  function renderRemocao() {
    const filtro = (el('rrFiltro')?.value || '').toLowerCase();
    let rows = remocao;
    if (filtro) rows = rows.filter(r => (r.nup || '').toLowerCase().includes(filtro));
    Utils.renderTable('prazoRemocao', [
      { key: 'nup', label: 'NUP' },
      { key: 'read_at', label: 'Lido em', value: r => Utils.fmtDate(r.read_at) },
      { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => Utils.daysBetween(new Date(), r.due_date) }
    ], rows);
  }

  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('nup,read_at,due_date,days_remaining');
    remocao = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderRemocao();
  }

  function renderObra() {
    const filtro = (el('obraFiltro')?.value || '').toLowerCase();
    let rows = obras;
    if (filtro) rows = rows.filter(r => (r.nup || '').toLowerCase().includes(filtro));
    Utils.renderTable('prazoObra', [
      { key: 'nup', label: 'NUP' },
      { key: 'requested_at', label: 'Solicitado/Expedido em', value: r => Utils.fmtDate(r.requested_at) },
      { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => Utils.daysBetween(new Date(), r.due_date) },
      { key: 'em_atraso', label: 'Atraso', value: r => (r.em_atraso ? 'ATRASO' : '') }
    ], rows);
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,requested_at,due_date,days_remaining,em_atraso');
    obras = data || [];
    renderObra();
  }

  function renderMonitor() {
    const filtro = (el('monFiltro')?.value || '').toLowerCase();
    let rows = monitor;
    if (filtro) rows = rows.filter(r => {
      const text = `${r.nup || ''} ${r.type || ''} ${r.number ? String(r.number).padStart(6, '0') : ''}`.toLowerCase();
      return text.includes(filtro);
    });
    Utils.renderTable('prazoMonit', [
      { key: 'nup', label: 'NUP' },
      { key: 'type', label: 'Tipo' },
      { key: 'number', label: 'Número', value: r => r.number ? String(r.number).padStart(6, '0') : '' }
    ], rows);
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup,type,number');
    monitor = data || [];
    renderMonitor();
  }

  function renderDOAGA() {
    const filtro = (el('doagaFiltro')?.value || '').toLowerCase();
    let rows = doaga;
    if (filtro) rows = rows.filter(r => {
      const text = `${r.nup || ''} ${r.status || ''}`.toLowerCase();
      return text.includes(filtro);
    });
    Utils.renderTable('prazoDOAGA', [
      { key: 'nup', label: 'NUP' },
      { key: 'requested_at', label: 'Solicitado/Expedido em', value: r => Utils.fmtDate(r.requested_at) },
      { key: 'status', label: 'Status/Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : r.status) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
    ], rows);
  }

  async function loadDOAGA() {
    const { data } = await sb.from('v_prazo_do_aga')
      .select('nup,status,requested_at,due_date,days_remaining');
    doaga = (data || []).sort((a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31'));
    renderDOAGA();
  }

  function init() {
    el('psTipo')?.addEventListener('change', renderPareceres);
    el('rrFiltro')?.addEventListener('input', renderRemocao);
    el('obraFiltro')?.addEventListener('input', renderObra);
    el('monFiltro')?.addEventListener('input', renderMonitor);
    el('doagaFiltro')?.addEventListener('input', renderDOAGA);
  }

  async function load() {
    await Promise.all([loadPareceres(), loadRemocao(), loadObra(), loadMonitor(), loadDOAGA()]);
  }

  return { init, load };
})();
