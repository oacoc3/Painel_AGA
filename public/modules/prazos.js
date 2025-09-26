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
  let signals = [];
  let signalIndex = new Map();
  let cardBadges = {};
  let alertsBox = null;

  const CARD_TITLES = {
    pareceres: 'Pareceres/Info',
    remocao: 'Remoção/Rebaixamento',
    obras: 'Término de Obra',
    monitor: 'Leitura/Expedição',
    revogar: 'Revogar plano'
  };

  function currentRole() {
    return (window.AccessGuards?.getRole?.()) || null;
  }

  function isAdmin() {
    return currentRole() === 'Administrador';
  }

  function canSignalDeadlines() {
    const role = currentRole();
    return role === 'Analista OACO' || role === 'Administrador';
  }

  function registerIndicators() {
    cardBadges = {};
    document.querySelectorAll('[data-card-badge]').forEach(el => {
      const key = el.getAttribute('data-card-badge');
      if (key) cardBadges[key] = el;
    });
    alertsBox = document.getElementById('prazosAlerts');
  }

  function indexSignals(list = []) {
    signalIndex = new Map();
    list.forEach(sig => {
      if (!sig?.source_table || !sig?.source_id) return;
      const key = `${sig.source_table}|${sig.source_id}`;
      const arr = signalIndex.get(key);
      if (arr) arr.push(sig);
      else signalIndex.set(key, [sig]);
    });
    signalIndex.forEach(arr => arr.sort((a, b) => new Date(b.signaled_at) - new Date(a.signaled_at)));
  }

  function getSignalKey(config) {
    if (!config?.sourceTable || !config?.sourceId) return null;
    return `${config.sourceTable}|${config.sourceId}`;
  }

  function getLatestSignal(config) {
    const key = getSignalKey(config);
    if (!key) return null;
    const arr = signalIndex.get(key);
    return Array.isArray(arr) && arr.length ? arr[0] : null;
  }

  function countPendingByCard() {
    const counts = { pareceres: 0, remocao: 0, obras: 0, monitor: 0, revogar: 0 };
    signals.forEach(sig => {
      if (sig?.status === 'PENDENTE' && Object.prototype.hasOwnProperty.call(counts, sig.card)) {
        counts[sig.card] += 1;
      }
    });
    return counts;
  }

  function updateCardBadges() {
    const counts = countPendingByCard();
    Object.entries(cardBadges).forEach(([key, el]) => {
      if (!el) return;
      const value = counts[key] || 0;
      el.textContent = value;
      el.classList.toggle('hidden', !value);
    });
  }

  function updateAlerts() {
    if (!alertsBox) return;
    const pending = signals.filter(sig => sig?.status === 'PENDENTE').length;
    if (!pending) {
      alertsBox.textContent = '';
      alertsBox.classList.add('hidden');
      return;
    }
    const plural = pending > 1 ? 's' : '';
    const message = isAdmin()
      ? `${pending} sinalização${plural} aguardando validação.`
      : `${pending} sinalização${plural} em validação.`;
    alertsBox.textContent = message;
    alertsBox.classList.remove('hidden');
  }

  function renderAllTables() {
    renderPareceres();
    renderRemocao();
    renderObra();
    renderMonitor();
    renderADHEL();
  }

  function createActionColumn(cardKey) {
    return {
      key: `_actions_${cardKey}`,
      label: '',
      align: 'left',
      render: row => buildActionCell(row, cardKey)
    };
  }

  function createActionButton(label, handler, className) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    if (className) btn.classList.add(className);
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      handler?.();
    });
    return btn;
  }

  function createStatusElement(status) {
    const span = document.createElement('span');
    span.className = 'prazo-status';
    let label = '';
    let variant = '';
    if (status === 'PENDENTE') {
      label = 'Aguardando validação';
      variant = 'pending';
    } else if (status === 'VALIDADO') {
      label = 'Validado';
      variant = 'approved';
    } else if (status === 'REJEITADO') {
      label = 'Rejeitado';
      variant = 'rejected';
    } else {
      label = status || '';
    }
    if (variant) span.classList.add(variant);
    span.textContent = label;
    return span;
  }

  function createSignalMeta(signal) {
    const meta = document.createElement('div');
    meta.className = 'prazo-signal-meta';
    const who = signal?.signaled_by_name || 'Analista';
    const when = Utils.fmtDateTime(signal?.signaled_at) || '—';
    meta.textContent = `${who} • ${when}`;
    return meta;
  }

  function buildActionCell(row, cardKey) {
    const box = document.createElement('div');
    box.className = 'prazo-actions';
    const config = mapRowToSignal(row, cardKey);
    if (!config) {
      box.textContent = '—';
      return box;
    }

    const latest = getLatestSignal(config);
    if (!latest) {
      if (canSignalDeadlines()) {
        box.appendChild(createActionButton('Sinalizar', () => openSignalModal(config)));
      } else {
        box.textContent = '—';
      }
      return box;
    }

    box.appendChild(createStatusElement(latest.status));
    box.appendChild(createSignalMeta(latest));
    box.appendChild(createActionButton('Detalhes', () => openSignalDetails(latest, config), 'secondary'));

    if (latest.status === 'PENDENTE') {
      if (isAdmin()) {
        box.appendChild(createActionButton('Validar', () => openValidationDialog(latest, config, true)));
        box.appendChild(createActionButton('Rejeitar', () => openValidationDialog(latest, config, false), 'danger'));
      }
    } else if (latest.status === 'REJEITADO') {
      if (canSignalDeadlines()) {
        box.appendChild(createActionButton('Nova sinalização', () => openSignalModal(config)));
      }
    }

    return box;
  }

  function mapRowToSignal(row, cardKey) {
    if (!row) return null;
    let config = null;

    if (cardKey === 'pareceres') {
      const originTable = row.origin_table || (row.origin_kind === 'parecer' ? 'internal_opinions' : 'sigadaer');
      const action = originTable === 'internal_opinions'
        ? 'internal_opinion_received'
        : 'external_opinion_received';
      config = {
        card: 'pareceres',
        action,
        sourceTable: originTable,
        sourceId: row.origin_id,
        processId: row.process_id,
        nup: row.nup,
        label: row.type_label || row.type || '',
        row
      };
    } else if (cardKey === 'remocao') {
      if (!row.notification_id) return null;
      config = {
        card: 'remocao',
        action: 'notification_resolved',
        sourceTable: 'notifications',
        sourceId: row.notification_id,
        processId: row.process_id,
        nup: row.nup,
        label: 'DESF-REM_REB',
        row
      };
    } else if (cardKey === 'obras') {
      if (!row.process_id) return null;
      config = {
        card: 'obras',
        action: 'obra_concluida',
        sourceTable: row.origin_table || 'processes',
        sourceId: row.origin_id || row.process_id,
        processId: row.process_id,
        nup: row.nup,
        row
      };
    } else if (cardKey === 'monitor') {
      if (!row.origin_table || !row.origin_id) return null;
      const action = row.origin_table === 'notifications' ? 'notification_read' : 'sigadaer_expedit';
      config = {
        card: 'monitor',
        action,
        sourceTable: row.origin_table,
        sourceId: row.origin_id,
        processId: row.process_id,
        nup: row.nup,
        label: row.type,
        number: row.number,
        row
      };
    } else if (cardKey === 'revogar') {
      if (!row.notification_id) return null;
      config = {
        card: 'revogar',
        action: 'notification_resolved',
        sourceTable: row.origin_table || 'notifications',
        sourceId: row.notification_id,
        processId: row.process_id,
        nup: row.nup,
        row
      };
    }

    if (!config?.sourceTable || !config?.sourceId) return null;
    config.indexKey = `${config.sourceTable}|${config.sourceId}`;
    config.cardTitle = CARD_TITLES[config.card] || '';
    return config;
  }

  function openSignalModal(config) {
    if (!canSignalDeadlines()) {
      window.AccessGuards?.ensureWrite?.('prazos');
      return;
    }

    const dlg = document.createElement('dialog');
    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'prazo-modal';

    const title = document.createElement('h3');
    const titleParts = [config.cardTitle || 'Sinalização'];
    if (config.label) titleParts.push(config.label);
    title.textContent = titleParts.filter(Boolean).join(' • ');
    form.appendChild(title);

    const detail = document.createElement('dl');
    detail.className = 'prazo-detail';
    const addDetail = (label, value) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value || '—';
      detail.appendChild(dt);
      detail.appendChild(dd);
    };
    addDetail('NUP', config.nup || '—');
    if (config.label) addDetail('Tipo', config.label);
    form.appendChild(detail);

    let dateTimeInput = null;
    let dateInput = null;
    let numberInput = null;
    let descriptionInput = null;

    const action = config.action;
    const card = config.card;

    const makeLabel = (text, element) => {
      const label = document.createElement('label');
      label.appendChild(document.createTextNode(text));
      label.appendChild(element);
      return label;
    };

    const needsDateTime = action !== 'obra_concluida';
    const needsDateOnly = action === 'obra_concluida';
    const needsNumber = action === 'external_opinion_received'
      || action === 'obra_concluida'
      || (action === 'notification_resolved' && card === 'remocao');
    const needsDescription = action === 'notification_resolved' && card === 'revogar';

    if (needsDateTime) {
      dateTimeInput = document.createElement('input');
      dateTimeInput.type = 'datetime-local';
      dateTimeInput.required = true;
      let labelText = 'Data/hora informada';
      if (action === 'internal_opinion_received') labelText = 'Data/hora do recebimento do parecer';
      else if (action === 'external_opinion_received') labelText = 'Data/hora do recebimento do SIGADAER';
      else if (action === 'notification_read') labelText = 'Data/hora da leitura da notificação';
      else if (action === 'sigadaer_expedit') labelText = 'Data/hora da expedição do SIGADAER';
      else if (action === 'notification_resolved') labelText = 'Data/hora da resolução';
      form.appendChild(makeLabel(labelText, dateTimeInput));
    }

    if (needsDateOnly) {
      dateInput = document.createElement('input');
      dateInput.type = 'date';
      dateInput.required = true;
      form.appendChild(makeLabel('Data do término da obra', dateInput));
    }

    if (needsNumber) {
      numberInput = document.createElement('input');
      numberInput.type = 'text';
      numberInput.maxLength = 40;
      form.appendChild(makeLabel('Número do SIGADAER (opcional)', numberInput));
    }

    if (needsDescription) {
      descriptionInput = document.createElement('textarea');
      descriptionInput.required = true;
      descriptionInput.minLength = 3;
      descriptionInput.placeholder = 'Indique a localidade conforme publicação AIS';
      form.appendChild(makeLabel('Texto da publicação AIS', descriptionInput));
    }

    const commentInput = document.createElement('textarea');
    commentInput.placeholder = 'Comentários adicionais (opcional)';
    form.appendChild(makeLabel('Comentários adicionais (opcional)', commentInput));

    const menu = document.createElement('menu');
    const cancelBtn = createActionButton('Cancelar', () => dlg.close(), 'secondary');
    const submitBtn = createActionButton('Salvar', async () => {
      msgBox.textContent = '';
      msgBox.classList.remove('error');
      try {
        const payload = {};
        if (dateTimeInput) {
          const val = dateTimeInput.value;
          if (!val) throw new Error('Informe a data e horário.');
          const dt = new Date(val);
          if (Number.isNaN(+dt)) throw new Error('Data e horário inválidos.');
          payload.event_datetime = dt.toISOString();
        }
        if (dateInput) {
          const val = dateInput.value;
          if (!val) throw new Error('Informe a data.');
          payload.event_date = val;
        }
        if (numberInput) {
          const val = numberInput.value.trim();
          if (val) payload.sigadaer_number = val;
        }
        if (descriptionInput) {
          const val = descriptionInput.value.trim();
          if (!val) throw new Error('Descreva o indicativo da localidade.');
          payload.description = val;
        }
        const comment = commentInput.value.trim();
        await createSignal(config, payload, comment);
        dlg.close();
        window.alert('Sinalização registrada, aguardando validação.');
      } catch (err) {
        msgBox.textContent = err.message || String(err);
        msgBox.classList.add('error');
      }
    });
    menu.appendChild(cancelBtn);
    menu.appendChild(submitBtn);
    form.appendChild(menu);

    const msgBox = document.createElement('div');
    msgBox.className = 'msg';
    form.appendChild(msgBox);

    dlg.appendChild(form);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();

    if (dateTimeInput) {
      dateTimeInput.focus();
    } else if (dateInput) {
      dateInput.focus();
    }
  }

  async function createSignal(config, payload, analystComment) {
    const user = await window.getUser?.();
    if (!user?.id) throw new Error('Sessão expirada.');
    const record = {
      process_id: config.processId,
      source_table: config.sourceTable,
      source_id: config.sourceId,
      card: config.card,
      action: config.action,
      payload,
      analyst_comment: analystComment || null,
      signaled_by: user.id
    };
    const { error } = await sb.from('prazo_signals').insert(record);
    if (error) throw error;
    await loadSignals();
  }

  function openSignalDetails(signal, config) {
    const dlg = document.createElement('dialog');
    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'prazo-modal';

    const title = document.createElement('h3');
    title.textContent = 'Detalhes da sinalização';
    form.appendChild(title);

    const detail = document.createElement('dl');
    detail.className = 'prazo-detail';
    const addRow = (label, value) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value != null && value !== '' ? value : '—';
      detail.appendChild(dt);
      detail.appendChild(dd);
    };

    addRow('Card', config.cardTitle || CARD_TITLES[config.card] || '—');
    addRow('NUP', config.nup || '—');
    if (config.label) addRow('Tipo', config.label);
    addRow('Status', signal.status || '—');
    addRow('Sinalizado por', signal.signaled_by_name || '—');
    addRow('Sinalizado em', Utils.fmtDateTime(signal.signaled_at) || '—');

    const payload = signal.payload || {};
    if (payload.event_datetime) addRow('Data/hora informada', Utils.fmtDateTime(payload.event_datetime));
    if (payload.event_date) addRow('Data informada', Utils.fmtDate(payload.event_date));
    if (payload.sigadaer_number) addRow('Nº SIGADAER', payload.sigadaer_number);
    if (payload.description) addRow('Descrição', payload.description);

    if (signal.analyst_comment) addRow('Comentário do analista', signal.analyst_comment);

    if (signal.status !== 'PENDENTE') {
      addRow('Validado por', signal.validated_by_name || '—');
      addRow('Validado em', Utils.fmtDateTime(signal.validated_at) || '—');
      if (signal.validation_comment) addRow('Comentário da validação', signal.validation_comment);
    }

    form.appendChild(detail);

    const menu = document.createElement('menu');
    menu.appendChild(createActionButton('Fechar', () => dlg.close(), 'secondary'));
    form.appendChild(menu);

    dlg.appendChild(form);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  function openValidationDialog(signal, config, approve) {
    if (!isAdmin()) {
      window.AccessGuards?.ensureWrite?.('prazos');
      return;
    }

    const dlg = document.createElement('dialog');
    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'prazo-modal';

    const title = document.createElement('h3');
    title.textContent = approve ? 'Validar sinalização' : 'Rejeitar sinalização';
    form.appendChild(title);

    const info = document.createElement('p');
    const actionVerb = approve ? 'validar' : 'rejeitar';
    info.textContent = `Deseja ${actionVerb} a sinalização para ${config.nup || 'processo'}?`;
    form.appendChild(info);

    const commentLabel = document.createElement('label');
    commentLabel.textContent = approve ? 'Comentário ao validar (opcional)' : 'Motivo da rejeição';
    const commentInput = document.createElement('textarea');
    if (!approve) commentInput.required = true;
    commentLabel.appendChild(commentInput);
    form.appendChild(commentLabel);

    const menu = document.createElement('menu');
    menu.appendChild(createActionButton('Cancelar', () => dlg.close(), 'secondary'));

    const msgBox = document.createElement('div');
    msgBox.className = 'msg';

    menu.appendChild(createActionButton(approve ? 'Validar' : 'Rejeitar', async () => {
      msgBox.textContent = '';
      msgBox.classList.remove('error');
      try {
        const comment = commentInput.value.trim();
        if (!approve && !comment) throw new Error('Informe o motivo da rejeição.');
        await processSignalValidation(signal, approve, comment);
        dlg.close();
        window.alert(approve ? 'Sinalização validada.' : 'Sinalização rejeitada.');
      } catch (err) {
        msgBox.textContent = err.message || String(err);
        msgBox.classList.add('error');
      }
    }));
    form.appendChild(menu);
    form.appendChild(msgBox);

    dlg.appendChild(form);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  async function processSignalValidation(signal, approve, comment) {
    const params = {
      p_signal_id: signal.id,
      p_approve: approve,
      p_comment: comment || null
    };
    const { data, error } = await sb.rpc('prazo_signal_validate', params);
    if (error) throw error;
    const card = data?.card || signal.card;
    await reloadCard(card);
    await loadSignals();
  }

  async function reloadCard(card) {
    try {
      if (card === 'pareceres') await loadPareceres();
      else if (card === 'remocao') await loadRemocao();
      else if (card === 'obras') await loadObra();
      else if (card === 'monitor') await loadMonitor();
      else if (card === 'revogar') await loadADHEL();
    } catch (err) {
      console.error('[prazos] Falha ao recarregar card', card, err);
    }
  }

  function applySignalHighlights(tbody, cardKey) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      tr.classList.remove('pending-validation', 'signal-rejected', 'signal-validated');
      const dataRow = tr.dataset.row;
      if (!dataRow) return;
      try {
        const data = JSON.parse(dataRow);
        const config = mapRowToSignal(data, cardKey);
        if (!config) return;
        const latest = getLatestSignal(config);
        if (!latest) return;
        if (latest.status === 'PENDENTE') tr.classList.add('pending-validation');
        else if (latest.status === 'REJEITADO') tr.classList.add('signal-rejected');
        else if (latest.status === 'VALIDADO') tr.classList.add('signal-validated');
      } catch (_) {}
    });
  }

  // Formata NUP (Número Único de Protocolo) no padrão XXXXX/XXXX-XX,
  // desconsiderando os 5 dígitos iniciais (prefixo) caso existam.
  function formatNup(nup) {
    if (!nup) return '';
    const digits = String(nup).replace(/\D/g, '');
    if (digits.length <= 5) return '';
    const rest = digits.slice(5);
    const part1 = rest.slice(0, 6);
    const part2 = rest.slice(6, 10);
    const part3 = rest.slice(10, 12);
    let formatted = part1;
    if (part2) formatted += `/${part2}`;
    if (part3) formatted += `-${part3}`;
    return formatted;
  }

  const PARECERES_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    {
      key: 'type_label',
      label: 'Tipo',
      value: r => r.type_label || r.type || ''
    },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) },
    createActionColumn('pareceres')
  ];

  const REMOCAO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) },
    createActionColumn('remocao')
  ];

  const OBRAS_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
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
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) },
    createActionColumn('obras')
  ];

  const SOBRESTAMENTO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  const MONITOR_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'type', label: 'Tipo' },
    { key: 'number', label: 'Número', value: r => (r.number ? String(r.number).padStart(6, '0') : '') },
    createActionColumn('monitor')
  ];

  const DOAGA_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  const ADHEL_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => formatNup(r.nup) },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : '') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') },
    createActionColumn('revogar')
  ];

  function bindRowLinks(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      try {
        const data = JSON.parse(tr.dataset.row);
        if (!data?.nup) return;
        tr.addEventListener('click', () => {
          sessionStorage.setItem('procPreSelect', data.nup);
          window.location.href = 'processos.html';
        });
      } catch {}
    });
  }

  function getPareceresRows() {
    return pareceres;
  }

  function renderPareceres() {
    const rows = getPareceresRows();
    const { tbody } = Utils.renderTable('prazoParec', PARECERES_COLUMNS, rows);
    bindRowLinks(tbody);
    applySignalHighlights(tbody, 'pareceres');
  }

  async function loadPareceres() {
    const [intRes, extRes] = await Promise.all([
      sb
        .from('v_prazo_pareceres')
        .select('origin_id,origin_table,origin_kind,process_id,nup,type,due_date,days_remaining,deadline_days'),
      sb
        .from('v_prazo_pareceres_externos')
        .select('origin_id,origin_table,origin_kind,process_id,nup,type,due_date,days_remaining,deadline_days')
    ]);

    const normalize = rows => (Array.isArray(rows) ? rows : []);

    const parecerRows = normalize(intRes.data)
      .map(row => ({
        ...row,
        type_label: `Parecer ${row.type}`
      }));

    const sigadaerRows = normalize(extRes.data)
      .map(row => ({
        ...row,
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
    const rows = getRemocaoRows();
    const { tbody } = Utils.renderTable('prazoRemocao', REMOCAO_COLUMNS, rows);
    bindRowLinks(tbody);
    applySignalHighlights(tbody, 'remocao');
  }

  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('notification_id,origin_table,process_id,nup,due_date,days_remaining');
    remocao = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderRemocao();
  }

  function getObraRows() {
    return obras;
  }

  function renderObra() {
    const rows = getObraRows();
    const { tbody } = Utils.renderTable('prazoObra', OBRAS_COLUMNS, rows);
    bindRowLinks(tbody);
    applySignalHighlights(tbody, 'obras');
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('process_id,nup,origin_id,origin_table,due_date,days_remaining,em_atraso');
    obras = data || [];
    renderObra();
  }

  function getSobrestamentoRows() {
    return sobrestamento;
  }

  function renderSobrestamento() {
    const rows = getSobrestamentoRows();
    const { tbody } = Utils.renderTable('prazoSobrestamento', SOBRESTAMENTO_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadSobrestamento() {
    const { data } = await sb.from('v_prazo_sobrestamento')
      .select('nup,due_date,days_remaining');
    sobrestamento = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderSobrestamento();
  }

  function getMonitorRows() {
    return monitor;
  }

  function renderMonitor() {
    const rows = getMonitorRows();
    const { tbody } = Utils.renderTable('prazoMonit', MONITOR_COLUMNS, rows);
    bindRowLinks(tbody);
    applySignalHighlights(tbody, 'monitor');
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('process_id,nup,type,number,origin_table,origin_id');
    monitor = data || [];
    renderMonitor();
  }

  function getDoagaRows() {
    return doaga;
  }

  function renderDOAGA() {
    const rows = getDoagaRows();
    const { tbody } = Utils.renderTable('prazoDOAGA', DOAGA_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadDOAGA() {
    const { data } = await sb.from('v_prazo_do_aga')
      .select('nup,due_date,days_remaining');
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
    const rows = getAdhelRows();
    const { tbody } = Utils.renderTable('prazoADHEL', ADHEL_COLUMNS, rows);
    bindRowLinks(tbody);
    applySignalHighlights(tbody, 'revogar');
  }

  const PDF_SECTIONS = {
    pareceres: { title: 'Pareceres/Info', columns: PARECERES_COLUMNS, getRows: getPareceresRows },
    remocao: { title: 'Remoção/Rebaixamento', columns: REMOCAO_COLUMNS, getRows: getRemocaoRows },
    obras: { title: 'Término de Obra', columns: OBRAS_COLUMNS, getRows: getObraRows },
    sobrestamento: { title: 'Sobrestamento', columns: SOBRESTAMENTO_COLUMNS, getRows: getSobrestamentoRows },
    monitor: { title: 'Leitura/Expedição', columns: MONITOR_COLUMNS, getRows: getMonitorRows },
    doaga: { title: 'Prazo DO-AGA', columns: DOAGA_COLUMNS, getRows: getDoagaRows },
    adhel: { title: 'Revogar plano', columns: ADHEL_COLUMNS, getRows: getAdhelRows }
  };

  function exportPrazoPDF(section) {
    const config = PDF_SECTIONS[section];
    if (!config) return;
    if (!window.jspdf?.jsPDF) {
      alert('Biblioteca de PDF indisponível.');
      return;
    }

    const data = typeof config.getRows === 'function' ? config.getRows() : [];
    const rows = Array.isArray(data) ? data : [];
    const doc = new window.jspdf.jsPDF();
    const margin = 15;
    const lineHeight = 6;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    const maxY = pageHeight - margin;
    let y = margin;

    const ensureSpace = (extra = lineHeight) => {
      if (y + extra > maxY) {
        doc.addPage();
        y = margin;
      }
    };

    const addParagraph = (text, opts = {}) => {
      if (text == null || text === '') return;
      const parts = doc.splitTextToSize(String(text), contentWidth);
      parts.forEach(line => {
        ensureSpace();
        doc.text(line, margin, y, opts);
        y += lineHeight;
      });
    };

    const addGap = (amount = lineHeight) => {
      ensureSpace(amount);
      y += amount;
    };

    doc.setFont(undefined, 'bold');
    doc.setFontSize(14);
    addParagraph(config.title, { align: 'left' });
    addGap(lineHeight / 2);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    addParagraph(`Gerado em: ${Utils.fmtDateTime(new Date())}`);
    addGap(lineHeight / 2);

    if (!rows.length) {
      addParagraph('Nenhum registro disponível.');
    } else {
      rows.forEach(row => {
        const text = config.columns
          .map(col => {
            const label = col.label || '';
            let value = '';
            if (typeof col.pdfValue === 'function') value = col.pdfValue(row);
            else if (typeof col.value === 'function') value = col.value(row);
            else if (col.key) value = row[col.key];
            if (value instanceof Date) value = Utils.fmtDateTime(value);
            if (value == null) value = '';
            value = String(value);
            if (label) return `${label}: ${value}`;
            return value;
          })
          .filter(Boolean)
          .join('  |  ');
        addParagraph(text);
        addGap(lineHeight / 2);
      });
    }

    const url = doc.output('bloburl');
    const win = window.open(url, '_blank');
    if (win) win.opener = null;
  }

  function bindPdfButtons() {
    document.querySelectorAll('[data-pdf]').forEach(btn => {
      btn.addEventListener('click', () => {
        const section = btn.getAttribute('data-pdf');
        exportPrazoPDF(section);
      });
    });
  }

  async function loadADHEL() {
    const { data } = await sb.from('v_prazo_ad_hel')
      .select('process_id,nup,notification_id,origin_table,due_date,days_remaining');
    adhel = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderADHEL();
  }

  async function loadSignals() {
    try {
      const { data, error } = await sb
        .from('v_prazo_signals')
        .select('*')
        .order('signaled_at', { ascending: false });
      if (error) throw error;
      signals = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('[prazos] Falha ao carregar sinalizações', err);
      signals = [];
    }
    indexSignals(signals);
    updateCardBadges();
    updateAlerts();
    renderAllTables();
  }

  function init() {
    bindPdfButtons();
    registerIndicators();
    updateCardBadges();
    updateAlerts();
  }

  async function load() {
    await Promise.all([
      loadPareceres(),
      loadRemocao(),
      loadObra(),
      loadSobrestamento(),
      loadMonitor(),
      loadDOAGA(),
      loadADHEL()
    ]);
    await loadSignals();
  }

  return { init, load };
})();
