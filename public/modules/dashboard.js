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
    'AGD-RESP',
    'AGD-LEIT',
    'ICA-EXTR',
    'APROV'
  ]);
  const SPEED_STATUS_ORDER = [
    'ANADOC',
    'ANAICA',
    'ANATEC-PRE',
    'ANATEC',
    'CONFEC',
    'REV-OACO',
    'APROV',
    'ICA-PUB'
  ];

  // >>> Patch: médias de pareceres (ATM/DT)
  const OPINION_AVERAGE_TYPES = ['ATM', 'DT'];
  const OPINION_LABELS = {
    ATM: 'Análise ATM',
    DT: 'Análise DT'
  };
  // <<< Patch

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
  const YEARLY_COUNTER_FORMATTER = new Intl.NumberFormat('pt-BR');
  const PERCENTAGE_FORMATTER = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

  const HOURLY_GROUPS = [
    {
      key: 'monThu',
      label: 'Segunda à quinta',
      defaultBarClass: 'blue',
      offHours: hour => hour < 8 || hour >= 16
    },
    {
      key: 'friday',
      label: 'Sexta',
      defaultBarClass: 'blue',
      offHours: hour => hour < 8 || hour >= 12
    },
    {
      key: 'weekend',
      label: 'Sábados e domingos',
      defaultBarClass: 'gray',
      offHours: _hour => true
    }
  ];
  const HOURLY_GROUP_MAP = HOURLY_GROUPS.reduce((acc, g) => (acc[g.key]=g, acc), {});
  const HOURLY_VIEW_DEFAULT = 'monThu';
  const HOURLY_VIEW_VALUES = new Set(HOURLY_GROUPS.map(group => group.key));
  const HOURLY_VIEW_SELECT_ID = 'hourlyEngagementViewSelect';

  let cachedProcesses = [];
  let cachedStatusHistory = {};
  let cachedNotifications = [];
  let cachedSigadaer = [];
  let cachedOpinions = [];

  function el(id) {
    return document.getElementById(id);
  }

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  function daysBetween(d1, d2) {
    return Utils.daysBetween(d1, d2);
  }

  function renderEntryChartEmpty(message = 'Nenhum dado para exibir.') {
    const container = el('entryChart');
    if (!container) return;
    setEntryYearTotal(null);
    container.innerHTML = '';
    const msg = document.createElement('p');
    msg.className = 'muted chart-placeholder';
    msg.textContent = message;
    container.appendChild(msg);
  }

  function setEntryYearTotal(value) {
    const node = el('entryYearTotal');
    if (!node) return;
    node.textContent = value == null ? '—' : YEARLY_COUNTER_FORMATTER.format(value);
  }

  function ensureYearSelectPopulated() {
    const select = el('entryYearSelect');
    if (!select) return false;

    if (select.options && select.options.length) return true;

    const years = unique(
      (cachedProcesses || [])
        .map(proc => proc.first_entry_date)
        .filter(Boolean)
        .map(date => (Utils.dateOnly(date) || {}).getFullYear?.())
        .filter(y => Number.isFinite(y))
    ).sort((a, b) => a - b);

    if (!years.length) return false;

    const previous = Number(localStorage.getItem('dashboard.entryYear') || '');
    select.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

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
      renderEntryChartEmpty('Selecione um ano.');
      return;
    }

    const items = (cachedProcesses || [])
      .map(p => ({ id: p.id, type: p.type, date: Utils.dateOnly(p.first_entry_date) }))
      .filter(p => p.date && p.date.getFullYear() === year);

    setEntryYearTotal(items.length);

    // agrupar por mês e tipo
    const groups = new Map();
    for (const it of items) {
      const key = `${it.date.getMonth()}|${it.type || '—'}`;
      groups.set(key, (groups.get(key) || 0) + 1);
    }

    // preparar DOM
    container.innerHTML = '';
    const chart = document.createElement('div');
    chart.className = 'bar-chart';

    // montar cabeçalhos de meses
    const header = document.createElement('div');
    header.className = 'bar-chart-header';
    MONTH_LABELS.forEach(lbl => {
      const h = document.createElement('div');
      h.className = 'bar-chart-header-cell';
      h.textContent = lbl;
      header.appendChild(h);
    });
    chart.appendChild(header);

    // descobrir tipos presentes (limitado pelo layout existente)
    const types = unique(items.map(it => it.type || '—'));

    // construir linhas por tipo
    types.forEach(type => {
      const row = document.createElement('div');
      row.className = 'bar-chart-row';

      const label = document.createElement('div');
      label.className = 'bar-chart-row-label';
      label.textContent = type || '—';
      row.appendChild(label);

      const bars = document.createElement('div');
      bars.className = 'bar-chart-row-bars';

      for (let m = 0; m < 12; m++) {
        const value = groups.get(`${m}|${type}`) || 0;
        const item = document.createElement('div');
        item.className = 'bar-chart-item';

        const valueNode = document.createElement('span');
        valueNode.className = 'bar-chart-value';
        valueNode.textContent = value ? YEARLY_COUNTER_FORMATTER.format(value) : '';

        const wrapper = document.createElement('div');
        wrapper.className = 'bar-chart-bar-wrapper';

        const bar = document.createElement('div');
        bar.className = `bar-chart-bar blue`;
        let heightPercent = value > 0 ? Math.min(100, 10 + value * 8) : 0;
        if (value > 0 && heightPercent < 8) heightPercent = 8;
        bar.style.height = `${heightPercent}%`;
        bar.title = `${MONTH_LABELS[m]} — ${type}: ${value}`;

        wrapper.appendChild(bar);

        const label = document.createElement('span');
        label.className = 'bar-chart-label';
        label.textContent = MONTH_LABELS[m];

        item.appendChild(valueNode);
        item.appendChild(wrapper);
        item.appendChild(label);
        bars.appendChild(item);
      }

      row.appendChild(bars);
      chart.appendChild(row);
    });

    container.appendChild(chart);
  }

  function renderOverview() {
    const countMap = {};
    DASHBOARD_STATUSES.forEach(s => { countMap[s] = 0; });
    (cachedProcesses || []).forEach(proc => {
      if (!proc || !proc.status) return;
      countMap[proc.status] = (countMap[proc.status] || 0) + 1;
    });

    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    const hasYear = Number.isFinite(year);

    const agg = {};
    const opinionAgg = {}; // <<< Patch
    const now = new Date();
    if (hasYear) {
      Object.values(cachedStatusHistory || {}).forEach(list => {
        if (!Array.isArray(list)) return;
        for (let i = 0; i < list.length; i++) {
          const cur = list[i];
          if (!cur || !cur.start || !cur.status) continue;
          if (i > 0) {
            const prev = list[i - 1];
            if (prev && prev.start === cur.start && prev.status === cur.status) continue;
          }

          const startDate = new Date(cur.start);
          if (Number.isNaN(+startDate)) continue;
          const next = list[i + 1];
          const endDate = next && next.start ? new Date(next.start) : now;
          if (Number.isNaN(+endDate)) continue;

          const startYear = startDate.getFullYear();
          const endYear = endDate.getFullYear();
          // >>> CORREÇÃO: considerar etapas que COMEÇARAM no ano selecionado
          if (startYear !== year) continue;

          const days = Utils.daysBetween(startDate, endDate);
          if (typeof days !== 'number' || Number.isNaN(days)) continue;

          agg[cur.status] = agg[cur.status] || { sum: 0, n: 0 };
          agg[cur.status].sum += days;
          agg[cur.status].n += 1;
        }
      });
    }

    // >>> Patch: agregação de médias de pareceres (ATM/DT) por ano (solicitação → recebimento)
    if (hasYear) {
      (cachedOpinions || []).forEach(opinion => {
        if (!opinion) return;
        const type = typeof opinion.type === 'string' ? opinion.type.toUpperCase() : '';
        if (!OPINION_AVERAGE_TYPES.includes(type)) return;
        if (!opinion.requested_at) return;
        const receivedValue = opinion.received_at || opinion.received_at;
        if (!receivedValue) return;

        const req = new Date(opinion.requested_at);
        const rcv = new Date(receivedValue);
        if (Number.isNaN(+req) || Number.isNaN(+rcv)) return;
        if (req.getFullYear() !== year && rcv.getFullYear() !== year) return;

        const days = Utils.daysBetween(req, rcv);
        if (typeof days !== 'number' || Number.isNaN(days)) return;

        const bucket = (opinionAgg[type] ||= { sum: 0, n: 0 });
        bucket.sum += days;
        bucket.n += 1;
      });
    }
    // <<< Patch

    const ringStatuses = SPEED_STATUS_ORDER.filter(
      status => !EXCLUDED_RING_STATUSES.has(status) && DASHBOARD_STATUSES.includes(status)
    );

    const items = [];
    ringStatuses.forEach(statusCode => {
      const label = STATUS_LABELS[statusCode] || statusCode;
      items.push({
        status: statusCode,
        label,
        count: countMap[statusCode] || 0,
        avg: agg[statusCode] ? (agg[statusCode].sum / agg[statusCode].n) : null,
        ariaLabel: `Velocidade média de ${label}`
      });

      // >>> Patch: inserir as médias de pareceres logo após ANATEC-PRE
      if (statusCode === 'ANATEC-PRE') {
        OPINION_AVERAGE_TYPES.forEach(type => {
          const a = opinionAgg[type];
          const avg = a?.n ? (a.sum / a.n) : null;
          items.push({
            status: `OP-${type}`,
            label: OPINION_LABELS[type] || type,
            count: null,
            avg,
            ariaLabel: `Tempo médio da ${OPINION_LABELS[type] || type} (da solicitação ao recebimento)`
          });
        });
      }
      // <<< Patch
    });

    Utils.renderProcessBars('velocimetros', items);
  }

  function renderYearlyActivity() {
    const metricEls = {
      anadoc: el('dashboardMetricAnadoc'),
      anatecPre: el('dashboardMetricAnatecPre'),
      anatec: el('dashboardMetricAnatec'),
      notifications: el('dashboardMetricNotifications'),
      sigadaerJjaer: el('dashboardMetricSigadaerJjaer'),
      sigadaerAgu: el('dashboardMetricSigadaerAgu'),
      sigadaerPref: el('dashboardMetricSigadaerPref')
    };

    Object.values(metricEls).forEach(node => {
      if (node) node.textContent = '—';
    });

    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    if (!Number.isFinite(year)) return;

    const counters = {
      anadoc: 0,
      anatecPre: 0,
      anatec: 0,
      notifications: 0,
      sigadaerJjaer: 0,
      sigadaerAgu: 0,
      sigadaerPref: 0
    };

    // Contagem por ENTRADA no status (histórico) — 1x por processo/ano
    const statusProcessSets = {
      anadoc: new Set(),
      anatecPre: new Set(),
      anatec: new Set()
    };

    Object.entries(cachedStatusHistory || {}).forEach(([procId, list]) => {
      if (!Array.isArray(list)) return;
      for (let i = 0; i < list.length; i++) {
        const cur = list[i];
        if (!cur || !cur.start || !cur.status) continue;
        if (i > 0) {
          const prev = list[i - 1];
          if (prev && prev.start === cur.start && prev.status === cur.status) continue;
        }

        const startDate = new Date(cur.start);
        if (Number.isNaN(+startDate) || startDate.getFullYear() !== year) continue;

        const procKey = String(procId);
        if (cur.status === 'ANADOC') statusProcessSets.anadoc.add(procKey);
        if (cur.status === 'ANATEC-PRE') statusProcessSets.anatecPre.add(procKey);
        if (cur.status === 'ANATEC') statusProcessSets.anatec.add(procKey);
      }
    });

    counters.anadoc = statusProcessSets.anadoc.size;
    counters.anatecPre = statusProcessSets.anatecPre.size;
    counters.anatec = statusProcessSets.anatec.size;

    // Notificações
    (cachedNotifications || []).forEach(notification => {
      if (!notification) return;
      const { requested_at: requestedAt } = notification;
      if (!requestedAt) return;

      const requestedDate = new Date(requestedAt);
      if (!Number.isNaN(+requestedDate) && requestedDate.getFullYear() === year) {
        counters.notifications += 1;
      }
    });

    // SIGADAER (EXPEDIDO → expedit_at)
    (cachedSigadaer || []).forEach(sigadaer => {
      if (!sigadaer) return;
      const { type, status, expedit_at: expeditAt } = sigadaer;
      if (!expeditAt || status !== 'EXPEDIDO') return;

      const expeditDate = new Date(expeditAt);
      if (Number.isNaN(+expeditDate) || expeditDate.getFullYear() !== year) return;

      const normalizedType = typeof type === 'string' ? type.toUpperCase() : '';
      if (normalizedType === 'JJAER') counters.sigadaerJjaer += 1;
      if (normalizedType === 'AGU') counters.sigadaerAgu += 1;
      if (normalizedType === 'PREF') counters.sigadaerPref += 1;
    });

    Object.entries(metricEls).forEach(([key, node]) => {
      if (!node) return;
      node.textContent = YEARLY_COUNTER_FORMATTER.format(counters[key] || 0);
    });
  }

  // ====== Engajamento por hora ======
  function determineHourlyGroupKey(date) {
    const dow = date.getDay(); // 0=Dom,1=Seg..6=Sáb
    if (dow === 0 || dow === 6) return 'weekend';
    if (dow === 5) return 'friday';
    return 'monThu';
  }

  function computeHourlyEngagementData(year) {
    const groups = {};
    HOURLY_GROUPS.forEach(group => {
      groups[group.key] = new Array(24).fill(0);
    });

    const registerDate = dateValue => {
      if (!dateValue) return;
      const dt = dateValue instanceof Date ? dateValue : new Date(dateValue);
      if (!dt || Number.isNaN(+dt)) return;
      if (dt.getFullYear() !== year) return;
      const hour = dt.getHours();
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
      const groupKey = determineHourlyGroupKey(dt);
      if (!groupKey) return;
      groups[groupKey][hour] += 1;
    };

    Object.values(cachedStatusHistory || {}).forEach(list => {
      if (!Array.isArray(list)) return;
      for (let i = 0; i < list.length; i++) {
        const cur = list[i];
        if (!cur || !cur.start || !cur.status) continue;
        if (i > 0) {
          const prev = list[i - 1];
          if (prev && prev.start === cur.start && prev.status === cur.status) continue;
        }
        registerDate(cur.start);
      }
    });

    // sumarização
    const overallTotal = HOURLY_GROUPS.reduce((sum, g) => sum + groups[g.key].reduce((s, v) => s + v, 0), 0);
    const offHoursByGroup = {};
    HOURLY_GROUPS.forEach(group => {
      offHoursByGroup[group.key] = groups[group.key].reduce((sum, v, hour) =>
        sum + (group.offHours(hour) ? v : 0), 0);
    });

    return { groups, overallTotal, offHoursByGroup };
  }

  function renderHourlyEngagementEmpty(msg) {
    const node = el('hourlyEngagementChart');
    if (!node) return;
    node.innerHTML = `<div class="empty">${msg || '—'}</div>`;
  }

  function renderHourlyEngagement() {
    const container = el('hourlyEngagementChart');
    if (!container) return;

    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    if (!Number.isFinite(year)) {
      renderHourlyEngagementEmpty('Nenhum dado para exibir.');
      return;
    }

    const data = computeHourlyEngagementData(year);

    container.innerHTML = '';
    const view = (el(HOURLY_VIEW_SELECT_ID)?.value) || HOURLY_VIEW_DEFAULT;
    const group = HOURLY_GROUP_MAP[HOURLY_VIEW_VALUES.has(view) ? view : HOURLY_VIEW_DEFAULT];

    // bloco principal
    const block = document.createElement('div');
    block.className = 'hourly-block';

    const title = document.createElement('div');
    title.className = 'hourly-title';
    title.textContent = `Distribuição por hora — ${group.label}`;
    block.appendChild(title);

    // barras 0..23h
    const bars = document.createElement('div');
    bars.className = 'hourly-bars';

    const groupData = data.groups[group.key] || new Array(24).fill(0);
    const maxVal = Math.max(...groupData, 0);
    const effectiveMaxPercent = maxVal ? 100 : 0;

    for (let hour = 0; hour < 24; hour++) {
      const value = groupData[hour] || 0;
      const percent = maxVal ? (value / maxVal) * 100 : 0;

      const barColorClass = group.defaultBarClass;
      const labelColorClass = group.key === 'weekend' ? 'muted' : '';

      const item = document.createElement('div');
      item.className = 'bar-chart-item';

      const valueNode = document.createElement('span');
      valueNode.className = 'bar-chart-value';
      valueNode.textContent = value ? YEARLY_COUNTER_FORMATTER.format(value) : '';

      const wrapper = document.createElement('div');
      wrapper.className = 'bar-chart-bar-wrapper';

      const bar = document.createElement('div');
      bar.className = `bar-chart-bar ${barColorClass}`;
      let heightPercent = effectiveMaxPercent ? (percent / effectiveMaxPercent) * 100 : 0;
      if (percent > 0 && heightPercent < 8) heightPercent = 8;
      bar.style.height = `${heightPercent}%`;
      bar.title = `${group.label} — ${String(hour).padStart(2, '0')}:00 — ${value} evento(s) (${PERCENTAGE_FORMATTER.format(percent)}%)`;

      wrapper.appendChild(bar);

      const label = document.createElement('span');
      label.className = `bar-chart-label ${labelColorClass}`;
      label.textContent = `${String(hour).padStart(2, '0')}h`;

      item.appendChild(valueNode);
      item.appendChild(wrapper);
      item.appendChild(label);
      bars.appendChild(item);
    }

    block.appendChild(bars);
    container.appendChild(block);

    appendHourlySummary(container, data);
  }

  function appendHourlySummary(container, data) {
    const offHoursTotal = HOURLY_GROUPS.reduce((sum, group) => sum + (data.offHoursByGroup[group.key] || 0), 0);
    const offHoursPercent = data.overallTotal ? (offHoursTotal / data.overallTotal) * 100 : 0;

    const summary = document.createElement('div');
    summary.className = 'hourly-summary';

    const summaryLabel = document.createElement('span');
    summaryLabel.textContent = 'Fora do horário (estimativa):';

    const summaryValue = document.createElement('strong');
    summaryValue.textContent = `${PERCENTAGE_FORMATTER.format(offHoursPercent)}%`;

    summary.appendChild(summaryLabel);
    summary.appendChild(summaryValue);
    container.appendChild(summary);
  }

  async function load() {
    renderEntryChartEmpty('Carregando…');
    renderHourlyEngagementEmpty('Carregando…');
    const yearSelect = el('entryYearSelect');
    if (yearSelect) yearSelect.disabled = true;

    cachedStatusHistory = {};
    cachedNotifications = [];
    cachedSigadaer = [];
    cachedOpinions = [];

    const sb = window.sb;
    const { data: procs } = await sb
      .from('processes')
      .select('id,type,status,status_since,first_entry_date')
      .order('first_entry_date', { ascending: true });

    cachedProcesses = procs || [];

    ensureYearSelectPopulated();

    const { data: notifications } = await sb
      .from('notifications')
      .select('requested_at, read_at');
    cachedNotifications = notifications || [];

    const { data: sigadaer } = await sb
      .from('sigadaer')
      .select('type, status, requested_at, expedit_at');
    cachedSigadaer = sigadaer || [];

    // >> Precisamos de received_at p/ médias de pareceres
    const { data: opinions } = await sb
      .from('internal_opinions')
      .select('type, requested_at, received_at');
    cachedOpinions = opinions || [];

    // histórico de status por processo (tabela history, ação "Status atualizado")
    const ids = (procs || []).map(p => p.id);
    const byProc = {};
    if (ids.length) {
      const { data: historyData } = await sb
        .from('history')
        .select('process_id,details,created_at')
        .eq('action', 'Status atualizado')
        .in('process_id', ids)
        .order('created_at');

      (historyData || []).forEach(item => {
        let det = item && item.details;
        if (det && typeof det === 'string') {
          try { det = JSON.parse(det); } catch (_) { det = null; }
        }
        const status = det?.status;
        let start = det?.status_since || det?.start || item.created_at;
        if (!status || !start) return;
        const list = byProc[item.process_id] || (byProc[item.process_id] = []);
        list.push({ status, start });
      });
    }

    // garantir que o status atual esteja na sequência
    (procs || []).forEach(proc => {
      if (!proc || !proc.id) return;
      const list = byProc[proc.id] || (byProc[proc.id] = []);
      if (proc.status && proc.status_since) {
        const already = list.some(entry => entry.status === proc.status && entry.start === proc.status_since);
        if (!already) list.push({ status: proc.status, start: proc.status_since });
      }
      list.sort((a, b) => new Date(a.start) - new Date(b.start));
    });

    cachedStatusHistory = byProc;

    renderOverview();
    renderEntryChart();
    renderYearlyActivity();
    renderHourlyEngagement();

    if (yearSelect) yearSelect.disabled = false;
  }

  function init() {
    const yearSelect = el('entryYearSelect');
    yearSelect?.addEventListener('change', () => {
      localStorage.setItem('dashboard.entryYear', String(yearSelect.value || ''));
      renderOverview();
      renderEntryChart();
      renderYearlyActivity();
      renderHourlyEngagement();
    });

    const hourlyViewSelect = el(HOURLY_VIEW_SELECT_ID);
    hourlyViewSelect?.addEventListener('change', () => {
      renderHourlyEngagement();
    });
  }

  return { init, load };
})();
