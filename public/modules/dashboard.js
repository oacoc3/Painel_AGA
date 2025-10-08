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
      defaultBarClass: 'red',
      offHours: () => true
    }
  ];

  const HOURLY_GROUP_MAP = HOURLY_GROUPS.reduce((acc, group) => {
    acc[group.key] = group;
    return acc;
  }, {});
  const HOURLY_VIEW_DEFAULT = 'monThu';
  const HOURLY_VIEW_VALUES = new Set(HOURLY_GROUPS.map(g => g.key));
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

  function updateYearOptions() {
    const select = el('entryYearSelect');
    if (!select) return false;

    const years = unique(
      (cachedProcesses || [])
        .map(proc => proc.first_entry_date)
        .filter(Boolean)
        .map(date => (Utils.dateOnly(date) || {}).getFullYear?.())
        .filter(y => Number.isFinite(y))
    ).sort((a, b) => a - b);

    if (!years.length) return false;
    select.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    return true;
  }

  function renderEntryChart() {
    const container = el('entryChart');
    if (!container) return;

    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    if (!Number.isFinite(year)) {
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

    // descobrir tipos presentes
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
          if (startYear !== year) continue; // conta etapas que começam no ano

          const days = Utils.daysBetween(startDate, endDate);
          if (typeof days !== 'number' || Number.isNaN(days)) continue;

          agg[cur.status] = agg[cur.status] || { sum: 0, n: 0 };
          agg[cur.status].sum += days;
          agg[cur.status].n += 1;
        }
      });
    }

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

    // >>> FIX Atividades: contar OCORRÊNCIAS no ano (permite múltiplas por processo),
    // eliminando apenas duplicatas idênticas consecutivas (mesmo status/mesmo start)
    Object.values(cachedStatusHistory || {}).forEach(list => {
      if (!Array.isArray(list)) return;
      for (let i = 0; i < list.length; i++) {
        const cur = list[i];
        if (!cur || !cur.start || !cur.status) continue;

        // eliminar duplicata consecutiva idêntica
        if (i > 0) {
          const prev = list[i - 1];
          if (prev && prev.start === cur.start && prev.status === cur.status) continue;
        }

        const d = new Date(cur.start);
        if (Number.isNaN(+d) || d.getFullYear() !== year) continue;

        if (cur.status === 'ANADOC')     counters.anadoc += 1;
        if (cur.status === 'ANATEC-PRE') counters.anatecPre += 1;
        if (cur.status === 'ANATEC')     counters.anatec += 1;
      }
    });
    // <<< FIX

    // Notificações: contam pela data da solicitação
    (cachedNotifications || []).forEach(notification => {
      if (!notification) return;
      const { requested_at: requestedAt } = notification;
      if (!requestedAt) return;

      const requestedDate = new Date(requestedAt);
      if (!Number.isNaN(+requestedDate) && requestedDate.getFullYear() === year) {
        counters.notifications += 1;
      }
    });

    // SIGADAER: contam quando EXPEDIDO (expedit_at)
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

  function getSelectedHourlyView() {
    const select = el(HOURLY_VIEW_SELECT_ID);
    if (!select) return HOURLY_VIEW_DEFAULT;
    const { value } = select;
    if (HOURLY_VIEW_VALUES.has(value)) return value;
    return HOURLY_VIEW_DEFAULT;
  }

  function determineHourlyGroupKey(date) {
    const dow = date.getDay();
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
      groups[group.key][hour] += 1;
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

    const overallTotal = HOURLY_GROUPS.reduce((sum, g) => sum + groups[g.key].reduce((s, v) => s + v, 0), 0);
    const offHoursByGroup = {};
    HOURLY_GROUPS.forEach(group => {
      offHoursByGroup[group.key] = groups[group.key].reduce((sum, v, hour) =>
        sum + (group.offHours(hour) ? v : 0), 0);
    });

    return { groups, overallTotal, offHoursByGroup };
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

    const view = getSelectedHourlyView();
    const group = HOURLY_GROUP_MAP[view];

    const block = document.createElement('div');
    block.className = 'hourly-block';

    const title = document.createElement('div');
    title.className = 'hourly-title';
    title.textContent = `Distribuição por hora — ${group.label}`;
    block.appendChild(title);

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

  // >>> correção: precisa ser async e declarar sb
  async function load() {
    const sb = window.sb;
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
      .select('id,type,status,status_since,first_entry_date');

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

    // (REMOVIDO: consulta a internal_opinions/received_at — não é necessária para Atividades)

    // histórico (tabela history, ação "Status atualizado")
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

    // incluir status atual na sequência
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

  function init() {
    const yearSelect = el('entryYearSelect');
    yearSelect?.addEventListener('change', () => {
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
