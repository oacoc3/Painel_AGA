// public/modules/prazos.js
window.Modules = window.Modules || {};
window.Modules.prazos = (() => {
  let pareceres = [];

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
    pareceres = [...(intRes.data || []), ...(extRes.data || [])];
    renderPareceres();
  }

  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('nup,read_at,due_date,days_remaining');
    Utils.renderTable('prazoRemocao', [
      { key: 'nup', label: 'NUP' },
      { key: 'read_at', label: 'Lido em', value: r => Utils.fmtDate(r.read_at) },
      { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => Utils.daysBetween(new Date(), r.due_date) }
    ], data);
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,requested_at,due_date,days_remaining,em_atraso');
    Utils.renderTable('prazoObra', [
      { key: 'nup', label: 'NUP' },
      { key: 'requested_at', label: 'Solicitado/Expedido em', value: r => Utils.fmtDate(r.requested_at) },
      { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => Utils.daysBetween(new Date(), r.due_date) },
      { key: 'em_atraso', label: 'Atraso', value: r => (r.em_atraso ? 'ATRASO' : '') }
    ], data);
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup,type');
    Utils.renderTable('prazoMonit', [
      { key: 'nup', label: 'NUP' },
      { key: 'type', label: 'Tipo' }
    ], data);
  }

  async function loadDOAGA() {
    const { data } = await sb.from('v_prazo_do_aga')
      .select('nup,status,requested_at,due_date,days_remaining');
    Utils.renderTable('prazoDOAGA', [
      { key: 'nup', label: 'NUP' },
      { key: 'requested_at', label: 'Solicitado/Expedido em', value: r => Utils.fmtDate(r.requested_at) },
      { key: 'status', label: 'Status/Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : r.status) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
    ], data);
  }

  function init() {
    el('psTipo')?.addEventListener('change', renderPareceres);
  }

  async function load() {
    await Promise.all([loadPareceres(), loadRemocao(), loadObra(), loadMonitor(), loadDOAGA()]);
  }

  return { init, load };
})();
