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

  function init() {
    const yearSelect = el('entryYearSelect');
    yearSelect?.addEventListener('change', () => {
      renderEntryChart();
      renderOverview();
      renderYearlyActivity();
      renderHourlyEngagement();
    });

    loadData().then(() => {
      updateYearOptions();
      renderEntryChart();
      renderOverview();
      renderYearlyActivity();
      renderHourlyEngagement();
    });
  }

  function el(id) { return document.getElementById(id); }

  async function loadData() {
    try {
      const { data: processes } = await window.sb
        .from('v_dashboard_processes')
        .select('*')
        .order('first_entry_date', { ascending: false });

      cachedProcesses = Array.isArray(processes) ? processes : [];

      const ids = cachedProcesses.map(p => p.id);
      if (ids.length) {
        const { data: hist } = await window.sb
          .from('v_process_status_history')
          .select('*')
          .in('process_id', ids)
          .order('process_id', { ascending: true })
          .order('start', { ascending: true });

        cachedStatusHistory = groupBy(hist || [], 'process_id');
      } else {
        cachedStatusHistory = {};
      }

      const { data: notif } = await window.sb
        .from('v_dashboard_notifications')
        .select('*');

      cachedNotifications = Array.isArray(notif) ? notif : [];

      const { data: sig } = await window.sb
        .from('v_dashboard_sigadaer')
        .select('*');

      cachedSigadaer = Array.isArray(sig) ? sig : [];

      const { data: ops } = await window.sb
        .from('v_dashboard_opinions')
        .select('*');

      cachedOpinions = Array.isArray(ops) ? ops : [];
    } catch (err) {
      console.error('loadData()', err);
    }
  }

  function groupBy(arr, key) {
    const map = {};
    (arr || []).forEach(it => {
      const k = it[key];
      if (k == null) return;
      (map[k] = map[k] || []).push(it);
    });
    return map;
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
      setEntryYearTotal(null);
      return false;
    }

    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      select.appendChild(opt);
    });

    select.disabled = false;
    if (previous && years.includes(previous)) {
      select.value = String(previous);
    } else {
      select.value = String(years[0]);
    }
    return true;
  }

  function renderEntryChart() {
    const container = el('chartEntriesByMonth');
    if (!container) return;

    container.innerHTML = '';

    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    const hasYear = Number.isFinite(year);

    const months = Array(12).fill(0);
    if (hasYear) {
      (cachedProcesses || []).forEach(p => {
        const d = Utils.dateOnly(p.first_entry_date);
        if (!d || Number.isNaN(+d)) return;
        if (d.getFullYear() === year) {
          months[d.getMonth()] += 1;
        }
      });
    }

    const total = months.reduce((a, b) => a + b, 0);
    setEntryYearTotal(total);

    const bars = document.createElement('div');
    bars.className = 'bar-chart';
    const max = Math.max(...months);

    months.forEach((count, idx) => {
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

          // === NOVO CRITÉRIO: considerar interseção com o ano selecionado ===
          const yearStart = new Date(year, 0, 1);
          const yearEnd = new Date(year, 11, 31);
          // Se não há interseção, ignora
          if (endDate < yearStart || startDate > yearEnd) continue;
          // Recorta o intervalo dentro do ano
          const clipStart = startDate < yearStart ? yearStart : startDate;
          const clipEnd = endDate > yearEnd ? yearEnd : endDate;

          const days = Utils.daysBetween(clipStart, clipEnd);
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
      anadoc: el('metricAnadoc'),
      anaica: el('metricAnaica'),
      anatecpre: el('metricAnatecPre'),
      anatec: el('metricAnatec'),
      confec: el('metricConfec'),
      revoaco: el('metricRevOaco'),
      aprov: el('metricAprov'),
      icapub: el('metricIcaPub'),
      notif: el('metricNotif'),
      sig: el('metricSig'),
      opin: el('metricOpin')
    };

    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    const hasYear = Number.isFinite(year);
    const byStatus = {
      ANADOC: 0, ANAICA: 0, 'ANATEC-PRE': 0, ANATEC: 0, CONFEC: 0, 'REV-OACO': 0, APROV: 0, 'ICA-PUB': 0
    };

    if (hasYear) {
      Object.values(cachedStatusHistory || {}).forEach(list => {
        if (!Array.isArray(list)) return;
        list.forEach(item => {
          if (!item?.start || !item?.status) return;
          const d = new Date(item.start);
          if (Number.isNaN(+d)) return;
          if (d.getFullYear() === year && byStatus[item.status] != null) {
            byStatus[item.status] += 1;
          }
        });
      });
    }

    setMetric(metricEls.anadoc, byStatus['ANADOC']);
    setMetric(metricEls.anaica, byStatus['ANAICA']);
    setMetric(metricEls.anatecpre, byStatus['ANATEC-PRE']);
    setMetric(metricEls.anatec, byStatus['ANATEC']);
    setMetric(metricEls.confec, byStatus['CONFEC']);
    setMetric(metricEls.revoaco, byStatus['REV-OACO']);
    setMetric(metricEls.aprov, byStatus['APROV']);
    setMetric(metricEls.icapub, byStatus['ICA-PUB']);

    const notifCount = (cachedNotifications || []).filter(n => {
      const d = Utils.dateOnly(n.requested_at || n.read_at || n.created_at);
      return d && d.getFullYear() === year;
    }).length;
    setMetric(metricEls.notif, notifCount);

    const sigCount = (cachedSigadaer || []).filter(s => {
      const d = Utils.dateOnly(s.created_at);
      return d && d.getFullYear() === year;
    }).length;
    setMetric(metricEls.sig, sigCount);

    const opinCount = (cachedOpinions || []).filter(o => {
      if (!OPINION_TYPES_SET.has(o.opinion_type)) return false;
      const d = Utils.dateOnly(o.created_at);
      return d && d.getFullYear() === year;
    }).length;
    setMetric(metricEls.opin, opinCount);
  }

  function setMetric(node, value) {
    if (!node) return;
    if (typeof value === 'number' && Number.isFinite(value)) {
      node.textContent = YEARLY_COUNTER_FORMATTER.format(value);
    } else {
      node.textContent = '—';
    }
  }

  function renderHourlyEngagement() {
    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    const hasYear = Number.isFinite(year);

    const series = Array(24).fill(0);

    if (hasYear) {
      (cachedStatusHistory || {}) &&
      Object.values(cachedStatusHistory).forEach(list => {
        if (!Array.isArray(list)) return;
        list.forEach(item => {
          if (!item?.start) return;
          const d = new Date(item.start);
          if (Number.isNaN(+d)) return;
          if (d.getFullYear() === year) {
            series[d.getHours()] += 1;
          }
        });
      });

      (cachedNotifications || []).forEach(n => {
        const d = new Date(n.requested_at || n.read_at || n.created_at);
        if (!d || Number.isNaN(+d)) return;
        if (d.getFullYear() === year) series[d.getHours()] += 1;
      });

      (cachedSigadaer || []).forEach(s => {
        const d = new Date(s.created_at);
        if (!d || Number.isNaN(+d)) return;
        if (d.getFullYear() === year) series[d.getHours()] += 1;
      });

      (cachedOpinions || []).forEach(o => {
        if (!OPINION_TYPES_SET.has(o.opinion_type)) return;
        const d = new Date(o.created_at);
        if (!d || Number.isNaN(+d)) return;
        if (d.getFullYear() === year) series[d.getHours()] += 1;
      });
    }

    const container = el('hourlyEngagement');
    if (!container) return;
    container.innerHTML = '';

    const max = Math.max(...series);
    const bars = document.createElement('div');
    bars.className = 'bar-chart bar-chart-hours';

    series.forEach((count, hour) => {
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
      if (count > 0 && percent < 8) percent = 8;
      bar.style.height = `${percent}%`;
      bar.title = `${hour.toString().padStart(2, '0')}h: ${count}`;

      wrapper.appendChild(bar);

      const label = document.createElement('span');
      label.className = 'bar-chart-label';
      label.textContent = `${hour.toString().padStart(2, '0')}h`;

      item.appendChild(value);
      item.appendChild(wrapper);
      item.appendChild(label);
      bars.appendChild(item);
    });

    container.appendChild(bars);
  }

  return { init };
})();
