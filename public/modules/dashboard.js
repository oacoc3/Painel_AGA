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

  // >>> Patch novo (pessoal: disponibilidade x produção)
  const PERSONNEL_HISTORY_ACTION = 'Status REV-OACO registrado';
  const ANALISTA_OACO_ROLE = 'Analista OACO';
  const PRODUCTIVITY_FIRST_WEEK_ISO = '2025-10-06';
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const MS_PER_MINUTE = 60 * 1000;
  const WORKING_DAYS = [
    { key: 'monday', label: 'Segunda-feira', short: 'Seg', offset: 0 },
    { key: 'tuesday', label: 'Terça-feira', short: 'Ter', offset: 1 },
    { key: 'wednesday', label: 'Quarta-feira', short: 'Qua', offset: 2 },
    { key: 'thursday', label: 'Quinta-feira', short: 'Qui', offset: 3 },
    { key: 'friday', label: 'Sexta-feira', short: 'Sex', offset: 4 }
  ];
  const DEFAULT_WORKING_HOURS = {
    monday: [
      { start: '08:00', end: '11:15' },
      { start: '13:00', end: '15:45' }
    ],
    tuesday: [
      { start: '10:00', end: '11:15' },
      { start: '13:00', end: '15:45' }
    ],
    wednesday: [
      { start: '09:15', end: '11:15' },
      { start: '13:00', end: '15:45' }
    ],
    thursday: [
      { start: '10:00', end: '11:15' },
      { start: '13:00', end: '15:45' }
    ],
    friday: [
      { start: '08:00', end: '12:00' }
    ]
  };
  const WORKING_HOURS_STORAGE_KEY = 'pessoalWorkingHoursByWeek';
  const PERSONNEL_CHART_ID = 'personnelComparisonChart';
  // <<< Patch novo

  let cachedProcesses = [];
  let cachedStatusHistory = {};
  let cachedNotifications = [];
  let cachedSigadaer = [];
  let cachedOpinions = [];
  // >>> Patch novo (estado de pessoal)
  let personnelWeeks = [];
  let personnelProductivity = new Map();
  let personnelAvailability = new Map();
  let personnelAvailabilityMsg = '';
  let personnelProfiles = [];
  const personnelWorkingHours = new Map();
  // <<< Patch novo

  function el(id) {
    return document.getElementById(id);
  }

  // >>> Patch novo (helpers de pessoal)
  function isAnalistaOacoRole(role) {
    return String(role || '').trim().toLowerCase() === ANALISTA_OACO_ROLE.toLowerCase();
  }

  function cloneWorkingHours(hours = {}) {
    const result = {};
    WORKING_DAYS.forEach(day => {
      const slots = Array.isArray(hours?.[day.key]) ? hours[day.key] : [];
      result[day.key] = slots
        .map(slot => ({
          start: typeof slot?.start === 'string' ? slot.start : '',
          end: typeof slot?.end === 'string' ? slot.end : ''
        }))
        .filter(slot => slot.start || slot.end);
    });
    return result;
  }

  function getDefaultWorkingHours() {
    return cloneWorkingHours(DEFAULT_WORKING_HOURS);
  }

  function loadPersonnelWorkingHoursFromStorage() {
    personnelWorkingHours.clear();
    try {
      if (typeof window === 'undefined' || !window?.localStorage) return;
      const raw = window.localStorage.getItem(WORKING_HOURS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      Object.entries(parsed).forEach(([weekKey, hours]) => {
        if (!weekKey) return;
        personnelWorkingHours.set(weekKey, cloneWorkingHours(hours));
      });
    } catch (err) {
      console.warn('[dashboard] Falha ao carregar horários úteis salvos:', err);
    }
  }

  function getPersonnelWeekWorkingHours(weekKey) {
    if (!weekKey) return getDefaultWorkingHours();
    if (!personnelWorkingHours.has(weekKey)) {
      personnelWorkingHours.set(weekKey, getDefaultWorkingHours());
    }
    return cloneWorkingHours(personnelWorkingHours.get(weekKey));
  }

  function parseTimeToMinutes(value) {
    if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [hh, mm] = value.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return (hh * 60) + mm;
  }

  function mergeIntervals(intervals = []) {
    if (!Array.isArray(intervals) || !intervals.length) return [];
    const normalized = intervals
      .map(item => {
        const start = item?.start instanceof Date ? new Date(item.start.getTime()) : new Date(item?.start);
        const end = item?.end instanceof Date ? new Date(item.end.getTime()) : new Date(item?.end);
        if (!start || !end || Number.isNaN(+start) || Number.isNaN(+end) || end <= start) return null;
        return { start, end };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
    if (!normalized.length) return [];
    const result = [normalized[0]];
    for (let i = 1; i < normalized.length; i += 1) {
      const prev = result[result.length - 1];
      const cur = normalized[i];
      if (cur.start <= prev.end) {
        if (cur.end > prev.end) prev.end = cur.end;
      } else {
        result.push(cur);
      }
    }
    return result;
  }

  function getWeekStart(dateInput) {
    if (!dateInput) return null;
    const src = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput);
    if (!src || Number.isNaN(+src)) return null;
    const result = new Date(src.getTime());
    const day = result.getDay();
    const diff = (day + 6) % 7; // segunda
    result.setHours(0, 0, 0, 0);
    result.setDate(result.getDate() - diff);
    return result;
  }

  function getProductivityFirstWeekStart() {
    return getWeekStart(PRODUCTIVITY_FIRST_WEEK_ISO);
  }

  function formatWeekKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function ensurePersonnelWeekEntry(map, dateInput) {
    const start = getWeekStart(dateInput);
    if (!start) return null;
    const key = formatWeekKey(start);
    let entry = map.get(key);
    if (!entry) {
      const end = new Date(start.getTime());
      end.setDate(end.getDate() + 6);
      entry = { key, start, end, label: '', docOk: 0, notifOk: 0 };
      map.set(key, entry);
    }
    return entry;
  }

  function formatWeekLabel(entry) {
    if (!entry) return '';
    if (!entry.label) {
      const startLabel = Utils.fmtDate(entry.start);
      const endLabel = Utils.fmtDate(entry.end);
      entry.label = startLabel && endLabel
        ? `${startLabel} – ${endLabel}`
        : (startLabel || endLabel || '');
    }
    return entry.label;
  }

  function buildContinuousWeeks(weekData) {
    const map = weekData instanceof Map ? weekData : new Map();
    const baseline = getProductivityFirstWeekStart();
    if (!baseline) return [];

    const baselineEntry = ensurePersonnelWeekEntry(map, baseline);
    let maxStartTime = baselineEntry?.start?.getTime() ?? baseline.getTime();

    map.forEach(entry => {
      if (!entry?.start) return;
      const entryTime = entry.start.getTime();
      if (entryTime > maxStartTime) maxStartTime = entryTime;
    });

    const currentWeek = getWeekStart(new Date());
    if (currentWeek && currentWeek.getTime() > maxStartTime) {
      maxStartTime = currentWeek.getTime();
    }

    const weeks = [];
    for (let time = baseline.getTime(); time <= maxStartTime; time += MS_PER_WEEK) {
      const entry = ensurePersonnelWeekEntry(map, new Date(time));
      if (entry) weeks.push(entry);
    }

    return weeks;
  }

  function normalizeHistoryDetails(details) {
    if (!details) return null;
    if (typeof details === 'object') return details;
    if (typeof details === 'string') {
      try { return JSON.parse(details); } catch (_) { return null; }
    }
    return null;
  }

  function computePersonnelAvailability(weeks, unavailabilityList, analysts) {
    const result = new Map();
    const analystIds = Array.isArray(analysts)
      ? analysts
          .map(profile => (profile?.id != null ? String(profile.id) : null))
          .filter(Boolean)
      : [];
    const analystSet = new Set(analystIds);
    const analystCount = analystIds.length;
    let hasWorkingMinutes = false;

    if (!Array.isArray(weeks) || !weeks.length) {
      const fallback = analystCount ? 'Nenhuma semana disponível.' : 'Nenhum Analista OACO cadastrado.';
      return { map: result, message: fallback };
    }

    weeks.forEach(week => {
      if (!week || !week.start) return;
      const weekStart = week.start instanceof Date ? new Date(week.start.getTime()) : new Date(week.start);
      if (!weekStart || Number.isNaN(+weekStart)) return;
      const weekEnd = new Date(weekStart.getTime());
      weekEnd.setDate(weekEnd.getDate() + 7);

      const dayBounds = WORKING_DAYS.map(day => {
        const start = new Date(weekStart.getTime());
        start.setDate(start.getDate() + day.offset);
        const end = new Date(start.getTime());
        end.setDate(end.getDate() + 1);
        return { start, end };
      });

      const hours = getPersonnelWeekWorkingHours(week.key);
      const workingIntervals = [];
      const workingMinutesPerDay = [];

      WORKING_DAYS.forEach((day, idx) => {
        const dayStart = dayBounds[idx].start;
        const slots = Array.isArray(hours[day.key]) ? hours[day.key] : [];
        const intervals = slots
          .map(slot => {
            const startMinutes = parseTimeToMinutes(slot.start);
            const endMinutes = parseTimeToMinutes(slot.end);
            if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return null;
            const start = new Date(dayStart.getTime());
            start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
            const end = new Date(dayStart.getTime());
            end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
            return { start, end };
          })
          .filter(Boolean);
        workingIntervals[idx] = intervals;
        const dayMinutes = intervals.reduce((total, interval) => total + (interval.end - interval.start) / MS_PER_MINUTE, 0);
        workingMinutesPerDay[idx] = dayMinutes;
        if (dayMinutes > 0) hasWorkingMinutes = true;
      });

      const profileDayIntervals = new Map();
      if (analystCount) {
        const weekStartTime = weekStart.getTime();
        const weekEndTime = weekEnd.getTime();

        (unavailabilityList || []).forEach(item => {
          const profileKey = item?.profile_id != null ? String(item.profile_id) : null;
          if (!profileKey || !analystSet.has(profileKey)) return;

          const rawStart = new Date(item.starts_at);
          const rawEnd = new Date(item.ends_at);
          if (!rawStart || !rawEnd || Number.isNaN(+rawStart) || Number.isNaN(+rawEnd) || rawEnd <= rawStart) return;

          const startTime = Math.max(rawStart.getTime(), weekStartTime);
          const endTime = Math.min(rawEnd.getTime(), weekEndTime);
          if (startTime >= endTime) return;

          if (!profileDayIntervals.has(profileKey)) {
            profileDayIntervals.set(profileKey, WORKING_DAYS.map(() => []));
          }
          const dayCollections = profileDayIntervals.get(profileKey);

          WORKING_DAYS.forEach((day, idx) => {
            const dayStartTime = dayBounds[idx].start.getTime();
            const dayEndTime = dayBounds[idx].end.getTime();
            const overlapStart = Math.max(startTime, dayStartTime);
            const overlapEnd = Math.min(endTime, dayEndTime);
            if (overlapStart < overlapEnd) {
              dayCollections[idx].push({
                start: new Date(overlapStart),
                end: new Date(overlapEnd)
              });
            }
          });
        });
      }

      const daySummaries = WORKING_DAYS.map((day, idx) => {
        const baseMinutes = workingMinutesPerDay[idx] || 0;
        const totalMinutes = baseMinutes * analystCount;
        if (!totalMinutes) {
          return { percent: null, availableMinutes: 0, totalMinutes: 0, possibleMinutes: baseMinutes };
        }
        let unavailableMinutes = 0;
        profileDayIntervals.forEach(dayArrays => {
          const merged = mergeIntervals(dayArrays[idx] || []);
          if (!merged.length) return;
          merged.forEach(interval => {
            (workingIntervals[idx] || []).forEach(work => {
              const overlapStart = Math.max(interval.start.getTime(), work.start.getTime());
              const overlapEnd = Math.min(interval.end.getTime(), work.end.getTime());
              if (overlapStart < overlapEnd) {
                unavailableMinutes += (overlapEnd - overlapStart) / MS_PER_MINUTE;
              }
            });
          });
        });
        const capacity = Math.max(0, totalMinutes);
        const unavailableClamped = Math.min(capacity, unavailableMinutes);
        const availableMinutes = capacity - unavailableClamped;
        const percent = capacity > 0 ? (availableMinutes / capacity) * 100 : null;
        return { percent, availableMinutes, totalMinutes: capacity, possibleMinutes: baseMinutes };
      });

      const availableSum = daySummaries.reduce((sum, info) => sum + (info.availableMinutes || 0), 0);
      const totalSum = daySummaries.reduce((sum, info) => sum + (info.totalMinutes || 0), 0);
      const possibleSum = daySummaries.reduce((sum, info) => sum + (info.possibleMinutes || 0), 0);
      const summaryPercent = totalSum > 0 ? (availableSum / totalSum) * 100 : null;

      result.set(week.key, {
        summary: {
          percent: summaryPercent,
          availableMinutes: availableSum,
          totalMinutes: totalSum,
          possibleMinutes: possibleSum
        },
        days: daySummaries
      });
    });

    let message = '';
    if (!analystCount) {
      message = 'Nenhum Analista OACO cadastrado.';
    } else if (!hasWorkingMinutes) {
      message = 'Nenhum horário útil configurado.';
    }

    return { map: result, message };
  }
  // <<< Patch novo

  function init() {
    // >>> Patch: carregar horários úteis de pessoal do localStorage
    loadPersonnelWorkingHoursFromStorage();

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

    // >>> Patch do diff: contar cada processo apenas uma vez por status no ano
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
    // <<< Patch do diff

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

    let overallMaxPercent = 0;
    if (overallTotal > 0) {
      HOURLY_GROUPS.forEach(group => {
        const list = groups[group.key] || [];
        for (let hour = 0; hour < list.length; hour += 1) {
          const value = list[hour] || 0;
          const percent = (value / overallTotal) * 100;
          if (percent > overallMaxPercent) overallMaxPercent = percent;
        }
      });
    }

    return { groups, totals, overallTotal, offHoursByGroup, overallMaxPercent };
  }

  function renderSingleHourlyView(container, data, group) {
    const { overallTotal, overallMaxPercent } = data;
    const bars = document.createElement('div');
    bars.className = 'bar-chart-bars';
    bars.style.gridTemplateColumns = 'repeat(24, minmax(0, 1fr))';

    const counts = data.groups[group.key] || [];
    const percents = counts.map(value => (overallTotal ? (value / overallTotal) * 100 : 0));
    const effectiveMaxPercent = (typeof overallMaxPercent === 'number' && overallMaxPercent > 0)
      ? overallMaxPercent
      : percents.reduce((max, value) => (value > max ? value : max), 0);

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
      let heightPercent = effectiveMaxPercent ? (percent / effectiveMaxPercent) * 100 : 0;
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

  // >>> Patch novo: gráfico “Disp. de pessoal × produção sem falhas”
  function renderPersonnelComparisonEmpty(message = 'Nenhum dado para exibir.') {
    const container = el(PERSONNEL_CHART_ID);
    if (!container) return;
    container.innerHTML = '';
    const msg = document.createElement('p');
    msg.className = 'muted chart-placeholder';
    msg.textContent = message;
    container.appendChild(msg);
  }

  function renderPersonnelComparison() {
    const container = el(PERSONNEL_CHART_ID);
    if (!container) return;

    const weeks = personnelWeeks || [];
    if (!weeks.length) {
      const message = personnelAvailabilityMsg || 'Nenhuma semana disponível.';
      renderPersonnelComparisonEmpty(message);
      return;
    }

    const dataset = weeks.map((week, index) => {
      const label = formatWeekLabel(week);
      const shortLabel = Utils.fmtDate(week.start) || `Sem ${index + 1}`;
      const productivity = personnelProductivity.get(week.key) || { docOk: 0, notifOk: 0 };
      const availabilityInfo = personnelAvailability.get(week.key) || null;
      const percent = availabilityInfo?.summary?.percent;
      return {
        key: week.key,
        label,
        shortLabel,
        docOk: productivity.docOk || 0,
        notifOk: productivity.notifOk || 0,
        availabilityPercent: Number.isFinite(percent) ? percent : null
      };
    });

    const hasBars = dataset.some(item => item.docOk || item.notifOk);
    const hasLine = dataset.some(item => Number.isFinite(item.availabilityPercent));
    if (!hasBars && !hasLine) {
      const message = personnelAvailabilityMsg || 'Nenhum dado disponível.';
      renderPersonnelComparisonEmpty(message);
      return;
    }

    const width = Math.max(dataset.length * 60 + 80, 320);
    const height = 220;
    const margin = { top: 20, right: 56, bottom: 45, left: 44 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const bottom = margin.top + innerHeight;

    const maxBarValue = dataset.reduce((max, item) => Math.max(max, item.docOk, item.notifOk), 0);
    const safeMaxBar = maxBarValue > 0 ? maxBarValue : 1;
    const bandWidth = dataset.length ? innerWidth / dataset.length : innerWidth;
    const barWidth = Math.min(18, bandWidth / 3);
    const barGap = Math.min(8, barWidth);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Disponibilidade de pessoal versus produção sem falhas');

    const axisGroup = document.createElementNS(svgNS, 'g');

    const xAxis = document.createElementNS(svgNS, 'line');
    xAxis.setAttribute('x1', margin.left);
    xAxis.setAttribute('x2', margin.left + innerWidth);
    xAxis.setAttribute('y1', bottom);
    xAxis.setAttribute('y2', bottom);
    xAxis.setAttribute('class', 'combo-axis');
    axisGroup.appendChild(xAxis);

    const yAxisLeft = document.createElementNS(svgNS, 'line');
    yAxisLeft.setAttribute('x1', margin.left);
    yAxisLeft.setAttribute('x2', margin.left);
    yAxisLeft.setAttribute('y1', margin.top);
    yAxisLeft.setAttribute('y2', bottom);
    yAxisLeft.setAttribute('class', 'combo-axis');
    axisGroup.appendChild(yAxisLeft);

    const yAxisRight = document.createElementNS(svgNS, 'line');
    yAxisRight.setAttribute('x1', margin.left + innerWidth);
    yAxisRight.setAttribute('x2', margin.left + innerWidth);
    yAxisRight.setAttribute('y1', margin.top);
    yAxisRight.setAttribute('y2', bottom);
    yAxisRight.setAttribute('class', 'combo-axis');
    axisGroup.appendChild(yAxisRight);

    const barTicks = 4;
    for (let i = 0; i <= barTicks; i += 1) {
      const value = (safeMaxBar / barTicks) * i;
      const y = bottom - (value / safeMaxBar) * innerHeight;
      const tick = document.createElementNS(svgNS, 'text');
      tick.setAttribute('x', margin.left - 6);
      tick.setAttribute('y', y + 3);
      tick.setAttribute('text-anchor', 'end');
      tick.setAttribute('class', 'combo-tick-text');
      tick.textContent = YEARLY_COUNTER_FORMATTER.format(Math.round(value));
      axisGroup.appendChild(tick);
    }

    [0, 50, 100].forEach(percent => {
      const y = bottom - (percent / 100) * innerHeight;
      const tick = document.createElementNS(svgNS, 'text');
      tick.setAttribute('x', margin.left + innerWidth + 6);
      tick.setAttribute('y', y + 3);
      tick.setAttribute('text-anchor', 'start');
      tick.setAttribute('class', 'combo-tick-text');
      tick.textContent = `${percent}%`;
      axisGroup.appendChild(tick);
    });

    svg.appendChild(axisGroup);

    dataset.forEach((item, idx) => {
      const baseX = margin.left + idx * bandWidth + bandWidth / 2;
      const groupWidth = barWidth * 2 + barGap;

      let docHeight = (item.docOk / safeMaxBar) * innerHeight;
      if (item.docOk > 0 && docHeight < 4) docHeight = 4;
      const docX = baseX - groupWidth / 2;
      const docY = bottom - docHeight;
      const docRect = document.createElementNS(svgNS, 'rect');
      docRect.setAttribute('x', docX);
      docRect.setAttribute('y', docY);
      docRect.setAttribute('width', barWidth);
      docRect.setAttribute('height', docHeight);
      docRect.setAttribute('class', 'combo-bar-doc');
      const docTitle = document.createElementNS(svgNS, 'title');
      docTitle.textContent = `${item.label}: ANADOC ok ${YEARLY_COUNTER_FORMATTER.format(item.docOk)}`;
      docRect.appendChild(docTitle);
      svg.appendChild(docRect);

      let notifHeight = (item.notifOk / safeMaxBar) * innerHeight;
      if (item.notifOk > 0 && notifHeight < 4) notifHeight = 4;
      const notifX = docX + barWidth + barGap;
      const notifY = bottom - notifHeight;
      const notifRect = document.createElementNS(svgNS, 'rect');
      notifRect.setAttribute('x', notifX);
      notifRect.setAttribute('y', notifY);
      notifRect.setAttribute('width', barWidth);
      notifRect.setAttribute('height', notifHeight);
      notifRect.setAttribute('class', 'combo-bar-notif');
      const notifTitle = document.createElementNS(svgNS, 'title');
      notifTitle.textContent = `${item.label}: Notificações ok ${YEARLY_COUNTER_FORMATTER.format(item.notifOk)}`;
      notifRect.appendChild(notifTitle);
      svg.appendChild(notifRect);

      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', baseX);
      label.setAttribute('y', bottom + 20);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('class', 'combo-week-label');
      label.textContent = item.shortLabel;
      const labelTitle = document.createElementNS(svgNS, 'title');
      labelTitle.textContent = item.label;
      label.appendChild(labelTitle);
      svg.appendChild(label);
    });

    const linePoints = [];
    dataset.forEach((item, idx) => {
      if (!Number.isFinite(item.availabilityPercent)) return;
      const clamped = Math.max(0, Math.min(100, item.availabilityPercent));
      const x = margin.left + idx * bandWidth + bandWidth / 2;
      const y = bottom - (clamped / 100) * innerHeight;
      linePoints.push({ x, y, value: clamped, label: item.label });
    });

    if (linePoints.length) {
      const path = document.createElementNS(svgNS, 'path');
      const d = linePoints.map((pt, index) => `${index === 0 ? 'M' : 'L'}${pt.x},${pt.y}`).join(' ');
      path.setAttribute('d', d);
      path.setAttribute('class', 'combo-line');
      svg.appendChild(path);

      linePoints.forEach(pt => {
        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', pt.x);
        circle.setAttribute('cy', pt.y);
        circle.setAttribute('r', 3);
        circle.setAttribute('class', 'combo-point');
        const title = document.createElementNS(svgNS, 'title');
        title.textContent = `${pt.label}: Disp. de pessoal ${PERCENTAGE_FORMATTER.format(pt.value)}%`;
        circle.appendChild(title);
        svg.appendChild(circle);
      });
    }

    container.innerHTML = '';
    container.appendChild(svg);
    if (personnelAvailabilityMsg) {
      const note = document.createElement('p');
      note.className = 'muted combo-chart-message';
      note.textContent = personnelAvailabilityMsg;
      container.appendChild(note);
    }
  }

  async function loadPersonnelComparisonData() {
    renderPersonnelComparisonEmpty('Carregando…');
    try {
      loadPersonnelWorkingHoursFromStorage();

      const { data: profileData, error: profilesError } = await sb.rpc('admin_list_profiles');
      if (profilesError) throw profilesError;
      personnelProfiles = Array.isArray(profileData) ? profileData : [];

      const { data: historyData, error: historyError } = await sb
        .from('history')
        .select('details')
        .eq('action', PERSONNEL_HISTORY_ACTION);
      if (historyError) throw historyError;

      const { data: unavailabilityData, error: unavailabilityError } = await sb
        .from('user_unavailabilities')
        .select('profile_id, starts_at, ends_at');
      if (unavailabilityError) throw unavailabilityError;

      const weekData = new Map();
      (historyData || []).forEach(row => {
        const details = normalizeHistoryDetails(row?.details);
        if (!details) return;

        const doc = details.document_analysis;
        if (doc?.analyst_id && !doc?.needs_review) {
          const entry = ensurePersonnelWeekEntry(weekData, doc.performed_at || details.status_since);
          if (entry) entry.docOk += 1;
        }

        const notif = details.notification;
        if (notif?.analyst_id && !notif?.needs_review) {
          const entry = ensurePersonnelWeekEntry(weekData, notif.performed_at || details.status_since);
          if (entry) entry.notifOk += 1;
        }
      });

      const weeks = buildContinuousWeeks(weekData);
      personnelWeeks = weeks;

      const productivityMap = new Map();
      weeks.forEach(week => {
        const info = weekData.get(week.key) || week;
        const docOk = info?.docOk || 0;
        const notifOk = info?.notifOk || 0;
        week.docOk = docOk;
        week.notifOk = notifOk;
        productivityMap.set(week.key, { docOk, notifOk });
      });
      personnelProductivity = productivityMap;

      const analysts = personnelProfiles.filter(profile => (
        profile?.id && isAnalistaOacoRole(profile.role) && !profile.deleted_at
      ));

      const { map: availabilityMap, message } = computePersonnelAvailability(
        weeks,
        unavailabilityData || [],
        analysts
      );
      personnelAvailability = availabilityMap;
      personnelAvailabilityMsg = message || '';

      renderPersonnelComparison();
    } catch (err) {
      console.error('[dashboard] Falha ao carregar comparação de pessoal:', err);
      personnelWeeks = [];
      personnelProductivity = new Map();
      personnelAvailability = new Map();
      personnelAvailabilityMsg = err?.message || 'Falha ao carregar dados.';
      renderPersonnelComparisonEmpty(personnelAvailabilityMsg);
    }
  }
  // <<< Patch novo

  async function load() {
    renderEntryChartEmpty('Carregando…');
    renderHourlyEngagementEmpty('Carregando…');
    // >>> Patch: placeholder para o gráfico de pessoal
    renderPersonnelComparisonEmpty('Carregando…');

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
    // >>> Patch: carrega dados do comparativo de pessoal
    await loadPersonnelComparisonData();

    if (yearSelect) yearSelect.disabled = false;
  }

  return { init, load };
})();
