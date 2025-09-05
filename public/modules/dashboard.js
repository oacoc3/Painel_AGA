// public/modules/dashboard.js
window.Modules = window.Modules || {};
window.Modules.dashboard = (() => {
  const DASHBOARD_STATUSES = ['CONFEC','REV-OACO','APROV','ICA-PUB','EDICAO','AGD-LEIT','ANADOC','ANATEC-PRE','ANATEC','ANAICA','SOB-DOC','SOB-TEC','SOB-PDIR','SOB-EXPL','ARQ'];

  function init() {
    el('btnDashFilter').addEventListener('click', load);
  }

  async function load() {
    // Filtro por intervalo na 1ª entrada
    const from = el('dashFrom').value || null;
    const to = el('dashTo').value || null;
    let q = sb.from('processes').select('id,status,first_entry_date');
    if (from) q = q.gte('first_entry_date', from);
    if (to) q = q.lte('first_entry_date', to);
    const { data: procs } = await q;

    // Contagem por status
    const countMap = {};
    DASHBOARD_STATUSES.forEach(s => { countMap[s] = 0; });
    (procs || []).forEach(p => { countMap[p.status] = (countMap[p.status] || 0) + 1; });

    // Velocidade média considerando todas as passagens por status
    const ids = (procs || []).map(p => p.id);
    let logs = [];
    if (ids.length) {
      const { data: logData } = await sb.from('audit_log')
        .select('entity_id,occurred_at,details')
        .eq('entity_type','processes')
        .in('entity_id', ids)
        .order('occurred_at');
      logs = logData || [];
    }
    const byProc = {};
    logs.forEach(l => {
      const det = l.details || {};
      if (!det.status || !det.status_since) return;
      const pid = l.entity_id;
      byProc[pid] = byProc[pid] || [];
      byProc[pid].push({ status: det.status, start: det.status_since });
    });

    const agg = {};
    const now = new Date();
    Object.values(byProc).forEach(list => {
      list.sort((a,b) => new Date(a.start) - new Date(b.start));
      for (let i = 0; i < list.length; i++) {
        const cur = list[i];
        const next = list[i+1];
        if (i > 0 && cur.start === list[i-1].start && cur.status === list[i-1].status) continue;
        const end = next ? new Date(next.start) : now;
        const days = Utils.daysBetween(cur.start, end);
        agg[cur.status] = agg[cur.status] || { sum: 0, n: 0 };
        agg[cur.status].sum += days;
        agg[cur.status].n += 1;
      }
    });

    const items = DASHBOARD_STATUSES.map(s => ({
      status: s,
      count: countMap[s] || 0,
      avg: agg[s] ? (agg[s].sum / agg[s].n) : null
    }));
    Utils.renderProcessRings('velocimetros', items);

    const rows = items.filter(it => it.avg != null).map(it => ({
      status: it.status,
      avg: it.avg.toFixed(1)
    }));
    Utils.renderTable('speedTable', [
      { key: 'status', label: 'Status' },
      { key: 'avg', label: 'Dias/processo' }
    ], rows);
  }

  return { init, load };
})();
