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
    ANAICA: 'Análise ICA'
  };

  // Helpers
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = id => document.getElementById(id);
  const toInt = v => (v == null ? 0 : parseInt(v, 10) || 0);

  // Cache local
  const CACHE = {
    statusHistory: null,      // { [process_id]: [{ status, start, end }...] }
    notifications: null,      // [{ requested_at, ... }]
    sigadaer: null,           // [{ type, status, expedit_at, ...}]
    profiles: null,           // perfis p/ méd. pareceres
    opinions: null            // pareceres p/ méd. ATM/DT
  };

  // ==========================
  // Inicialização
  // ==========================
  async function init() {
    // Elementos
    bindYearSelects();
    bindReloadButtons();
    bindOpinionAverageControls();

    // Carrega dados iniciais (em paralelo)
    await Promise.allSettled([
      loadStatusHistory(),
      loadNotifications(),
      loadSigadaer(),
      loadProfiles(),
      loadOpinions()
    ]);

    // Preenche tudo
    renderStatusRings();
    renderSpeedBars();
    renderYearCounters();
    renderNotificationCounters();
    renderSigadaerCounters();
    renderOpinionAverages();
    renderHourlyHeatmap();
  }

  function bindYearSelects() {
    qsa('[data-dashboard-year-select]').forEach(sel => {
      sel.addEventListener('change', () => {
        renderYearCounters();
        renderNotificationCounters();
        renderSigadaerCounters();
        renderOpinionAverages();
        renderHourlyHeatmap();
        renderSpeedBars();
      });
    });
  }

  function currentSelectedYear() {
    const sel = qs('[data-dashboard-year-select]');
    const y = sel && sel.value ? Number(sel.value) : NaN;
    return Number.isFinite(y) ? y : (new Date()).getFullYear();
  }

  function bindReloadButtons() {
    qsa('[data-dashboard-reload]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await Promise.allSettled([
          loadStatusHistory(true),
          loadNotifications(true),
          loadSigadaer(true),
          loadProfiles(true),
          loadOpinions(true)
        ]);
        renderStatusRings();
        renderSpeedBars();
        renderYearCounters();
        renderNotificationCounters();
        renderSigadaerCounters();
        renderOpinionAverages();
        renderHourlyHeatmap();
      });
    });
  }

  // ==========================
  // Carregamento de dados
  // ==========================
  async function loadStatusHistory(force = false) {
    if (CACHE.statusHistory && !force) return CACHE.statusHistory;
    try {
      const { data, error } = await window.sb
        .from('history')
        .select('process_id, action, from_status, to_status, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;

      // Transforma em { process_id: [{ status, start, end }...] }
      const perProcess = {};
      for (const row of data || []) {
        const procId = row.process_id;
        const toStatus = (row.to_status || '').trim();
        if (!DASHBOARD_STATUSES.includes(toStatus)) continue;

        if (!perProcess[procId]) perProcess[procId] = [];
        perProcess[procId].push({
          status: toStatus,
          start: row.created_at,
          end: null
        });
      }
      // Marca 'end' como início do próximo status do mesmo processo
      for (const procId of Object.keys(perProcess)) {
        const arr = perProcess[procId];
        for (let i = 0; i < arr.length - 1; i++) {
          arr[i].end = arr[i + 1].start;
        }
      }

      CACHE.statusHistory = perProcess;
      return perProcess;
    } catch (err) {
      console.error('[dashboard] loadStatusHistory erro:', err);
      CACHE.statusHistory = {};
      return {};
    }
  }

  async function loadNotifications(force = false) {
    if (CACHE.notifications && !force) return CACHE.notifications;
    try {
      const { data, error } = await window.sb
        .from('notifications')
        .select('id, process_id, requested_at')
        .order('requested_at', { ascending: true });
      if (error) throw error;
      CACHE.notifications = data || [];
      return CACHE.notifications;
    } catch (err) {
      console.error('[dashboard] loadNotifications erro:', err);
      CACHE.notifications = [];
      return [];
    }
  }

  async function loadSigadaer(force = false) {
    if (CACHE.sigadaer && !force) return CACHE.sigadaer;
    try {
      const { data, error } = await window.sb
        .from('sigadaer')
        .select('id, process_id, type, status, expedit_at')
        .order('expedit_at', { ascending: true });
      if (error) throw error;
      CACHE.sigadaer = data || [];
      return CACHE.sigadaer;
    } catch (err) {
      console.error('[dashboard] loadSigadaer erro:', err);
      CACHE.sigadaer = [];
      return [];
    }
  }

  async function loadProfiles(force = false) {
    if (CACHE.profiles && !force) return CACHE.profiles;
    try {
      const { data, error } = await window.sb
        .rpc('admin_list_profiles');
      if (error) throw error;
      CACHE.profiles = data || [];
      return CACHE.profiles;
    } catch (err) {
      console.error('[dashboard] loadProfiles erro:', err);
      CACHE.profiles = [];
      return [];
    }
  }

  async function loadOpinions(force = false) {
    if (CACHE.opinions && !force) return CACHE.opinions;
    try {
      const { data, error } = await window.sb
        .from('internal_opinions')
        .select('id, type, status, created_at, profile_id');
      if (error) throw error;
      CACHE.opinions = data || [];
      return CACHE.opinions;
    } catch (err) {
      console.error('[dashboard] loadOpinions erro:', err);
      CACHE.opinions = [];
      return [];
    }
  }

  // ==========================
  // Renderizações
  // ==========================
  function renderStatusRings() {
    // Exemplo: usa CACHE.statusHistory + STATUS_LABELS
    // (A lógica dos anéis foi mantida; estados excluídos em EXCLUDED_RING_STATUSES)
    const container = el('statusRings');
    if (!container) return;
    container.innerHTML = '';
    const history = CACHE.statusHistory || {};

    const counts = {};
    for (const list of Object.values(history)) {
      for (const item of list) {
        const st = item.status;
        if (EXCLUDED_RING_STATUSES.has(st)) continue;
        counts[st] = (counts[st] || 0) + 1;
      }
    }

    const frag = document.createDocumentFragment();
    for (const st of SPEED_STATUS_ORDER) {
      if (counts[st] == null) continue;
      const card = document.createElement('div');
      card.className = 'ring';
      card.innerHTML = `
        <div class="ring-value">${counts[st]}</div>
        <div class="ring-label">${STATUS_LABELS[st] || st}</div>
      `;
      frag.appendChild(card);
    }
    container.appendChild(frag);
  }

  function renderSpeedBars() {
    const container = el('speedBars');
    if (!container) return;
    container.innerHTML = '';

    const history = CACHE.statusHistory || {};
    const order = SPEED_STATUS_ORDER;

    // Conta quantas transições existem por status (exclui os ring-excluded)
    const counts = {};
    for (const arr of Object.values(history)) {
      for (const item of arr) {
        const st = item.status;
        if (EXCLUDED_RING_STATUSES.has(st)) continue;
        counts[st] = (counts[st] || 0) + 1;
      }
    }

    const frag = document.createDocumentFragment();
    for (const st of order) {
      const val = counts[st] || 0;
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = `
        <div class="bar-label">${STATUS_LABELS[st] || st}</div>
        <div class="bar"><span class="bar-fill" style="width:${Math.min(100, val)}%"></span></div>
        <div class="bar-value">${val}</div>
      `;
      frag.appendChild(row);
    }
    container.appendChild(frag);
  }

  function renderYearCounters() {
    // Contadores por ano: ANADOC, ANATEC-PRE, ANATEC
    const select = qs('[data-dashboard-year-select]');
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

    // >>> Regra: contar cada início de status no ano, removendo só duplicatas exatas
    // A deduplicação é por (processo | status | data/hora) APENAS para ANADOC/ANATEC-PRE/ANATEC
    const trackedStatusSets = {
      ANADOC: new Set(),
      'ANATEC-PRE': new Set(),
      ANATEC: new Set()
    };

    const cachedStatusHistory = CACHE.statusHistory || {};
    Object.entries(cachedStatusHistory).forEach(([procId, events]) => {
      (events || []).forEach(ev => {
        if (!ev) return;
        const status = ev.status;
        if (!(status in trackedStatusSets)) return;

        const { start } = ev;
        const startDate = new Date(start);
        if (Number.isNaN(+startDate) || startDate.getFullYear() !== year) return;

        const timestamp = startDate.getTime();
        // >>> Ajuste: chave inclui processo | status | timestamp
        const dedupeKey = `${procId}__${status}__${timestamp}`;
        trackedStatusSets[status].add(dedupeKey);
      });
    });

    counters.anadoc = trackedStatusSets.ANADOC.size;
    counters.anatecPre = trackedStatusSets['ANATEC-PRE'].size;
    counters.anatec = trackedStatusSets.ANATEC.size;
    // <<< Regra

    // Notificações: contam pela data efetiva do pedido
    const cachedNotifications = CACHE.notifications || [];
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
    const cachedSigadaer = CACHE.sigadaer || [];
    (cachedSigadaer || []).forEach(sigadaer => {
      if (!sigadaer) return;
      const { type, status, expedit_at: expeditAt } = sigadaer;
      if (!expeditAt || status !== 'EXPEDIDO') return;

      const expDate = new Date(expeditAt);
      if (Number.isNaN(+expDate) || expDate.getFullYear() !== year) return;

      if (type === 'JJAER') counters.sigadaerJjaer += 1;
      else if (type === 'AGU') counters.sigadaerAgu += 1;
      else if (type === 'PREF') counters.sigadaerPref += 1;
    });

    // Atualiza UI
    setText('anadocYearCount', counters.anadoc);
    setText('anatecPreYearCount', counters.anatecPre);
    setText('anatecYearCount', counters.anatec);
    setText('notificationsYearCount', counters.notifications);
    setText('sigadaerJjaerYearCount', counters.sigadaerJjaer);
    setText('sigadaerAguYearCount', counters.sigadaerAgu);
    setText('sigadaerPrefYearCount', counters.sigadaerPref);
  }

  function setText(id, val) {
    const node = el(id);
    if (!node) return;
    node.textContent = String(val == null ? '' : val);
  }

  function renderNotificationCounters() {
    const year = currentSelectedYear();
    const cached = CACHE.notifications || [];

    let total = 0;
    for (const n of cached) {
      if (!n || !n.requested_at) continue;
      const d = new Date(n.requested_at);
      if (!Number.isNaN(+d) && d.getFullYear() === year) total += 1;
    }
    setText('notificationsYearCount', total);
  }

  function renderSigadaerCounters() {
    const year = currentSelectedYear();
    const cached = CACHE.sigadaer || [];
    let jjaer = 0, agu = 0, pref = 0;

    for (const s of cached) {
      if (!s || !s.expedit_at || s.status !== 'EXPEDIDO') continue;
      const d = new Date(s.expedit_at);
      if (Number.isNaN(+d) || d.getFullYear() !== year) continue;
      if (s.type === 'JJAER') jjaer++;
      else if (s.type === 'AGU') agu++;
      else if (s.type === 'PREF') pref++;
    }
    setText('sigadaerJjaerYearCount', jjaer);
    setText('sigadaerAguYearCount', agu);
    setText('sigadaerPrefYearCount', pref);
  }

  // ==========================
  // Médias de pareceres (ATM/DT)
  // ==========================
  function bindOpinionAverageControls() {
    const btn = el('opinionAverageReload');
    if (btn) btn.addEventListener('click', renderOpinionAverages);
  }

  function renderOpinionAverages() {
    const year = currentSelectedYear();
    const opinions = CACHE.opinions || [];
    const profiles = CACHE.profiles || [];

    // Mapa de perfis p/ lookup rápido
    const profileMap = new Map();
    for (const p of profiles) profileMap.set(p.id, p);

    // Filtra apenas ATM e DT aprovados/concluídos no ano (status 'APROVADO' ou 'CONCLUIDO', por exemplo)
    const isTrackedType = t => OPINION_AVERAGE_TYPES.includes(String(t || '').toUpperCase());
    const isApproved = st => ['APROVADO', 'CONCLUIDO', 'CONCLUÍDO'].includes(String(st || '').toUpperCase());

    const list = [];
    for (const op of opinions) {
      if (!op) continue;
      if (!isTrackedType(op.type)) continue;
      if (!isApproved(op.status)) continue;
      const d = new Date(op.created_at);
      if (!Number.isNaN(+d) && d.getFullYear() === year) {
        list.push(op);
      }
    }

    // Cálculo simples de média por tipo (exemplo didático)
    const acc = { ATM: { sum: 0, count: 0 }, DT: { sum: 0, count: 0 } };
    // Supondo que cada 'op' tenha um campo "score" (se não tiver, adaptar para um cálculo derivado)
    for (const op of list) {
      const type = String(op.type || '').toUpperCase();
      const score = Number(op.score || 0);
      if (!Number.isFinite(score)) continue;
      acc[type].sum += score;
      acc[type].count += 1;
    }

    const avgATM = acc.ATM.count ? (acc.ATM.sum / acc.ATM.count) : 0;
    const avgDT  = acc.DT.count ? (acc.DT.sum / acc.DT.count) : 0;

    setText('opinionAverageATM', avgATM.toFixed(2));
    setText('opinionAverageDT', avgDT.toFixed(2));
  }

  // ==========================
  // Heatmap horário (exemplo didático)
  // ==========================
  function renderHourlyHeatmap() {
    const year = currentSelectedYear();
    const container = el('hourlyHeatmap');
    if (!container) return;

    const history = CACHE.statusHistory || {};
    const hourly = {
      monday: new Array(24).fill(0),
      tuesday: new Array(24).fill(0),
      wednesday: new Array(24).fill(0),
      thursday: new Array(24).fill(0),
      friday: new Array(24).fill(0),
      weekend: new Array(24).fill(0)
    };

    Object.values(history).forEach(events => {
      (events || []).forEach(ev => {
        if (!ev || !ev.start) return;
        const d = new Date(ev.start);
        if (Number.isNaN(+d) || d.getFullYear() !== year) return;
        const hour = d.getHours();
        const dow = d.getDay(); // 0 dom ... 6 sab
        const key =
          dow === 0 || dow === 6 ? 'weekend' :
          dow === 1 ? 'monday' :
          dow === 2 ? 'tuesday' :
          dow === 3 ? 'wednesday' :
          dow === 4 ? 'thursday' :
          'friday';
        hourly[key][hour] += 1;
      });
    });

    // Render
    container.innerHTML = '';
    const groups = HOURLY_GROUPS;
    const frag = document.createDocumentFragment();

    for (const g of groups) {
      const row = document.createElement('div');
      row.className = 'bar-row';
      const series = hourly[g.key];

      const total = series.reduce((s, v) => s + v, 0);
      const width = Math.min(100, total);

      row.innerHTML = `
        <div class="bar-label">${g.label}</div>
        <div class="bar"><span class="bar-fill ${g.defaultBarClass || ''}" style="width:${width}%"></span></div>
        <div class="bar-value">${total}</div>
      `;
      frag.appendChild(row);
    }

    container.appendChild(frag);
  }

  const HOURLY_GROUPS = [
    {
      key: 'monday',
      label: 'Segunda',
      defaultBarClass: 'green',
      offHours: hour => hour < 8 || hour >= 18
    },
    {
      key: 'tuesday',
      label: 'Terça',
      defaultBarClass: 'green',
      offHours: hour => hour < 8 || hour >= 18
    },
    {
      key: 'wednesday',
      label: 'Quarta',
      defaultBarClass: 'green',
      offHours: hour => hour < 8 || hour >= 18
    },
    {
      key: 'thursday',
      label: 'Quinta',
      defaultBarClass: 'green',
      offHours: hour => hour < 8 || hour >= 18
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

  // Exemplo de cálculo de duração média por status (não alterado)
  function renderAverageDurations() {
    const container = el('averageDurations');
    if (!container) return;

    const history = CACHE.statusHistory || {};
    const durations = {}; // status -> [durations in hours]

    for (const events of Object.values(history)) {
      for (const ev of events) {
        if (!ev || !ev.start || !ev.end) continue;
        const start = new Date(ev.start);
        const end = new Date(ev.end);
        if (Number.isNaN(+start) || Number.isNaN(+end)) continue;

        const diffMs = +end - +start;
        if (diffMs <= 0) continue;

        const hours = diffMs / 36e5;
        if (!durations[ev.status]) durations[ev.status] = [];
        durations[ev.status].push(hours);
      }
    }

    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const st of SPEED_STATUS_ORDER) {
      const arr = durations[st] || [];
      if (!arr.length) continue;
      const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = `
        <div class="bar-label">${STATUS_LABELS[st] || st}</div>
        <div class="bar"><span class="bar-fill" style="width:${Math.min(100, avg)}%"></span></div>
        <div class="bar-value">${avg.toFixed(1)} h</div>
      `;
      frag.appendChild(row);
    }
    container.appendChild(frag);
  }

  // Inicializa
  document.addEventListener('DOMContentLoaded', init);

  // API (se precisar chamar de fora)
  return {
    init,
    reload: async () => {
      await Promise.allSettled([
        loadStatusHistory(true),
        loadNotifications(true),
        loadSigadaer(true),
        loadProfiles(true),
        loadOpinions(true)
      ]);
      renderStatusRings();
      renderSpeedBars();
      renderYearCounters();
      renderNotificationCounters();
      renderSigadaerCounters();
      renderOpinionAverages();
      renderHourlyHeatmap();
    }
  };
})();
