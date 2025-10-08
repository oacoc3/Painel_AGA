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

  const EXCLUDED_WORKFLOW_STATUSES = new Set([
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

  const YEARLY_COUNTER_FORMATTER = new Intl.NumberFormat('pt-BR');

  const ENTRY_CHART_COLORS = [
    '#4379F2', '#FF6B6B', '#FFD93D', '#6BCB77',
    '#4D96FF', '#F26B8A', '#9D4EDD', '#00B8A9',
    '#F7B801', '#2B2D42', '#06D6A0', '#118AB2'
  ];

  const ENTRY_CHART_MAX_CATEGORIES = 12;

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
    ANATEC: 'Análise Técnica'
  };

  const OVERVIEW_ORDER = [
    'ANADOC',
    'ANATEC-PRE',
    'ANATEC',
    'CONFEC',
    'REV-OACO',
    'APROV',
    'ICA-PUB'
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function sumBy(arr, fn) {
    let total = 0;
    for (let i = 0; i < arr.length; i++) total += fn(arr[i]) || 0;
    return total;
  }

  function groupBy(arr, keyFn) {
    const map = new Map();
    for (const item of arr) {
      const key = keyFn(item);
      const list = map.get(key);
      if (list) list.push(item); else map.set(key, [item]);
    }
    return map;
  }

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function formatDateISO(d) {
    if (!d) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function monthNameShort(idx) {
    const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return names[idx] || '';
  }

  const HOURLY_GROUPS = [
    { key: 'login',    label: 'Logins' },
    { key: 'module',   label: 'Acessos a Módulos' },
    { key: 'checklist',label: 'Finalização de Checklists' }
  ];
  const HOURLY_GROUP_MAP = HOURLY_GROUPS.reduce((acc, g) => (acc[g.key]=g, acc), {});
  const HOURLY_VIEW_DEFAULT = 'login';
  const HOURLY_VIEW_VALUES = new Set(HOURLY_GROUPS.map(group => group.key));
  const HOURLY_VIEW_SELECT_ID = 'hourlyEngagementViewSelect';
  // <<< Patch novo

  let cachedProcesses = [];
  let cachedStatusHistory = {};
  let cachedNotifications = [];
  let cachedSigadaer = [];
  let cachedOpinions = [];

  function elSafeText(id, value) {
    const node = el(id);
    if (node) node.textContent = value;
  }

  function resetTextContent(ids, v = '—') {
    ids.forEach(id => elSafeText(id, v));
  }

  function renderOverviewEmpty(message) {
    elSafeText('overviewContainer', message || '—');
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

          if (startDate.getFullYear() !== year && endDate.getFullYear() !== year) continue;

          // duração em dias (aproximação)
          const ms = endDate - startDate;
          const days = ms / (1000 * 60 * 60 * 24);

          if (EXCLUDED_WORKFLOW_STATUSES.has(cur.status)) continue;

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
        const receivedValue = opinion.received_at || opinion.received_at; // pode evoluir p/ recusa etc.
        if (!receivedValue) return;

        const req = new Date(opinion.requested_at);
        const rcv = new Date(receivedValue);
        if (Number.isNaN(+req) || Number.isNaN(+rcv)) return;
        if (req.getFullYear() !== year && rcv.getFullYear() !== year) return;

        const days = (rcv - req) / (1000 * 60 * 60 * 24);
        const bucket = (opinionAgg[type] ||= { sum: 0, n: 0 });
        bucket.sum += days;
        bucket.n += 1;
      });
    }
    // <<< Patch

    // Render “visão geral” (anéis)
    const container = el('overviewContainer');
    if (!container) return;
    container.innerHTML = '';

    const items = OVERVIEW_ORDER
      .map(key => {
        const label = STATUS_LABELS[key] || key;
        const count = countMap[key] || 0;
        const avgDays = agg[key]?.n ? (agg[key].sum / agg[key].n) : null;
        return { key, label, count, avgDays };
      });

    items.forEach(item => {
      const node = document.createElement('div');
      node.className = 'ov-item';
      node.innerHTML = `
        <div class="ov-ring">
          <div class="ov-ring-count">${YEARLY_COUNTER_FORMATTER.format(item.count)}</div>
        </div>
        <div class="ov-info">
          <div class="ov-title">${item.label}</div>
          <div class="ov-meta">${item.avgDays != null ? `${item.avgDays.toFixed(1)}d (médio)` : '—'}</div>
        </div>
      `;
      container.appendChild(node);
    });

    // >>> Patch: render médias de pareceres (ATM/DT)
    const opinionsContainer = el('opinionAveragesContainer');
    if (opinionsContainer) {
      opinionsContainer.innerHTML = '';
      OPINION_AVERAGE_TYPES.forEach(type => {
        const aggType = opinionAgg[type];
        const avg = aggType?.n ? (aggType.sum / aggType.n) : null;
        const card = document.createElement('div');
        card.className = 'ov-item opinion';
        card.innerHTML = `
          <div class="ov-ring small">
            <div class="ov-ring-count">${avg != null ? avg.toFixed(1) : '—'}</div>
          </div>
          <div class="ov-info">
            <div class="ov-title">${OPINION_LABELS[type]}</div>
            <div class="ov-meta">${avg != null ? 'dias (médio)' : '—'}</div>
          </div>
        `;
        opinionsContainer.appendChild(card);
      });
    }
    // <<< Patch
  }

  function renderEntryChartEmpty(msg) {
    const node = el('entryChart');
    if (!node) return;
    node.innerHTML = `<div class="empty">${msg || '—'}</div>`;
  }

  function renderEntryChart() {
    const node = el('entryChart');
    if (!node) return;

    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    if (!Number.isFinite(year)) {
      renderEntryChartEmpty('Selecione um ano.');
      return;
    }

    const items = (cachedProcesses || [])
      .filter(proc => {
        if (!proc || !proc.first_entry_date) return false;
        const d = Utils.dateOnly(proc.first_entry_date);
        if (!d || Number.isNaN(+d)) return false;
        return d.getFullYear() === year;
      })
      .map(proc => ({
        id: proc.id,
        type: proc.type,
        date: Utils.dateOnly(proc.first_entry_date)
      }));

    if (!items.length) {
      renderEntryChartEmpty('Nenhum dado para exibir.');
      return;
    }

    // agrupar por mês e tipo
    const groups = groupBy(items, it => `${it.date.getFullYear()}-${it.date.getMonth()}`);
    const months = unique(items.map(it => it.date.getMonth())).sort((a, b) => a - b);
    const types = unique(items.map(it => it.type || '—')).slice(0, ENTRY_CHART_MAX_CATEGORIES);

    const header = ['Mês', ...types.map(String)];
    const rows = months.map(m => {
      const key = `${year}-${m}`;
      const list = groups.get(key) || [];
      const byType = groupBy(list, it => it.type || '—');
      const row = [monthNameShort(m)];
      types.forEach(t => row.push((byType.get(t) || []).length));
      return row;
    });

    // desenhar (sem lib externa; placeholder simples)
    const table = document.createElement('table');
    table.className = 'chart-table';
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    const trh = document.createElement('tr');
    header.forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);

    rows.forEach(r => {
      const tr = document.createElement('tr');
      r.forEach((c, idx) => {
        const td = document.createElement('td');
        td.textContent = idx === 0 ? c : YEARLY_COUNTER_FORMATTER.format(c);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    node.innerHTML = '';
    node.appendChild(table);
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

    // >>> IMPORTANTE: contamos o "evento de entrada no status" pelo HISTÓRICO
    // Uma vez por processo/ano — sem depender do status ATUAL.
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

    // Notificações (tabela notifications): contam pela data da solicitação
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

  function renderHourlyEngagementEmpty(msg) {
    const node = el('hourlyEngagement');
    if (!node) return;
    node.innerHTML = `<div class="empty">${msg || '—'}</div>`;
  }

  function renderSingleHourlyView(container, data, group) {
    const block = document.createElement('div');
    block.className = 'hourly-block';

    const title = document.createElement('div');
    title.className = 'hourly-title';
    title.textContent = group.label;
    block.appendChild(title);

    const table = document.createElement('table');
    table.className = 'hourly-table';

    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    ['Hora', 'Qtd.'].forEach(h => {
      const th = document.createElement('th');
      th.textContent = h;
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let h = 0; h < 24; h++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = `${String(h).padStart(2, '0')}:00`;
      tr.appendChild(th);

      const td = document.createElement('td');
      td.textContent = YEARLY_COUNTER_FORMATTER.format(data[h] || 0);
      tr.appendChild(td);

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    block.appendChild(table);

    container.appendChild(block);
  }

  function appendHourlySummary(container, data) {
    const total = sumBy(Object.keys(data), h => data[h] || 0);
    const node = document.createElement('div');
    node.className = 'hourly-summary';
    node.textContent = `Total no período: ${YEARLY_COUNTER_FORMATTER.format(total)}`;
    container.appendChild(node);
  }

  function renderHourlyEngagement() {
    const container = el('hourlyEngagement');
    if (!container) return;

    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    if (!Number.isFinite(year)) {
      renderHourlyEngagementEmpty('Selecione um ano.');
      return;
    }

    container.innerHTML = '';

    // selector de visão
    let view = (el(HOURLY_VIEW_SELECT_ID)?.value) || HOURLY_VIEW_DEFAULT;
    if (!HOURLY_VIEW_VALUES.has(view)) view = HOURLY_VIEW_DEFAULT;

    // dados mockados/placeholder — substitua quando integrar sua audit table
    const loginHours = {};
    const moduleHours = {};
    const checklistHours = {};

    // Para exemplo, usamos primeiro status_since como “evento”
    (cachedProcesses || []).forEach(proc => {
      if (!proc || !proc.status_since) return;
      const d = new Date(proc.status_since);
      if (Number.isNaN(+d) || d.getFullYear() !== year) return;
      const h = d.getHours();
      loginHours[h] = (loginHours[h] || 0) + 1;
      moduleHours[h] = (moduleHours[h] || 0) + 0;
      checklistHours[h] = (checklistHours[h] || 0) + 0;
    });

    const dataMap = {
      login: loginHours,
      module: moduleHours,
      checklist: checklistHours
    };

    renderSingleHourlyView(container, dataMap[view] || {}, HOURLY_GROUP_MAP[view]);

    if (view !== HOURLY_VIEW_DEFAULT) {
      renderSingleHourlyView(container, dataMap[HOURLY_VIEW_DEFAULT] || {}, HOURLY_GROUP_MAP[HOURLY_VIEW_DEFAULT]);
    }

    appendHourlySummary(container, dataMap[view] || {});
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

    const sb = window.sb;
    const { data: procs } = await sb
      .from('processes')
      .select('id,type,status,status_since,first_entry_date')
      .order('first_entry_date', { ascending: true });

    cachedProcesses = procs || [];

    // popular seletor de anos
    const years = unique(
      (cachedProcesses || [])
        .map(proc => proc.first_entry_date)
        .filter(Boolean)
        .map(date => (Utils.dateOnly(date) || {}).getFullYear?.())
        .filter(y => Number.isFinite(y))
    ).sort((a, b) => a - b);

    const selectNode = el('entryYearSelect');
    if (selectNode) {
      selectNode.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    }

    const hasYears = years.length > 0;
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
      renderEntryChart();
      renderOverview();
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
