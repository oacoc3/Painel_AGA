// public/modules/dashboard.js
window.Modules = window.Modules || {};
window.Modules.dashboard = (() => {
  const DASHBOARD_STATUSES = window.Modules.statuses.PROCESS_STATUSES;
  const EXCLUDED_RING_STATUSES = new Set([
    'SOB-PDIR',
    'SOB-EXPL',
    'ARQ',
    'EDICAO',
    'SOB-DOC',
    'SOB-TEC',
    'DECEA',
    'AGD-LEIT'
  ]);
  const STATUS_LABELS = {
    CONFEC: 'Confecção de Notificação',
    'REV-OACO': 'Revisão Chefe OACO',
    APROV: 'Aprovação Chefe AGA',
    'ICA-PUB': 'ICA - Publicação de Portaria',
    ANADOC: 'Análise Documental',
    'ANATEC-PRE': 'Análise Técnica Preliminar',
    ANATEC: 'Análise Técnica',
    ANAICA: 'ICA - Análise Documental/Técnica'
  };
  const MONTH_LABELS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

  let cachedProcesses = [];

  function init() {
    el('btnDashFilter')?.addEventListener('click', load);
    el('entryYearSelect')?.addEventListener('change', renderEntryChart);
  }

  function renderEntryChartEmpty(message = 'Nenhum dado para exibir.') {
    const container = el('entryChart');
    if (!container) return;
    container.innerHTML = '';
    const msg = document.createElement('p');
    msg.className = 'muted chart-placeholder';
    msg.textContent = message;
    container.appendChild(msg);
  }

  function updateYearOptions() {
    const select = el('entryYearSelect');
    if (!select) return false;

    const previous = select.value ? Number(select.value) : null;
    const yearSet = new Set();
    (cachedProcesses || []).forEach(proc => {
      const d = Utils.dateOnly(proc.first_entry_date);
      if (!d || Number.isNaN(+d)) return;
      yearSet.add(d.getFullYear());
    });

    const years = Array.from(yearSet)
      .filter(y => Number.isFinite(y))
      .sort((a, b) => b - a);

    select.innerHTML = '';
    if (!years.length) {
      select.value = '';
      select.disabled = true;
      return false;
    }

    select.disabled = false;
    years.forEach(year => {
      const opt = document.createElement('option');
      opt.value = String(year);
      opt.textContent = String(year);
      select.appendChild(opt);
    });

    const chosen = (Number.isFinite(previous) && years.includes(previous)) ? previous : years[0];
    select.value = String(chosen);
    return true;
  }

  function renderEntryChart() {
    const container = el('entryChart');
    if (!container) return;

    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    if (!year || Number.isNaN(year)) {
      renderEntryChartEmpty('Nenhum dado para exibir.');
      return;
    }

    const counts = new Array(12).fill(0);
    (cachedProcesses || []).forEach(proc => {
      const d = Utils.dateOnly(proc.first_entry_date);
      if (!d || Number.isNaN(+d)) return;
      if (d.getFullYear() !== year) return;
      counts[d.getMonth()] += 1;
    });

    container.innerHTML = '';
    const bars = document.createElement('div');
    bars.className = 'bar-chart-bars';

    const max = counts.reduce((m, v) => Math.max(m, v), 0);
    counts.forEach((count, idx) => {
      const item = document.createElement('div');
      item.className = 'bar-chart-item';

      const value = document.createElement('span');
      value.className = 'bar-chart-value';
      value.textContent = String(count);

      const wrapper = document.createElement('div');
      wrapper.className = 'bar-chart-bar-wrapper';

      const bar = document.createElement('div');
      bar.className = 'bar-chart-bar';
      let percent = max ? (count / max) * 100 : 0;
      if (count > 0 && percent < 8) percent = 8; // altura mínima para barras > 0
      bar.style.height = `${percent}%`;
      bar.title = `${MONTH_LABELS[idx]}: ${count}`;

      wrapper.appendChild(bar);

      const label = document.createElement('span');
      label.className = 'bar-chart-label';
      label.textContent = MONTH_LABELS[idx];

      item.appendChild(value);
      item.appendChild(wrapper);
      item.appendChild(label);
      bars.appendChild(item);
    });

    container.appendChild(bars);

    if (!counts.some(Boolean)) {
      const msg = document.createElement('p');
      msg.className = 'muted chart-placeholder';
      msg.textContent = 'Nenhum processo no ano selecionado.';
      container.appendChild(msg);
    }
  }

  async function load() {
    renderEntryChartEmpty('Carregando…');
    const yearSelect = el('entryYearSelect');
    if (yearSelect) yearSelect.disabled = true;

    // Filtro por intervalo na 1ª entrada
    const from = el('dashFrom').value || null;
    const to = el('dashTo').value || null;
    let q = sb.from('processes').select('id,status,status_since,first_entry_date');
    if (from) q = q.gte('first_entry_date', from);
    if (to) q = q.lte('first_entry_date', to);
    const { data: procs } = await q;

    cachedProcesses = procs || [];
    const hasYears = updateYearOptions();
    if (hasYears) renderEntryChart();
    else renderEntryChartEmpty('Nenhum dado para exibir.');

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

    
    Utils.renderProcessBars('velocimetros', items);

  }

  return { init, load };
})();
