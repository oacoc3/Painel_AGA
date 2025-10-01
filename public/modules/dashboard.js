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

    const refreshBtn = el('dashboardRefresh');
    refreshBtn?.addEventListener('click', () => load());
  }

  function el(id) {
    return document.getElementById(id);
  }

  function sumBy(arr, getter) {
    let s = 0;
    for (const it of arr) {
      const v = getter(it);
      if (typeof v === 'number' && Number.isFinite(v)) s += v;
    }
    return s;
  }

  function updateYearOptions(previous) {
    const select = el('entryYearSelect');
    if (!select) return false;

    const yearSet = new Set();

    // processos
    for (const p of cachedProcesses) {
      if (p?.first_entry_date) {
        const y = new Date(p.first_entry_date).getFullYear();
        if (Number.isFinite(y)) yearSet.add(y);
      }
    }
    // notifications
    for (const n of cachedNotifications) {
      if (n?.requested_at) {
        const y = new Date(n.requested_at).getFullYear();
        if (Number.isFinite(y)) yearSet.add(y);
      }
      if (n?.read_at) {
        const y = new Date(n.read_at).getFullYear();
        if (Number.isFinite(y)) yearSet.add(y);
      }
    }
    // sigadaer
    for (const s of cachedSigadaer) {
      if (s?.requested_at) {
        const y = new Date(s.requested_at).getFullYear();
        if (Number.isFinite(y)) yearSet.add(y);
      }
      if (s?.expedit_at) {
        const y = new Date(s.expedit_at).getFullYear();
        if (Number.isFinite(y)) yearSet.add(y);
      }
    }
    // opinions
    for (const o of cachedOpinions) {
      if (o?.requested_at) {
        const y = new Date(o.requested_at).getFullYear();
        if (Number.isFinite(y)) yearSet.add(y);
      }
    }
    // status history (usa start)
    for (const list of Object.values(cachedStatusHistory)) {
      for (const item of list) {
        const y = new Date(item.start).getFullYear();
        if (Number.isFinite(y)) yearSet.add(y);
      }
    }

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
    if (!Number.isFinite(year)) {
      renderEntryChartEmpty('Nenhum dado para exibir.');
      return;
    }

    const months = new Array(12).fill(0);

    // usa first_entry_date do processo
    for (const p of cachedProcesses) {
      const dt = p?.first_entry_date ? new Date(p.first_entry_date) : null;
      if (!dt || Number.isNaN(+dt) || dt.getFullYear() !== year) continue;
      months[dt.getMonth()] += 1;
    }

    container.innerHTML = '';
    const total = sumBy(months, v => v);
    if (!total) {
      renderEntryChartEmpty('Sem entradas para o ano selecionado.');
      return;
    }

    const header = document.createElement('div');
    header.className = 'chart-header';
    const title = document.createElement('h3');
    title.textContent = `Novos processos em ${year}`;
    const counter = document.createElement('div');
    counter.className = 'counter';
    counter.textContent = YEARLY_COUNTER_FORMATTER.format(total);
    header.appendChild(title);
    header.appendChild(counter);

    const bars = document.createElement('div');
    bars.className = 'bars';
    months.forEach((val, idx) => {
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = Math.max(4, Math.round((val / total) * 100)) + 'px';
      bar.setAttribute('aria-label', `${MONTH_LABELS[idx]}: ${val}`);
      bars.appendChild(bar);
    });

    container.appendChild(header);
    container.appendChild(bars);
  }

  function renderEntryChartEmpty(message) {
    const container = el('entryChart');
    if (!container) return;
    container.innerHTML = '';
    const msg = document.createElement('p');
    msg.className = 'muted chart-placeholder';
    msg.textContent = message;
    container.appendChild(msg);
  }

  function renderOverview() {
    const container = el('overviewRings');
    if (!container) return;

    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    if (!Number.isFinite(year)) {
      container.innerHTML = '<p class="muted">Nenhum dado para exibir.</p>';
      return;
    }

    // conta quantos processos estiveram em cada status no ano (pelo início do trecho)
    const countMap = {};
    Object.values(cachedStatusHistory).forEach(list => {
      for (let i = 0; i < list.length; i++) {
        const cur = list[i];
        if (!cur?.start || !cur?.status) continue;
        const startDate = new Date(cur.start);
        if (Number.isNaN(+startDate)) continue;
        if (startDate.getFullYear() !== year) continue;
        countMap[cur.status] = (countMap[cur.status] || 0) + 1;
      }
    });

    // médias por status (dias corridos)
    const agg = {};
    const now = new Date();
    for (const list of Object.values(cachedStatusHistory)) {
      for (let i = 0; i < list.length; i++) {
        const cur = list[i];
        if (!cur?.start || !cur?.status) continue;

        const startDate = new Date(cur.start);
        if (Number.isNaN(+startDate)) continue;
        const next = list[i + 1];
        const endDate = next && next.start ? new Date(next.start) : now;
        if (Number.isNaN(+endDate)) continue;

        const startYear = startDate.getFullYear();
        // Novo critério: conta se o início é no ano selecionado e corta o fim no limite do ano
        if (startYear !== year) continue;
        const yearEnd = new Date(year + 1, 0, 1); // 01/jan do ano seguinte
        const limitedEnd = endDate > yearEnd ? yearEnd : endDate;

        const days = Utils.daysBetween(startDate, limitedEnd);
        if (typeof days !== 'number' || Number.isNaN(days)) continue;

        agg[cur.status] = agg[cur.status] || { sum: 0, n: 0 };
        agg[cur.status].sum += days;
        agg[cur.status].n += 1;
      }
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

    // max para largura proporcional (sem alterar visual)
    const maxAvg = Math.max(...items.map(it => (typeof it.avg === 'number' ? it.avg : 0)), 0) || 0;
    container.innerHTML = '';
    if (!items.some(it => typeof it.avg === 'number')) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Sem dados para o ano selecionado.';
      container.appendChild(p);
      return;
    }

    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'speed-row';

      const label = document.createElement('div');
      label.className = 'speed-label';
      label.textContent = it.label;

      const value = document.createElement('div');
      value.className = 'speed-value';
      if (typeof it.avg === 'number' && Number.isFinite(it.avg)) {
        value.textContent = `${it.avg.toFixed(1)} dias`;
      } else {
        value.textContent = '— dias';
      }
      value.setAttribute('aria-label', it.ariaLabel);

      const bar = document.createElement('div');
      bar.className = 'speed-bar';
      const widthPct = maxAvg ? Math.max(30, Math.round((it.avg || 0) / maxAvg * 100)) : 30;
      bar.style.width = `${widthPct}%`;

      row.appendChild(label);
      row.appendChild(value);
      row.appendChild(bar);
      container.appendChild(row);
    }
  }

  function renderYearlyActivity() {
    const container = el('yearlyActivityChart');
    if (!container) return;

    const select = el('entryYearSelect');
    const year = select && select.value ? Number(select.value) : NaN;
    if (!Number.isFinite(year)) {
      container.innerHTML = '<p class="muted">Nenhum dado para exibir.</p>';
      return;
    }

    const counters = {
      notifications_requested: 0,
      notifications_read: 0,
      sigadaer_requested: 0,
      sigadaer_expedited: 0,
      opinions_requested: 0
    };

    // Notifications
    for (const n of cachedNotifications) {
      if (n?.requested_at) {
        const dt = new Date(n.requested_at);
        if (Number.isFinite(+dt) && dt.getFullYear() === year) counters.notifications_requested++;
      }
      if (n?.read_at) {
        const dt = new Date(n.read_at);
        if (Number.isFinite(+dt) && dt.getFullYear() === year) counters.notifications_read++;
      }
    }

    // Sigadaer
    for (const s of cachedSigadaer) {
      if (s?.requested_at) {
        const dt = new Date(s.requested_at);
        if (Number.isFinite(+dt) && dt.getFullYear() === year) counters.sigadaer_requested++;
      }
      if (s?.expedit_at) {
        const dt = new Date(s.expedit_at);
        if (Number.isFinite(+dt) && dt.getFullYear() === year) counters.sigadaer_expedited++;
      }
    }

    // Opinions (ATM/DT/CGNA)
    for (const o of cachedOpinions) {
      if (!o?.type || !OPINION_TYPES_SET.has(o.type)) continue;
      if (o?.requested_at) {
        const dt = new Date(o.requested_at);
        if (Number.isFinite(+dt) && dt.getFullYear() === year) counters.opinions_requested++;
      }
    }

    // Render (sem alterar visual)
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'stats-grid';

    function statCard(label, value) {
      const card = document.createElement('div');
      card.className = 'stat-card';
      const h = document.createElement('h4');
      h.textContent = label;
      const v = document.createElement('div');
      v.className = 'value';
      v.textContent = YEARLY_COUNTER_FORMATTER.format(value || 0);
      card.appendChild(h);
      card.appendChild(v);
      return card;
    }

    wrap.appendChild(statCard('Notificações solicitadas', counters.notifications_requested));
    wrap.appendChild(statCard('Notificações lidas', counters.notifications_read));
    wrap.appendChild(statCard('SIGADAER solicitado', counters.sigadaer_requested));
    wrap.appendChild(statCard('SIGADAER expedido', counters.sigadaer_expedited));
    wrap.appendChild(statCard('Pareceres internos solicitados (ATM/DT/CGNA)', counters.opinions_requested));

    container.appendChild(wrap);
  }

  function renderHourlyEngagementEmpty(message) {
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

    // Base de datas para engajamento por hora:
    // - first_entry_date
    // - requested_at / read_at (notificações)
    // - requested_at / expedit_at (sigadaer)
    // - requested_at de pareceres internos
    // - início de cada status (status_since) do histórico
    for (const p of cachedProcesses) {
      registerDate(p?.first_entry_date);
    }
    for (const n of cachedNotifications) {
      registerDate(n?.requested_at);
      registerDate(n?.read_at);
    }
    for (const s of cachedSigadaer) {
      registerDate(s?.requested_at);
      registerDate(s?.expedit_at);
    }
    for (const o of cachedOpinions) {
      if (!o?.type || !OPINION_TYPES_SET.has(o.type)) continue;
      registerDate(o?.requested_at);
    }
    for (const list of Object.values(cachedStatusHistory)) {
      for (const it of list) registerDate(it?.start);
    }

    // Render simples (sem mudar visual)
    container.innerHTML = '';
    const total = sumBy(counts, v => v);
    if (!total) {
      renderHourlyEngagementEmpty('Sem atividades no ano selecionado.');
      return;
    }

    const header = document.createElement('div');
    header.className = 'chart-header';
    const title = document.createElement('h3');
    title.textContent = `Engajamento por hora em ${year}`;
    const bars = document.createElement('div');
    bars.className = 'bars hourly';

    counts.forEach((val, hr) => {
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.height = Math.max(2, Math.round((val / total) * 100)) + 'px';
      bar.setAttribute('aria-label', `${String(hr).padStart(2, '0')}h: ${val}`);
      bars.appendChild(bar);
    });

    header.appendChild(title);
    container.appendChild(header);
    container.appendChild(bars);
  }

  async function load() {
    const sb = window.supabaseClient;
    const prevYear = el('entryYearSelect')?.value ? Number(el('entryYearSelect').value) : undefined;

    const { data: procs } = await sb
      .from('processes')
      .select('id,status,status_since,first_entry_date');

    cachedProcesses = procs || [];
    const hasYears = updateYearOptions(prevYear);
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
        .in('process_id', ids)
        .eq('action', 'Status atualizado');

      for (const h of (historyData || [])) {
        const pid = h.process_id;
        const det = h.details || {};
        const status = det.status;
        const start = det.status_since || h.created_at; // usa data efetiva quando houver
        if (!pid || !status || !start) continue;
        byProc[pid] = byProc[pid] || [];
        byProc[pid].push({ status, start });
      }
    }

    // garante o status atual como último ponto (se ainda não presente)
    (procs || []).forEach(proc => {
      const list = byProc[proc.id] = byProc[proc.id] || [];
      if (proc?.status && proc?.status_since) {
        const already = list.some(x => x.status === proc.status && x.start === proc.status_since);
        if (!already) list.push({ status: proc.status, start: proc.status_since });
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
