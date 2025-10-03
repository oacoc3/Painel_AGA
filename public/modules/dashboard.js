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
    'ICA-EXTR'
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

  const OPINION_TYPES_SET = new Set(['ATM', 'DT', 'CGNA']);

  // >>> Patch novo: grupos/visões para Engajamento por Hora
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
      defaultBarClass: 'red',
      offHours: () => true
    }
  ];

  const HOURLY_GROUP_MAP = HOURLY_GROUPS.reduce((acc, group) => {
    acc[group.key] = group;
    return acc;
  }, {});

  // (alterado pelo patch) agora a visão padrão é o primeiro grupo existente
  const HOURLY_VIEW_DEFAULT = HOURLY_GROUPS.length ? HOURLY_GROUPS[0].key : null;
  const HOURLY_VIEW_VALUES = new Set(HOURLY_GROUPS.map(group => group.key));
  const HOURLY_VIEW_SELECT_ID = 'hourlyEngagementViewSelect';
  // <<< Patch novo

  let cachedProcesses = [];
  let cachedStatusHistory = {};
  let cachedNotifications = [];
  let cachedSigadaer = [];
  let cachedOpinions = [];

  function el(id) {
    return document.getElementById(id);
  }

  function init() {
    const yearSelect = el('entryYearSelect');
    yearSelect?.addEventListener('change', () => {
      renderEntryChart();
      renderOverview();
      renderYearlyActivity();
      renderHourlyEngagement();
    });

    // >>> Patch novo: seletor de visão do gráfico horário (se existir no HTML)
    const hourlyViewSelect = el(HOURLY_VIEW_SELECT_ID);
    hourlyViewSelect?.addEventListener('change', () => {
      renderHourlyEngagement();
    });
    // <<< Patch novo
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
    if (typeof value === 'number' && Number.isFinite(value)) {
      node.textContent = YEARLY_COUNTER_FORMATTER.format(value);
    } else {
      node.textContent = '—';
    }
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

    const totalCount = counts.reduce((sum, value) => sum + value, 0);
    setEntryYearTotal(totalCount);

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
          if (startYear !== year || endYear !== year) continue;

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
        const receivedValue = opinion.received_at || opinion.receb_at; // tolerante a nome alternativo
        if (!receivedValue) return;

        const startDate = new Date(opinion.requested_at);
        const endDate = new Date(receivedValue);
        if (Number.isNaN(+startDate) || Number.isNaN(+endDate)) return;
        if (startDate.getFullYear() !== year || endDate.getFullYear() !== year) return;

        const days = Utils.daysBetween(startDate, endDate);
        if (typeof days !== 'number' || Number.isNaN(days)) return;

        const bucket = opinionAgg[type] || (opinionAgg[type] = { sum: 0, n: 0 });
        bucket.sum += days;
        bucket.n += 1;
      });
    }

    const getOpinionAverage = (type) => {
      const entry = opinionAgg[type];
      if (!entry || !entry.n) return null;
      const avg = entry.sum / entry.n;
      return Number.isFinite(avg) ? avg : null;
    };
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
          const avg = getOpinionAverage(type);
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
      sigadaerPref: el('dashboardMetricSigadaerPref') // PREF: Prefeitura
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
        if (Number.isNaN(+startDate) || startDate.getFullYear() !== year) continue;

        if (cur.status === 'ANADOC') counters.anadoc += 1;
        if (cur.status === 'ANATEC-PRE') counters.anatecPre += 1;
        if (cur.status === 'ANATEC') counters.anatec += 1;
      }
    });

    // Notificações: contam pela data efetiva do pedido
    (cachedNotifications || []).forEach(notification => {
      if (!notification) return;
      const { requested_at: requestedAt } = notification;
      if (!requestedAt) return;

      const requestedDate = new Date(requestedAt);
      if (!Number.isNaN(+requestedDate) && requestedDate.getFullYear() === year) {
        counters.notifications += 1;
      }
    });

    // SIGADAER: contam quando EXPEDIDO, pela data de expedição (expedit_at)
    (cachedSigadaer || []).forEach(sigadaer => {
      if (!sigadaer) return;
      const { type, status, expedit_at: expeditAt } = sigadaer;
      if (!expeditAt || status !== 'EXPEDIDO') return;

      const expeditDate = new Date(expeditAt);
      if (Number.isNaN(+expeditDate) || expeditDate.getFullYear() !== year) return;

      const normalizedType = typeof type === 'string' ? type.toUpperCase() : '';
      if (normalizedType === 'JJAER') counters.sigadaerJjaer += 1;
      if (normalizedType === 'AGU') counters.sigadaerAgu += 1;
      if (normalizedType === 'PREF') counters.sigadaerPref += 1; // incluído
    });

    Object.entries(metricEls).forEach(([key, node]) => {
      if (!node) return;
      node.textContent = YEARLY_COUNTER_FORMATTER.format(counters[key] || 0);
    });
  }

  function renderHourlyEngagementEmpty(message = 'Nenhum dado para exibir.') {
    const container = el('hourlyEngagementChart');
    if (!container) return;
    container.innerHTML = '';
    const msg = document.createElement('p');
    msg.className = 'muted chart-placeholder';
    msg.textContent = message;
    container.appendChild(msg);
  }

  // >>> Patch novo: suporte a múltiplas visões do gráfico horário
  function getSelectedHourlyView() {
    const select = el(HOURLY_VIEW_SELECT_ID);
    if (!select) return HOURLY_VIEW_DEFAULT;
    const { value } = select;
    if (HOURLY_VIEW_VALUES.has(value)) return value;
    return HOURLY_VIEW_DEFAULT;
  }

  function determineHourlyGroupKey(date) {
    const day = date.getDay();
    if (day >= 1 && day <= 4) return 'monThu';
    if (day === 5) return 'friday';
    if (day === 0 || day === 6) return 'weekend';
    return null;
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

    (cachedSigadaer || []).forEach(item => {
      if (!item) return;
      if (item.requested_at) registerDate(item.requested_at);
      if (item.status === 'EXPEDIDO' && item.expedit_at) registerDate(item.expedit_at);
    });

    (cachedOpinions || []).forEach(opinion => {
      if (!opinion) return;
      const type = typeof opinion.type === 'string' ? opinion.type.toUpperCase() : '';
      if (!OPINION_TYPES_SET.has(type)) return;
      if (opinion.requested_at) registerDate(opinion.requested_at);
    });

    const totals = {};
    const offHoursByGroup = {};
    let overallTotal = 0;

    HOURLY_GROUPS.forEach(group => {
      const list = groups[group.key] || [];
      const groupTotal = list.reduce((sum, value) => sum + value, 0);
      totals[group.key] = groupTotal;
      overallTotal += groupTotal;
      offHoursByGroup[group.key] = list.reduce((sum, value, hour) => (
        group.offHours(hour) ? sum + value : sum
      ), 0);
    });

    return { groups, totals, overallTotal, offHoursByGroup };
  }

  // (removido pelo patch) renderUnifiedHourlyView

  function renderSingleHourlyView(container, data, group) {
    const { overallTotal } = data;
    const bars = document.createElement('div');
    bars.className = 'bar-chart-bars';
    bars.style.gridTemplateColumns = 'repeat(24, minmax(0, 1fr))';

    const counts = data.groups[group.key] || [];
    const percents = counts.map(value => (overallTotal ? (value / overallTotal) * 100 : 0));
    const maxPercent = percents.reduce((max, value) => (value > max ? value : max), 0);

    counts.forEach((value, hour) => {
      const percent = percents[hour] || 0;
      const item = document.createElement('div');
      item.className = 'bar-chart-item';

      const isOffHours = group.offHours(hour);
      const barColorClass = group.key === 'weekend' ? 'red' : (isOffHours ? 'red' : group.defaultBarClass);
      const valueColorClass = barColorClass;
      const labelColorClass = group.key === 'weekend' ? 'red' : (isOffHours ? 'red' : 'black');

      const valueNode = document.createElement('span');
      valueNode.className = `bar-chart-value ${valueColorClass}`;
      valueNode.textContent = `${PERCENTAGE_FORMATTER.format(percent)}%`;

      const wrapper = document.createElement('div');
      wrapper.className = 'bar-chart-bar-wrapper';

      const bar = document.createElement('div');
      bar.className = `bar-chart-bar ${barColorClass}`;
      let heightPercent = maxPercent ? (percent / maxPercent) * 100 : 0;
      if (percent > 0 && heightPercent < 8) heightPercent = 8;
      bar.style.height = `${heightPercent}%`;
      bar.title = `${group.label} — ${String(hour).padStart(2, '0')}h: ${value} evento(s) (${PERCENTAGE_FORMATTER.format(percent)}%)`;

      wrapper.appendChild(bar);

      const label = document.createElement('span');
      label.className = `bar-chart-label ${labelColorClass}`;
      label.textContent = `${String(hour).padStart(2, '0')}h`;

      item.appendChild(valueNode);
      item.appendChild(wrapper);
      item.appendChild(label);
      bars.appendChild(item);
    });

    container.appendChild(bars);
  }

  function appendHourlySummary(container, data) {
    const offHoursTotal = HOURLY_GROUPS.reduce((sum, group) => sum + (data.offHoursByGroup[group.key] || 0), 0);
    const offHoursPercent = data.overallTotal ? (offHoursTotal / data.overallTotal) * 100 : 0;

    const summary = document.createElement('div');
    summary.className = 'hourly-engagement-summary';

    const summaryLabel = document.createElement('span');
    summaryLabel.className = 'hourly-engagement-summary-label';
    summaryLabel.textContent = 'Fora do expediente';

    const summaryValue = document.createElement('strong');
    summaryValue.className = 'hourly-engagement-summary-value';
    summaryValue.textContent = `${PERCENTAGE_FORMATTER.format(offHoursPercent)}%`;

    summary.appendChild(summaryLabel);
    summary.appendChild(summaryValue);
    container.appendChild(summary);
  }
  // <<< Patch novo

  function renderHourlyEngagement() {
    const container = el('hourlyEngagementChart');
    if (!container) return;

    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    if (!Number.isFinite(year)) {
      renderHourlyEngagementEmpty('Nenhum dado para exibir.');
      return;
    }

    // >>> Patch novo: calcula dados por grupos e renderiza conforme a visão escolhida
    const data = computeHourlyEngagementData(year);
    if (!data.overallTotal) {
      renderHourlyEngagementEmpty('Nenhum evento registrado para o ano selecionado.');
      return;
    }

    container.innerHTML = '';
    const view = getSelectedHourlyView();
    if (view && HOURLY_GROUP_MAP[view]) {
      renderSingleHourlyView(container, data, HOURLY_GROUP_MAP[view]);
    } else if (HOURLY_VIEW_DEFAULT && HOURLY_GROUP_MAP[HOURLY_VIEW_DEFAULT]) {
      renderSingleHourlyView(container, data, HOURLY_GROUP_MAP[HOURLY_VIEW_DEFAULT]);
    }

    appendHourlySummary(container, data);
    // <<< Patch novo
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

    const { data: procs } = await sb
      .from('processes')
      .select('id,status,status_since,first_entry_date');

    cachedProcesses = procs || [];
    const hasYears = updateYearOptions();
    if (hasYears) renderEntryChart();
    else renderEntryChartEmpty('Nenhum dado para exibir.');

    const { data: notifications } = await sb
      .from('notifications')
      .select('requested_at, read_at');
    cachedNotifications = notifications || [];

    const { data: sigadaer } = await sb
      .from('sigadaer')
      .select('type, status, requested_at, expedit_at');
    cachedSigadaer = sigadaer || [];

    // >>> Patch: incluir received_at para calcular médias
    const { data: opinions } = await sb
      .from('internal_opinions')
      .select('type, requested_at, received_at');
    // <<< Patch
    cachedOpinions = opinions || [];

    // Velocidade média — montar histórico de status por processo (usando 'history')
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
        if (!item || !item.process_id) return;
        let det = item.details || {};
        if (typeof det === 'string') {
          try { det = JSON.parse(det); } catch (_) { det = {}; }
        }
        const status = det?.status;
        let start = det?.status_since || det?.start || item.created_at;
        if (!status || !start) return;
        const list = byProc[item.process_id] || (byProc[item.process_id] = []);
        list.push({ status, start });
      });
    }

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
    renderYearlyActivity();
    renderHourlyEngagement();

    if (yearSelect) yearSelect.disabled = false;
  }

  return { init, load };
})();
