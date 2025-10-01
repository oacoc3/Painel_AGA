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

  let cachedProcesses = [];
  let cachedStatusHistory = {};
  let cachedNotifications = [];
  let cachedSigadaer = [];
  let cachedOpinions = [];

  // =========================
  // Helpers de datas do patch
  // =========================
  function parseDateValue(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(+value) ? null : value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const dt = new Date(value);
      return Number.isNaN(+dt) ? null : dt;
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const dateOnly = Utils.dateOnly(trimmed);
      return dateOnly && !Number.isNaN(+dateOnly) ? dateOnly : null;
    }
    const dt = new Date(trimmed);
    return Number.isNaN(+dt) ? null : dt;
  }

  function normalizeDateInput(value) {
    const dt = parseDateValue(value);
    return dt ? dt.toISOString() : null;
  }

  function getDateKeyWeight(key) {
    const lower = String(key || '').toLowerCase();
    if (!lower || lower.includes('due')) return 0;
    if (lower.includes('created_at') || lower.includes('updated_at')) return 0;
    if (lower.includes('status') && lower.includes('since')) return 100;
    if (lower.includes('status') && (lower.includes('desde') || lower.includes('início') || lower.includes('inicio'))) return 95;
    if (lower.includes('start') && !lower.includes('started_by')) return 90;
    if (lower.includes('evento') || lower.includes('event')) return 80;
    if (lower.includes('data_hora')) return 75;
    if (lower.includes('data') && (
      lower.includes('receb') ||
      lower.includes('termin') ||
      lower.includes('leitur') ||
      lower.includes('inser') ||
      lower.includes('exped') ||
      lower.includes('public')
    )) return 70;
    if (lower.endsWith('_at')) return 60;
    if (lower.includes('data')) return 50;
    if (lower.includes('date')) return 40;
    return 0;
  }

  function extractEventDate(details) {
    if (!details || typeof details !== 'object') return null;
    const queue = [details];
    const seen = new Set();
    let best = null;

    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;
      if (seen.has(current)) continue;
      seen.add(current);

      const entries = Array.isArray(current)
        ? current.map((value, index) => [String(index), value])
        : Object.entries(current);

      entries.forEach(([key, value]) => {
        if (value && typeof value === 'object') {
          queue.push(value);
        }
        const weight = getDateKeyWeight(key);
        if (!weight) return;

        const parsed = parseDateValue(value);
        if (!parsed) return;

        if (!best || weight > best.weight || (weight === best.weight && parsed < best.date)) {
          best = { date: parsed, weight };
        }
      });
    }

    return best ? best.date : null;
  }

  // =========================

  function init() {
    const yearSelect = el('entryYearSelect');
    yearSelect?.addEventListener('change', () => {
      renderEntryChart();
      renderOverview();
      renderYearlyActivity();
      renderHourlyEngagement();
    });
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
    const now = new Date();
    if (hasYear) {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year + 1, 0, 1);
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
          if (startDate < yearStart || startDate >= yearEnd) continue;

          const next = list[i + 1];
          const endDate = next && next.start ? new Date(next.start) : now;
          if (Number.isNaN(+endDate)) continue;

          const boundedEnd = endDate > yearEnd ? yearEnd : endDate;
          if (boundedEnd <= startDate) continue;

          const days = Utils.daysBetween(startDate, boundedEnd);
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
    const items = ringStatuses.map(s => {
      const label = STATUS_LABELS[s] || s;
      return {
        status: s,
        label,
        count: countMap[s] || 0,
        avg: agg[s] ? (agg[s].sum / agg[s].n) : null,
        ariaLabel: `Velocidade média de ${label}`
      };
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
      sigadaerAgu: el('dashboardMetricSigadaerAgu')
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
      sigadaerAgu: 0
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

    (cachedNotifications || []).forEach(notification => {
      if (!notification) return;
      const { requested_at: requestedAt, read_at: readAt } = notification;

      if (requestedAt) {
        const requestedDate = new Date(requestedAt);
        if (!Number.isNaN(+requestedDate) && requestedDate.getFullYear() === year) {
          counters.notifications += 1;
        }
      }

      if (readAt) {
        const readDate = new Date(readAt);
        if (!Number.isNaN(+readDate) && readDate.getFullYear() === year) {
          counters.notifications += 1;
        }
      }
    });

    (cachedSigadaer || []).forEach(sigadaer => {
      if (!sigadaer) return;
      const { type, status, expedit_at: expeditAt } = sigadaer;
      if (!expeditAt || status !== 'EXPEDIDO') return;

      const expeditDate = new Date(expeditAt);
      if (Number.isNaN(+expeditDate) || expeditDate.getFullYear() !== year) return;

      const normalizedType = typeof type === 'string' ? type.toUpperCase() : '';
      if (normalizedType === 'JJAER') counters.sigadaerJjaer += 1;
      if (normalizedType === 'AGU') counters.sigadaerAgu += 1;
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

  function renderHourlyEngagement() {
    const container = el('hourlyEngagementChart');
    if (!container) return;

    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    if (!Number.isFinite(year)) {
      renderHourlyEngagementEmpty('Nenhum dado para exibir.');
      return;
    }

    const counts = new Array(24).fill(0);

    const registerDate = dateValue => {
      if (!dateValue) return;
      const dt = dateValue instanceof Date ? dateValue : new Date(dateValue);
      if (!dt || Number.isNaN(+dt)) return;
      if (dt.getFullYear() !== year) return;
      const hour = dt.getHours();
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;
      counts[hour] += 1;
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

    const total = counts.reduce((sum, value) => sum + value, 0);
    if (!total) {
      renderHourlyEngagementEmpty('Nenhum evento registrado para o ano selecionado.');
      return;
    }

    const maxPercent = counts.reduce((max, value) => {
      const pct = (value / total) * 100;
      return pct > max ? pct : max;
    }, 0);

    container.innerHTML = '';
    const bars = document.createElement('div');
    bars.className = 'bar-chart-bars';
    bars.style.gridTemplateColumns = 'repeat(24, minmax(0, 1fr))';

    counts.forEach((value, hour) => {
      const percent = (value / total) * 100;
      const item = document.createElement('div');
      item.className = 'bar-chart-item';

      const valueNode = document.createElement('span');
      valueNode.className = 'bar-chart-value';
      valueNode.textContent = `${PERCENTAGE_FORMATTER.format(percent)}%`;

      const wrapper = document.createElement('div');
      wrapper.className = 'bar-chart-bar-wrapper';

      const bar = document.createElement('div');
      bar.className = 'bar-chart-bar';
      let heightPercent = maxPercent ? (percent / maxPercent) * 100 : 0;
      if (percent > 0 && heightPercent < 8) heightPercent = 8;
      bar.style.height = `${heightPercent}%`;
      bar.title = `${String(hour).padStart(2, '0')}h: ${value} evento(s) (${PERCENTAGE_FORMATTER.format(percent)}%)`;

      wrapper.appendChild(bar);

      const label = document.createElement('span');
      label.className = 'bar-chart-label';
      label.textContent = `${String(hour).padStart(2, '0')}h`;

      item.appendChild(valueNode);
      item.appendChild(wrapper);
      item.appendChild(label);
      bars.appendChild(item);
    });

    container.appendChild(bars);
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

    const { data: opinions } = await sb
      .from('internal_opinions')
      .select('type, requested_at');
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
        const eventDate = extractEventDate(det);
        let start = normalizeDateInput(eventDate || det?.status_since || det?.start || item.created_at);
        if (!start) start = normalizeDateInput(item.created_at);
        if (!status || !start) return;
        const list = byProc[item.process_id] || (byProc[item.process_id] = []);
        list.push({ status, start });
      });
    }

    (procs || []).forEach(proc => {
      if (!proc || !proc.id) return;
      const list = byProc[proc.id] || (byProc[proc.id] = []);
      if (proc.status && proc.status_since) {
        const normalized = normalizeDateInput(proc.status_since);
        const already = list.some(entry => entry.status === proc.status && entry.start === normalized);
        if (!already && normalized) list.push({ status: proc.status, start: normalized });
      }
      list.sort((a, b) => new Date(a.start) - new Date(b.start));
    });

    cachedStatusHistory = byProc;

    renderOverview();
    renderYearlyActivity();
    renderHourlyEngagement();
  }

  return { init, load };
})();
