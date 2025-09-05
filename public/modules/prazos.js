// public/modules/prazos.js
window.Modules = window.Modules || {};
window.Modules.prazos = (() => {
  async function loadATM() {
    const { data, error } = await sb.from('v_prazo_pareceres')
      .select('nup,type,requested_at,due_date,days_remaining')
      .eq('type','ATM');
    if (error) return Utils.renderTable('prazoATM', [], []);
    Utils.renderTable('prazoATM', [
      { key: 'nup', label: 'NUP' },
      { key: 'requested_at', label: 'Solicitado/Expedido em', value: r => Utils.fmtDate(r.requested_at) },
      { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => Utils.daysBetween(new Date(), r.due_date) }
    ], data);
  }

  async function loadDT() {
    const { data } = await sb.from('v_prazo_pareceres')
      .select('nup,type,requested_at,due_date,days_remaining')
      .eq('type','DT');
    Utils.renderTable('prazoDT', [
      { key: 'nup', label: 'NUP' },
      { key: 'requested_at', label: 'Solicitado/Expedido em', value: r => Utils.fmtDate(r.requested_at) },
      { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => Utils.daysBetween(new Date(), r.due_date) }
    ], data);
  }

  async function loadCGNA() {
    const { data } = await sb.from('v_prazo_pareceres')
      .select('nup,type,requested_at,due_date,days_remaining')
      .eq('type','CGNA');
    Utils.renderTable('prazoCGNA', [
      { key: 'nup', label: 'NUP' },
      { key: 'requested_at', label: 'Solicitado/Expedido em', value: r => Utils.fmtDate(r.requested_at) },
      { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => Utils.daysBetween(new Date(), r.due_date) }
    ], data);
  }

  async function loadExternos() {
    const { data } = await sb.from('v_prazo_pareceres_externos')
      .select('nup,type,requested_at,due_date,days_remaining');
    Utils.renderTable('prazoExt', [
      { key: 'nup', label: 'NUP' },
      { key: 'type', label: 'Tipo' },
      { key: 'requested_at', label: 'Solicitado/Expedido em', value: r => Utils.fmtDate(r.requested_at) },
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
      { key: 'em_atraso', label: 'Em atraso', value: r => Utils.yesNo(r.em_atraso) }
    ], data);
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup');
    Utils.renderTable('prazoMonit', [
      { key: 'nup', label: 'NUP' }
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

  function init() { /* nada adicional */ }

  async function load() {
    await Promise.all([loadATM(), loadDT(), loadCGNA(), loadExternos(), loadObra(), loadMonitor(), loadDOAGA()]);
  }

  return { init, load };
})();
