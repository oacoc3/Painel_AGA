// public/modules/prazos.js
window.Modules = window.Modules || {};
window.Modules.prazos = (() => {
  let pareceres = [];
  let remocao = [];
  let obras = [];
  let monitor = [];
  let doaga = [];

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
    const tipo = el('psTipo')?.value;
    let rows = pareceres;
    if (tipo) rows = rows.filter(r => r.type === tipo);
    const { tbody } = Utils.renderTable('prazoParec', [
      { key: 'nup', label: 'NUP' },
      { key: 'type', label: 'Tipo' },
      { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => Utils.daysBetween(new Date(), r.due_date) }
    ], rows);
    bindRowLinks(tbody);
  }

  async function loadPareceres() {
    const [intRes, extRes] = await Promise.all([
      sb.from('v_prazo_pareceres').select('nup,type,due_date,days_remaining'),
      sb.from('v_prazo_pareceres_externos').select('nup,type,due_date,days_remaining')
    ]);
    pareceres = [...(intRes.data || []), ...(extRes.data || [])]
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    const sel = el('psTipo');
    if (sel) {
      const tipos = Array.from(new Set(pareceres.map(p => p.type).filter(Boolean))).sort();
      sel.innerHTML = '<option value="">Todos</option>' + tipos.map(t => `<option>${t}</option>`).join('');
    }
    renderPareceres();
  }

  function renderRemocao() {
    let rows = remocao;
    const { tbody } = Utils.renderTable('prazoRemocao', [
      { key: 'nup', label: 'NUP' },
      { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => Utils.daysBetween(new Date(), r.due_date) }
    ], rows);
    bindRowLinks(tbody);
  }

  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('nup,due_date,days_remaining');
    remocao = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderRemocao();
  }

  function renderObra() {
    let rows = obras;
    const { tbody } = Utils.renderTable('prazoObra', [
      { key: 'nup', label: 'NUP' },
      { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => Utils.daysBetween(new Date(), r.due_date) },
      { key: 'em_atraso', label: 'Atraso', value: r => (r.em_atraso ? 'ATRASO' : '') }
    ], rows);
    bindRowLinks(tbody);
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,due_date,days_remaining,em_atraso');
    obras = data || [];
    renderObra();
  }

  function renderMonitor() {
    const tipo = el('monTipo')?.value || '';
    let rows = monitor;
    if (tipo) rows = rows.filter(r => r.type === tipo);

    const { tbody } = Utils.renderTable('prazoMonit', [
      { key: 'nup', label: 'NUP' },
      { key: 'type', label: 'Tipo' },
      { key: 'number', label: 'Número', value: r => r.number ? String(r.number).padStart(6, '0') : '' }
    ], rows);
    bindRowLinks(tbody);
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup,type,number');
    monitor = data || [];
    const sel = el('monTipo');
    if (sel) {
      const tipos = Array.from(new Set(monitor.map(m => m.type).filter(Boolean))).sort();
      sel.innerHTML = '<option value="">Todos</option>' + tipos.map(t => `<option>${t}</option>`).join('');
    }
    renderMonitor();
  }

  function renderDOAGA() {
    let rows = doaga;
    const { tbody } = Utils.renderTable('prazoDOAGA', [
      { key: 'nup', label: 'NUP' },
      { key: 'requested_at', label: 'Desde', value: r => Utils.fmtDate(r.requested_at) },
      { key: 'status', label: 'Status/Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : r.status) },
      { key: 'days_remaining', label: 'Dias rem.', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
    ], rows);
    bindRowLinks(tbody);
  }

  async function loadDOAGA() {
    const { data } = await sb.from('v_prazo_do_aga')
      .select('nup,status,requested_at,due_date,days_remaining');
    doaga = (data || []).sort((a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31'));
    renderDOAGA();
  }

  function init() {
    el('psTipo')?.addEventListener('change', renderPareceres);
    el('monTipo')?.addEventListener('change', renderMonitor);
  }

  async function load() {
    await Promise.all([loadPareceres(), loadRemocao(), loadObra(), loadMonitor(), loadDOAGA()]);
  }

  return { init, load };
})();
