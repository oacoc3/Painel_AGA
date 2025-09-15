// public/modules/dashboard.js
window.Modules = window.Modules || {};
window.Modules.dashboard = (() => {
  const DASHBOARD_STATUSES = window.Modules.statuses.PROCESS_STATUSES;
  const EXCLUDED_RING_STATUSES = new Set(['SOB-PDIR', 'SOB-EXPL', 'ARQ', 'EDICAO']);

  function init() {
    el('btnDashFilter').addEventListener('click', load);
  }

  async function load() {
    // Filtro por intervalo na 1ª entrada
    const from = el('dashFrom').value || null;
    const to = el('dashTo').value || null;
    let q = sb.from('processes').select('id,status,status_since,first_entry_date');
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

    const ringStatuses = DASHBOARD_STATUSES.filter(s => !EXCLUDED_RING_STATUSES.has(s));
    const items = ringStatuses.map(s => ({
      status: s,
      count: countMap[s] || 0,
      avg: agg[s] ? (agg[s].sum / agg[s].n) : null
    }));

    const totalProcesses = (procs || []).length;
    let archiveSum = 0;
    let archiveCount = 0;
    (procs || []).forEach(proc => {
      if (!proc.first_entry_date) return;
      const logList = byProc[proc.id] || [];
      const archivedEvent = logList.find(entry => entry.status === 'ARQ');
      let archivedStart = archivedEvent ? archivedEvent.start : null;
      if (!archivedStart && proc.status === 'ARQ' && proc.status_since) {
        archivedStart = proc.status_since;
      }
      if (!archivedStart) return;
      const diff = Utils.daysBetween(proc.first_entry_date, archivedStart);
      if (typeof diff === 'number' && Number.isFinite(diff)) {
        archiveSum += diff;
        archiveCount += 1;
      }
    });

    const avgArchiveTime = archiveCount ? (archiveSum / archiveCount) : null;
    items.unshift({
      status: 'TOTAL',
      count: totalProcesses,
      avg: avgArchiveTime,
      ariaLabel: 'Tempo médio até arquivamento (todos os processos)'
    });

    Utils.renderProcessRings('velocimetros', items);
  }

  return { init, load };
})();
