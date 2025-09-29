// public/modules/prazos.js
window.Modules = window.Modules || {};
window.Modules.prazos = (() => {
  let pareceres = [];
  let remocao = [];
  let obras = [];
  let sobrestamento = [];
  let monitor = [];
  let doaga = [];
  let adhel = [];

  const CARD_INFO = {
    pareceres: {
      label: 'Pareceres/Info',
      metaId: 'cardMeta-pareceres',
      signal: {
        historyAction: 'Sinalização - Pareceres/Info',
        rejectionAction: 'Sinalização rejeitada - Pareceres/Info',
        fields: [
          {
            key: 'received_at',
            type: 'datetime-local',
            label: 'Data/Hora do recebimento de pareceres internos/externos',
            required: true
          },
          {
            key: 'sigadaer_number',
            type: 'text',
            label: 'Número do SIGADAER (se houver)'
          },
          {
            key: 'observation',
            type: 'textarea',
            label: 'Observação (se houver)'
          }
        ]
      }
    },
    remocao: {
      label: 'Remoção/Rebaixamento',
      metaId: 'cardMeta-remocao',
      signal: {
        historyAction: 'Sinalização - Remoção/Rebaixamento',
        rejectionAction: 'Sinalização rejeitada - Remoção/Rebaixamento',
        fields: [
          {
            key: 'received_at',
            type: 'datetime-local',
            label: 'Data/Hora do recebimento da informação de remoção/rebaixamento',
            required: true
          },
          {
            key: 'sigadaer_number',
            type: 'text',
            label: 'Número do SIGADAER (se houver)'
          },
          {
            key: 'observation',
            type: 'textarea',
            label: 'Observação (se houver)'
          }
        ]
      }
    },
    obra: {
      label: 'Término de Obra',
      metaId: 'cardMeta-obra',
      signal: {
        historyAction: 'Sinalização - Término de Obra',
        rejectionAction: 'Sinalização rejeitada - Término de Obra',
        fields: [
          {
            key: 'finish_date',
            type: 'date',
            label: 'Data do término da obra',
            required: true
          },
          {
            key: 'sigadaer_number',
            type: 'text',
            label: 'Número do SIGADAER (se houver)'
          },
          {
            key: 'observation',
            type: 'textarea',
            label: 'Observação (se houver)'
          }
        ]
      }
    },
    monitor: {
      label: 'Leitura/Expedição',
      metaId: 'cardMeta-monitor',
      signal: {
        historyAction: 'Sinalização - Leitura/Expedição',
        rejectionAction: 'Sinalização rejeitada - Leitura/Expedição',
        fields: [
          {
            key: 'event_at',
            type: 'datetime-local',
            label: 'Data/Hora da leitura da notificação ou expedição do SIGADAER',
            required: true
          },
          {
            key: 'sigadaer_number',
            type: 'text',
            label: 'Número do SIGADAER (se houver)'
          },
          {
            key: 'observation',
            type: 'textarea',
            label: 'Observação (se houver)'
          }
        ]
      }
    },
    sobrestamento: {
      label: 'Sobrestamento',
      metaId: 'cardMeta-sobrestamento'
    },
    adhel: {
      label: 'Revogar plano',
      metaId: 'cardMeta-adhel',
      signal: {
        historyAction: 'Sinalização - Revogar plano',
        rejectionAction: 'Sinalização rejeitada - Revogar plano',
        fields: [
          {
            key: 'info_date',
            type: 'date',
            label: 'Data da inserção da informação do AD/HEL nas publicações AIS',
            required: true
          },
          {
            key: 'sigadaer_number',
            type: 'text',
            label: 'Número do SIGADAER (se houver)'
          },
          {
            key: 'observation',
            type: 'textarea',
            label: 'Observação (se houver)'
          }
        ]
      }
    },
    doaga: {
      label: 'Prazo DO-AGA',
      metaId: 'cardMeta-doaga'
    }
  };

  const SIGNALABLE_CARDS = new Set(
    Object.entries(CARD_INFO)
      .filter(([, info]) => info.signal)
      .map(([key]) => key)
  );

  const processIdCache = new Map();
  let signalStore = new Map();
  let signalsLoaded = false;

  function getCardInfo(cardKey) {
    return CARD_INFO[cardKey] || { label: cardKey, metaId: null };
  }

  function isAdmin() {
    return (window.APP_PROFILE?.role || '') === 'Administrador';
  }

  function makeSignalKey(cardKey, processId, nup) {
    return `${cardKey || ''}::${processId || ''}::${nup || ''}`;
  }

  function indexSignal(signal) {
    if (!signal?.card_key) return;
    const keys = new Set();
    keys.add(makeSignalKey(signal.card_key, signal.process_id || '', signal.nup || ''));
    if (signal.process_id) keys.add(makeSignalKey(signal.card_key, signal.process_id, ''));
    if (signal.nup) keys.add(makeSignalKey(signal.card_key, '', signal.nup));
    keys.forEach(key => signalStore.set(key, signal));
  }

  function getActiveSignal(cardKey, row) {
    if (!signalsLoaded) return null;
    if (!cardKey || !row) return null;
    const processId = row.process_id || row.processId || null;
    const nup = row.nup || null;
    const tries = [
      makeSignalKey(cardKey, processId || '', nup || ''),
      makeSignalKey(cardKey, processId || '', ''),
      makeSignalKey(cardKey, '', nup || '')
    ];
    for (const key of tries) {
      if (signalStore.has(key)) return signalStore.get(key);
    }
    return null;
  }

  function decorateRows(rows, cardKey) {
    if (!Array.isArray(rows)) return [];
    return rows.map(row => ({
      ...row,
      __signal: getActiveSignal(cardKey, row)
    }));
  }

  function updateCardBadge(cardKey, decoratedRows) {
    const info = getCardInfo(cardKey);
    if (!info.metaId) return;
    const box = document.getElementById(info.metaId);
    if (!box) return;
    const hasSignal = Array.isArray(decoratedRows) && decoratedRows.some(row => row?.__signal);
    box.innerHTML = hasSignal ? '<span class="badge-validate">VALIDAR</span>' : '';
  }

  function rerenderCard(cardKey) {
    switch (cardKey) {
      case 'pareceres':
        renderPareceres();
        break;
      case 'remocao':
        renderRemocao();
        break;
      case 'obra':
        renderObra();
        break;
      case 'monitor':
        renderMonitor();
        break;
      case 'sobrestamento':
        renderSobrestamento();
        break;
      case 'adhel':
        renderADHEL();
        break;
      case 'doaga':
        renderDOAGA();
        break;
      default:
        break;
    }
  }

  async function ensureProcessId(row) {
    if (!row) return null;
    if (row.process_id) return row.process_id;
    const nup = row.nup || row.NUP;
    if (!nup) return null;
    if (processIdCache.has(nup)) return processIdCache.get(nup);
    try {
      const { data, error } = await sb.from('processes').select('id').eq('nup', nup).maybeSingle();
      if (error) throw error;
      if (!data?.id) return null;
      processIdCache.set(nup, data.id);
      return data.id;
    } catch (err) {
      console.error('Falha ao localizar processo por NUP', nup, err);
      return null;
    }
  }

  async function loadSignals() {
    try {
      const { data, error } = await sb
        .from('deadline_signals')
        .select('id,process_id,nup,card_key,card_label,details,flagged_at,flagged_by,rejected_at,rejected_by,rejection_note')
        .is('rejected_at', null);
      if (error) throw error;
      signalStore = new Map();
      (data || []).forEach(sig => indexSignal(sig));
      signalsLoaded = true;
    } catch (err) {
      console.error('Falha ao carregar sinalizações de prazos:', err);
      signalStore = new Map();
      signalsLoaded = true;
    }
  }

  function bindRowLinks(tbody, cardKey) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      tr.classList.add('clickable-row');
      if (!tr.dataset.row) return;
      let data;
      try {
        data = JSON.parse(tr.dataset.row);
      } catch (err) {
        data = null;
      }
      if (!data) return;
      tr.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        openItemActions(data, cardKey);
      });
    });
  }

  function renderNupCell(row) {
    if (!row) return '';
    const badge = row.__signal ? '<div class="badge-validate">VALIDAR</div>' : '';
    const nup = row.nup || '';
    return `<div>${nup}</div>${badge}`;
  }

  function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getFieldInitialValue(field, details) {
    if (!details || !field) return '';
    const raw = details[field.key];
    if (raw == null || raw === '') return '';
    if (field.type === 'datetime-local') {
      return Utils.toDateTimeLocalValue(raw) || '';
    }
    if (field.type === 'date') {
      return Utils.toDateInputValue(raw) || '';
    }
    return String(raw);
  }

  function normalizeFieldValue(field, value) {
    if (!field) return null;
    if (value == null) return null;
    if (typeof value === 'string') {
      value = value.trim();
    }
    if (value === '') return null;
    if (field.type === 'datetime-local') {
      const dt = new Date(value);
      if (Number.isNaN(+dt)) return null;
      return dt.toISOString();
    }
    if (field.type === 'date') {
      return value;
    }
    return typeof value === 'string' ? value : String(value);
  }

  function formatSignalSummary(signal) {
    const details = parseSignalDetails(signal);
    const entries = Object.entries(details || {})
      .filter(([, value]) => value != null && value !== '');
    if (!entries.length) return '';
    const lines = entries.map(([key, value]) => {
      let display = value;
      if (typeof value === 'string') {
        if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) display = Utils.fmtDateTime(value);
        else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) display = Utils.fmtDate(value);
      }
      const label = key.replace(/_/g, ' ');
      return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(display)}</li>`;
    });
    return `<ul>${lines.join('')}</ul>`;
  }

  function parseSignalDetails(signal) {
    if (!signal?.details) return {};
    if (typeof signal.details === 'string') {
      try { return JSON.parse(signal.details); }
      catch (_) { return {}; }
    }
    if (typeof signal.details === 'object') return { ...signal.details };
    return {};
  }

  async function logSignalHistory(processId, action, details) {
    if (!processId || !action) return;
    const cleanDetails = Object.fromEntries(
      Object.entries(details || {})
        .filter(([, value]) => value != null && value !== '')
    );
    try {
      const { error } = await sb.from('history').insert({
        process_id: processId,
        action,
        details: cleanDetails
      });
      if (error) throw error;
    } catch (err) {
      console.error('Falha ao registrar histórico de sinalização:', err);
    }
  }

  const PARECERES_COLUMNS = [
    { key: 'nup', label: 'NUP', render: renderNupCell },
    {
      key: 'type_label',
      label: 'Tipo',
      value: r => r.type_label || r.type || ''
    },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const REMOCAO_COLUMNS = [
    { key: 'nup', label: 'NUP', render: renderNupCell },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const OBRAS_COLUMNS = [
    { key: 'nup', label: 'NUP', render: renderNupCell },
    {
      key: 'due_date',
      label: 'Prazo',
      value: r => Utils.fmtDate(r.due_date),
      render: r => {
        const prazo = Utils.fmtDate(r.due_date);
        if (!r.em_atraso) return `<div>${prazo}</div>`;
        return `<div>${prazo}</div><div class="text-danger">ADICIONAL</div>`;
      }
    },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const SOBRESTAMENTO_COLUMNS = [
    { key: 'nup', label: 'NUP', render: renderNupCell },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  const MONITOR_COLUMNS = [
    { key: 'nup', label: 'NUP', render: renderNupCell },
    { key: 'type', label: 'Tipo' },
    { key: 'number', label: 'Número', value: r => (r.number ? String(r.number).padStart(6, '0') : '') }
  ];

  const DOAGA_COLUMNS = [
    { key: 'nup', label: 'NUP', render: renderNupCell },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  const ADHEL_COLUMNS = [
    { key: 'nup', label: 'NUP', render: renderNupCell },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : '') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  function getPareceresRows() {
    return pareceres;
  }

  function renderPareceres() {
    const rows = decorateRows(getPareceresRows(), 'pareceres');
    const { tbody } = Utils.renderTable('prazoParec', PARECERES_COLUMNS, rows);
    updateCardBadge('pareceres', rows);
    bindRowLinks(tbody, 'pareceres');
  }

  async function loadPareceres() {
    const [intRes, extRes] = await Promise.all([
      sb
        .from('v_prazo_pareceres')
        .select('process_id,nup,type,due_date,days_remaining,deadline_days'),
      sb
        .from('v_prazo_pareceres_externos')
        .select('process_id,nup,type,due_date,days_remaining,deadline_days')
    ]);

    const normalize = rows => (Array.isArray(rows) ? rows : []);

    const parecerRows = normalize(intRes.data)
      .filter(row => ['ATM', 'DT', 'CGNA'].includes(row.type))
      .map(row => ({
        ...row,
        origin: 'parecer',
        type_label: `Parecer ${row.type}`
      }));

    const sigadaerRows = normalize(extRes.data)
      .filter(row => row.due_date || typeof row.deadline_days === 'number')
      .map(row => ({
        ...row,
        origin: 'sigadaer',
        type_label: `SIGADAER ${row.type}`,
        days_remaining:
          typeof row.days_remaining === 'number'
            ? row.days_remaining
            : Utils.daysBetween(new Date(), row.due_date)
      }));

    pareceres = [...parecerRows, ...sigadaerRows]
      .filter(row => row.due_date)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderPareceres();
  }

  function getRemocaoRows() {
    return remocao;
  }

  function renderRemocao() {
    const rows = decorateRows(getRemocaoRows(), 'remocao');
    const { tbody } = Utils.renderTable('prazoRemocao', REMOCAO_COLUMNS, rows);
    updateCardBadge('remocao', rows);
    bindRowLinks(tbody, 'remocao');
  }

  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('process_id,nup,due_date,days_remaining');
    remocao = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderRemocao();
  }

  function getObraRows() {
    return obras;
  }

  function renderObra() {
    const rows = decorateRows(getObraRows(), 'obra');
    const { tbody } = Utils.renderTable('prazoObra', OBRAS_COLUMNS, rows);
    updateCardBadge('obra', rows);
    bindRowLinks(tbody, 'obra');
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('process_id,nup,due_date,days_remaining,em_atraso');
    obras = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderObra();
  }

  function getSobrestamentoRows() {
    return sobrestamento;
  }

  function renderSobrestamento() {
    const rows = decorateRows(getSobrestamentoRows(), 'sobrestamento');
    const { tbody } = Utils.renderTable('prazoSobrestamento', SOBRESTAMENTO_COLUMNS, rows);
    updateCardBadge('sobrestamento', rows);
    bindRowLinks(tbody, 'sobrestamento');
  }

  async function loadSobrestamento() {
    const { data } = await sb.from('v_prazo_sobrestamento')
      .select('process_id,nup,due_date,days_remaining');
    sobrestamento = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderSobrestamento();
  }

  function getMonitorRows() {
    return monitor;
  }

  function renderMonitor() {
    const rows = decorateRows(getMonitorRows(), 'monitor');
    const { tbody } = Utils.renderTable('prazoMonit', MONITOR_COLUMNS, rows);
    updateCardBadge('monitor', rows);
    bindRowLinks(tbody, 'monitor');
  }

  async function loadMonitor() {
    const { data, error } = await sb.from('v_monitorar_tramitacao')
      .select('process_id,nup,type,number');
    if (error) {
      console.warn('Falha ao carregar process_id em v_monitorar_tramitacao, tentando sem a coluna.', error.message);
      const retry = await sb.from('v_monitorar_tramitacao')
        .select('nup,type,number');
      monitor = (retry.data || []).map(row => ({ ...row, process_id: row.process_id || null }));
      renderMonitor();
      return;
    }
    monitor = data || [];
    renderMonitor();
  }

  function getDoagaRows() {
    return doaga;
  }

  function renderDOAGA() {
    const rows = decorateRows(getDoagaRows(), 'doaga');
    const { tbody } = Utils.renderTable('prazoDOAGA', DOAGA_COLUMNS, rows);
    updateCardBadge('doaga', rows);
    bindRowLinks(tbody, 'doaga');
  }

  async function loadDOAGA() {
    const { data } = await sb.from('v_prazo_do_aga')
      .select('process_id,nup,due_date,days_remaining');
    doaga = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderDOAGA();
  }

  function getAdhelRows() {
    return adhel;
  }

  function renderADHEL() {
    const rows = decorateRows(getAdhelRows(), 'adhel');
    const { tbody } = Utils.renderTable('prazoADHEL', ADHEL_COLUMNS, rows);
    updateCardBadge('adhel', rows);
    bindRowLinks(tbody, 'adhel');
  }

  async function loadADHEL() {
    const { data } = await sb.from('v_prazo_ad_hel')
      .select('process_id,nup,due_date,days_remaining');
    adhel = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderADHEL();
  }

  function buildSignalDialogHeader(card, row) {
    return `
      <h3>${escapeHtml(card.label)}</h3>
      <p><strong>NUP:</strong> ${escapeHtml(row?.nup || '')}</p>
    `;
  }

  function openItemActions(row, cardKey) {
    if (!row) return;
    const card = getCardInfo(cardKey);
    const signal = getActiveSignal(cardKey, row);
    const canSignal = SIGNALABLE_CARDS.has(cardKey);
    const admin = isAdmin();
    const dlg = document.createElement('dialog');
    dlg.className = 'prazo-dialog';
    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'prazo-popup';
    const summary = signal ? formatSignalSummary(signal) : '';
    const summaryHtml = signal
      ? `<div class="signal-summary"><strong>Sinalização atual:</strong>${summary || '<p class="muted">Sem detalhes informados.</p>'}</div>`
      : '';
    const signalBtnLabel = signal ? 'Atualizar sinalização' : 'Sinalizar';
    const signalBtn = canSignal
      ? `<button type="button" data-action="signal">${signalBtnLabel}</button>`
      : '';
    const rejectBtn = admin
      ? `<button type="button" data-action="reject" ${signal ? '' : 'disabled'}>Rejeitar sinalização</button>`
      : '';
    form.innerHTML = `
      ${buildSignalDialogHeader(card, row)}
      ${summaryHtml}
      <menu>
        <button type="button" data-action="view">Ver na lista de processos</button>
        ${signalBtn}
        ${rejectBtn}
        <button type="button" data-action="close">Fechar</button>
      </menu>
      <div class="msg"></div>
    `;
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());

    const msgBox = form.querySelector('.msg');
    const setMsg = (text, isError = false) => {
      if (!msgBox) return;
      msgBox.textContent = text || '';
      msgBox.classList.toggle('error', !!isError);
    };

    form.querySelector('[data-action="view"]')?.addEventListener('click', ev => {
      ev.preventDefault();
      try {
        if (row?.nup) sessionStorage.setItem('procPreSelect', row.nup);
      } catch (err) {
        console.warn('Falha ao gravar procPreSelect no sessionStorage:', err);
      }
      window.location.href = 'processos.html';
      dlg.close();
    });

    form.querySelector('[data-action="signal"]')?.addEventListener('click', ev => {
      ev.preventDefault();
      if (!canSignal) {
        setMsg('Sinalização indisponível para este card.', true);
        return;
      }
      dlg.close();
      openSignalForm(row, cardKey, signal);
    });

    form.querySelector('[data-action="reject"]')?.addEventListener('click', ev => {
      ev.preventDefault();
      if (!admin) {
        setMsg('Somente administradores podem rejeitar sinalizações.', true);
        return;
      }
      if (!signal) {
        setMsg('Não há sinalização para rejeitar.', true);
        return;
      }
      dlg.close();
      openRejectForm(signal, row, cardKey);
    });

    form.querySelector('[data-action="close"]')?.addEventListener('click', ev => {
      ev.preventDefault();
      dlg.close();
    });

    dlg.showModal();
  }

  function openSignalForm(row, cardKey, existingSignal) {
    const card = getCardInfo(cardKey);
    const cfg = card.signal;
    if (!cfg) return;
    const details = parseSignalDetails(existingSignal);
    const dlg = document.createElement('dialog');
    dlg.className = 'prazo-dialog';
    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'prazo-popup';
    const suffix = Math.random().toString(36).slice(2, 8);
    const fields = cfg.fields.map(field => {
      const fieldId = `signal-${cardKey}-${field.key}-${suffix}`;
      return {
        field,
        id: fieldId,
        value: getFieldInitialValue(field, details)
      };
    });
    const fieldsHtml = fields.map(entry => {
      const { field, id, value } = entry;
      if (field.type === 'textarea') {
        return `
          <label>${escapeHtml(field.label)}
            <textarea id="${id}" ${field.required ? 'required' : ''}>${escapeHtml(value)}</textarea>
          </label>`;
      }
      const inputType = field.type === 'datetime-local' ? 'datetime-local' : field.type === 'date' ? 'date' : 'text';
      const valAttr = value ? ` value="${escapeHtml(value)}"` : '';
      return `
        <label>${escapeHtml(field.label)}
          <input type="${inputType}" id="${id}"${valAttr} ${field.required ? 'required' : ''}>
        </label>`;
    }).join('');
    form.innerHTML = `
      ${buildSignalDialogHeader(card, row)}
      ${fieldsHtml}
      <menu>
        <button type="button" data-action="confirm">Confirmar</button>
        <button type="button" data-action="close">Fechar</button>
      </menu>
      <div class="msg"></div>
    `;
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());

    const msgBox = form.querySelector('.msg');
    const setMsg = (text, isError = false) => {
      if (!msgBox) return;
      msgBox.textContent = text || '';
      msgBox.classList.toggle('error', !!isError);
    };

    form.querySelector('[data-action="confirm"]')?.addEventListener('click', async ev => {
      ev.preventDefault();
      await handleSignalConfirm({ dlg, form, row, cardKey, cfg, fields, setMsg });
    });

    form.querySelector('[data-action="close"]')?.addEventListener('click', ev => {
      ev.preventDefault();
      dlg.close();
    });

    dlg.showModal();
  }

  async function handleSignalConfirm({ dlg, form, row, cardKey, cfg, fields, setMsg }) {
    try {
      const values = {};
      for (const entry of fields) {
        const input = form.querySelector(`#${entry.id}`);
        const raw = input ? input.value : '';
        const normalized = normalizeFieldValue(entry.field, raw);
        if (entry.field.required && !normalized) {
          setMsg('Preencha todos os campos obrigatórios.', true);
          return;
        }
        if (normalized != null) values[entry.field.key] = normalized;
      }
      const processId = await ensureProcessId(row);
      if (!processId) {
        setMsg('Não foi possível localizar o processo.', true);
        return;
      }
      const user = await getUser();
      if (!user?.id) {
        setMsg('Sessão expirada. Faça login novamente.', true);
        return;
      }
      const now = new Date().toISOString();
      const payload = {
        process_id: processId,
        nup: row?.nup || '',
        card_key: cardKey,
        card_label: getCardInfo(cardKey).label,
        details: values,
        flagged_by: user.id,
        flagged_at: now,
        rejected_at: null,
        rejected_by: null,
        rejection_note: null
      };
      const { error } = await sb
        .from('deadline_signals')
        .upsert(payload, { onConflict: 'process_id,card_key' });
      if (error) throw error;
      const historyDetails = { ...values };
      if (row?.nup) historyDetails.nup = row.nup;
      await logSignalHistory(processId, cfg.historyAction, historyDetails);
      await loadSignals();
      rerenderCard(cardKey);
      dlg.close();
    } catch (err) {
      console.error('Falha ao registrar sinalização:', err);
      setMsg(err.message || 'Falha ao salvar a sinalização.', true);
    }
  }

  function openRejectForm(signal, row, cardKey) {
    const card = getCardInfo(cardKey);
    const cfg = card.signal;
    if (!cfg) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'prazo-dialog';
    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'prazo-popup';
    const textareaId = `reject-note-${Math.random().toString(36).slice(2, 8)}`;
    form.innerHTML = `
      ${buildSignalDialogHeader(card, row)}
      <label>Observação (obrigatória)
        <textarea id="${textareaId}" required></textarea>
      </label>
      <menu>
        <button type="button" data-action="confirm">Confirmar</button>
        <button type="button" data-action="close">Fechar</button>
      </menu>
      <div class="msg"></div>
    `;
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());

    const msgBox = form.querySelector('.msg');
    const setMsg = (text, isError = false) => {
      if (!msgBox) return;
      msgBox.textContent = text || '';
      msgBox.classList.toggle('error', !!isError);
    };

    form.querySelector('[data-action="confirm"]')?.addEventListener('click', async ev => {
      ev.preventDefault();
      await handleRejectConfirm({ dlg, form, textareaId, signal, row, cardKey, cfg, setMsg });
    });

    form.querySelector('[data-action="close"]')?.addEventListener('click', ev => {
      ev.preventDefault();
      dlg.close();
    });

    dlg.showModal();
  }

  async function handleRejectConfirm({ dlg, form, textareaId, signal, row, cardKey, cfg, setMsg }) {
    try {
      if (!isAdmin()) {
        setMsg('Somente administradores podem rejeitar sinalizações.', true);
        return;
      }
      const noteEl = form.querySelector(`#${textareaId}`);
      const note = noteEl ? noteEl.value.trim() : '';
      if (!note) {
        setMsg('Insira uma observação para rejeitar a sinalização.', true);
        return;
      }
      const user = await getUser();
      if (!user?.id) {
        setMsg('Sessão expirada. Faça login novamente.', true);
        return;
      }
      const { error } = await sb
        .from('deadline_signals')
        .update({
          rejection_note: note,
          rejected_by: user.id,
          rejected_at: new Date().toISOString()
        })
        .eq('id', signal.id);
      if (error) throw error;
      const processId = signal.process_id || await ensureProcessId(row);
      const details = parseSignalDetails(signal);
      const historyDetails = { ...details, observacao_administrador: note };
      if (row?.nup) historyDetails.nup = row.nup;
      await logSignalHistory(processId, cfg.rejectionAction, historyDetails);
      await loadSignals();
      rerenderCard(cardKey);
      dlg.close();
    } catch (err) {
      console.error('Falha ao rejeitar sinalização:', err);
      setMsg(err.message || 'Falha ao rejeitar a sinalização.', true);
    }
  }

  function init() {}

  async function load() {
    await loadSignals();
    await Promise.all([
      loadPareceres(),
      loadRemocao(),
      loadObra(),
      loadSobrestamento(),
      loadMonitor(),
      loadDOAGA(),
      loadADHEL()
    ]);
  }

  return { init, load };
})();
