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

  const processCache = new Map();
  const pendingSignals = new Map();
  const pendingByCard = new Map();
  const STORAGE_KEY = 'prazos.pendingSignals';
  let pendingRestored = false;

  const CARD_CONTEXTS = {
    pareceres: {
      key: 'pareceres',
      tableId: 'prazoParec',
      cardTitle: 'Pareceres/Info',
      signalAction: 'Sinalização Pareceres/Info',
      validateAction: 'Sinalização Pareceres/Info validada',
      rejectAction: 'Sinalização Pareceres/Info rejeitada',
      typeLabel: row => row.type_label || row.type || 'Pareceres/Info',
      dateField: 'datetime',
      dateKey: 'data_hora_recebimento',
      dateLabel: 'Data/hora do recebimento',
      numberLabel: 'Número do SIGADAER (se houver)',
      observationLabel: 'Observação (se houver)'
    },
    remocao: {
      key: 'remocao',
      tableId: 'prazoRemocao',
      cardTitle: 'Remoção/Rebaixamento',
      signalAction: 'Sinalização Remoção/Rebaixamento',
      validateAction: 'Sinalização Remoção/Rebaixamento validada',
      rejectAction: 'Sinalização Remoção/Rebaixamento rejeitada',
      typeLabel: () => 'Remoção/Rebaixamento',
      dateField: 'datetime',
      dateKey: 'data_hora_recebimento',
      dateLabel: 'Data/hora do recebimento da informação',
      numberLabel: 'Número do SIGADAER (se houver)',
      observationLabel: 'Observação (se houver)'
    },
    obras: {
      key: 'obras',
      tableId: 'prazoObra',
      cardTitle: 'Término de Obra',
      signalAction: 'Sinalização Término de Obra',
      validateAction: 'Sinalização Término de Obra validada',
      rejectAction: 'Sinalização Término de Obra rejeitada',
      typeLabel: () => 'Término de Obra',
      dateField: 'date',
      dateKey: 'data_termino',
      dateLabel: 'Data do término da obra',
      numberLabel: 'Número do SIGADAER (se houver)',
      observationLabel: 'Observação (se houver)'
    },
    leitura: {
      key: 'leitura',
      tableId: 'prazoMonit',
      cardTitle: 'Leitura/Expedição',
      signalAction: 'Sinalização Leitura/Expedição',
      validateAction: 'Sinalização Leitura/Expedição validada',
      rejectAction: 'Sinalização Leitura/Expedição rejeitada',
      typeLabel: row => row.type || 'Leitura/Expedição',
      dateField: 'datetime',
      dateKey: 'data_hora_leitura',
      dateLabel: 'Data/hora da leitura da notificação ou expedição do SIGADAER',
      numberLabel: 'Número do SIGADAER (se houver)',
      observationLabel: 'Observação (se houver)'
    },
    revogar: {
      key: 'revogar',
      tableId: 'prazoADHEL',
      cardTitle: 'Revogar plano',
      signalAction: 'Sinalização Revogar plano',
      validateAction: 'Sinalização Revogar plano validada',
      rejectAction: 'Sinalização Revogar plano rejeitada',
      typeLabel: () => 'Revogar plano',
      dateField: 'date',
      dateKey: 'data_informacao',
      dateLabel: 'Data da inserção da informação do AD/HEL nas publicações AIS',
      numberLabel: 'Número do SIGADAER (se houver)',
      observationLabel: 'Observação (se houver)'
    }
  };

  const CARD_CONTEXT_BY_TABLE = Object.values(CARD_CONTEXTS).reduce((acc, ctx) => {
    acc[ctx.tableId] = ctx;
    return acc;
  }, {});

  function getCardContextByTableId(tableId) {
    return CARD_CONTEXT_BY_TABLE[tableId] || null;
  }

  function makePendingKey(cardKey, nup) {
    return `${cardKey || 'na'}::${nup || ''}`;
  }

  function parsePendingKey(key) {
    const [cardKey, nup] = String(key || '').split('::');
    return { cardKey, nup };
  }

  function ensurePendingSet(cardKey) {
    if (!cardKey) return null;
    let set = pendingByCard.get(cardKey);
    if (!set) {
      set = new Set();
      pendingByCard.set(cardKey, set);
    }
    return set;
  }

  function escapeSelector(value) {
    const text = String(value ?? '');
    if (window.CSS?.escape) return window.CSS.escape(text);
    return text.replace(/["'\\]/g, '\\$&');
  }

  function getCardMetaElement(cardKey) {
    if (!cardKey) return null;
    const ctx = CARD_CONTEXTS[cardKey];
    if (!ctx) return null;
    if (!ctx.metaEl) {
      const container = document.getElementById(ctx.tableId);
      const card = container?.closest('.card');
      ctx.metaEl = card?.querySelector('.card-title-meta') || null;
    }
    return ctx.metaEl || null;
  }

  function findRowElement(cardKey, nup) {
    if (!cardKey) return null;
    const ctx = CARD_CONTEXTS[cardKey];
    if (!ctx) return null;
    const tbody = document.querySelector(`#${ctx.tableId} tbody`);
    if (!tbody) return null;
    return tbody.querySelector(`tr[data-nup="${escapeSelector(nup)}"]`);
  }

  function setRowValidationBadge(cardKey, nup, enabled) {
    if (!cardKey) return;
    const tr = findRowElement(cardKey, nup);
    if (!tr) return;
    const cell = tr.querySelector('td');
    if (!cell) return;
    let badge = tr.querySelector('.validation-indicator');
    if (enabled) {
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'validation-indicator badge badge-success';
        badge.textContent = 'VALIDAR';
        cell.appendChild(badge);
      }
    } else if (badge) {
      badge.remove();
    }
  }

  function updateCardMetaIndicator(cardKey) {
    if (!cardKey) return;
    const meta = getCardMetaElement(cardKey);
    if (!meta) return;
    const set = pendingByCard.get(cardKey);
    const count = set ? set.size : 0;
    let pill = meta.querySelector('.validation-pill');
    if (count > 0) {
      if (!pill) {
        pill = document.createElement('span');
        pill.className = 'validation-pill';
        pill.textContent = 'VALIDAR';
        meta.appendChild(pill);
      }
    } else if (pill) {
      pill.remove();
    }
  }

  function persistPendingState() {
    if (!window.localStorage) return;
    try {
      const snapshot = Array.from(pendingSignals.entries()).map(([key, value]) => ({
        key,
        value
      }));
      if (snapshot.length === 0) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      }
    } catch (err) {
      console.warn('Falha ao persistir sinalizações pendentes:', err);
    }
  }

  function refreshAllCardIndicators() {
    pendingByCard.forEach((_, cardKey) => updateCardMetaIndicator(cardKey));
  }

  function upsertPending(cardKey, nup, value, options = {}) {
    if (!cardKey || !nup) return null;
    const { updateBadge = false, skipPersist = false, skipMeta = false } = options;
    const key = makePendingKey(cardKey, nup);
    pendingSignals.set(key, value);
    const set = ensurePendingSet(cardKey);
    if (set) set.add(key);
    if (updateBadge) {
      setRowValidationBadge(cardKey, nup, true);
    }
    if (!skipMeta) {
      updateCardMetaIndicator(cardKey);
    }
    if (!skipPersist) {
      persistPendingState();
    }
    return key;
  }

  function deletePendingEntry(key, options = {}) {
    if (!key) return;
    const { skipBadge = false, skipPersist = false, skipMeta = false } = options;
    const { cardKey, nup } = parsePendingKey(key);
    if (!cardKey || !nup) return;
    if (!pendingSignals.has(key)) return;
    pendingSignals.delete(key);
    const set = pendingByCard.get(cardKey);
    if (set) {
      set.delete(key);
      if (set.size === 0) pendingByCard.delete(cardKey);
    }
    if (!skipBadge) {
      setRowValidationBadge(cardKey, nup, false);
    }
    if (!skipMeta) {
      updateCardMetaIndicator(cardKey);
    }
    if (!skipPersist) {
      persistPendingState();
    }
  }

  function clearPending(cardKey, nup, options = {}) {
    if (!cardKey || !nup) return;
    const key = makePendingKey(cardKey, nup);
    deletePendingEntry(key, options);
  }

  function restorePendingState({ applyIndicators = true } = {}) {
    if (!window.localStorage) return;
    if (!pendingRestored) {
      pendingRestored = true;
      let stored = null;
      try {
        stored = window.localStorage.getItem(STORAGE_KEY);
      } catch (err) {
        console.warn('Falha ao ler sinalizações pendentes:', err);
        stored = null;
      }
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            parsed.forEach(entry => {
              if (!entry || typeof entry !== 'object') return;
              const key = entry.key;
              const value = entry.value;
              if (!key || !value || typeof value !== 'object') return;
              const { cardKey, nup } = parsePendingKey(key);
              if (!cardKey || !nup) return;
              upsertPending(cardKey, nup, value, {
                skipPersist: true,
                skipMeta: true
              });
            });
          }
        } catch (err) {
          console.warn('Falha ao interpretar sinalizações pendentes:', err);
        }
      }
    }
    if (applyIndicators) {
      refreshAllCardIndicators();
    }
  }

  function refreshRowValidationBadge(nup, cardKey) {
    if (!cardKey || !nup) return;
    const key = makePendingKey(cardKey, nup);
    const hasPending = pendingSignals.has(key);
    setRowValidationBadge(cardKey, nup, hasPending);
  }

  function syncPendingForCard(cardKey, rows) {
    if (!cardKey) return;
    const set = pendingByCard.get(cardKey);
    if (!set || set.size === 0) {
      updateCardMetaIndicator(cardKey);
      return;
    }
    const current = new Set(
      (rows || [])
        .map(row => row?.nup)
        .filter(nup => typeof nup === 'string' && nup)
    );
    const toRemove = [];
    set.forEach(key => {
      const { nup } = parsePendingKey(key);
      if (!current.has(nup)) {
        toRemove.push(key);
      }
    });
    if (toRemove.length) {
      toRemove.forEach(key => {
        deletePendingEntry(key, { skipBadge: true, skipPersist: true, skipMeta: true });
      });
      if (set.size === 0) {
        pendingByCard.delete(cardKey);
      }
      persistPendingState();
    }
    updateCardMetaIndicator(cardKey);
  }

  async function fetchProcessByNup(nup) {
    const norm = (nup || '').trim();
    if (!norm) throw new Error('NUP não informado.');
    if (processCache.has(norm)) {
      return { id: processCache.get(norm) };
    }
    const { data, error } = await sb
      .from('processes')
      .select('id')
      .eq('nup', norm)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error('Processo não encontrado na base.');
    processCache.set(norm, data.id);
    return { id: data.id };
  }

  async function insertHistoryRecord(processId, action, details) {
    if (!processId) throw new Error('Processo inválido.');
    const payload = { process_id: processId, action, details };
    try {
      const user = await (window.getUser ? window.getUser() : Promise.resolve(null));
      if (user?.id) payload.created_by = user.id;
    } catch (_) {
      // ignora falha ao obter usuário; Supabase aplicará defaults
    }
    const { error } = await sb.from('history').insert(payload);
    if (error) throw error;
  }

  async function fetchLatestSignalDetails(processId, action) {
    if (!processId || !action) return null;
    const { data, error } = await sb
      .from('history')
      .select('details')
      .eq('process_id', processId)
      .eq('action', action)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const det = Array.isArray(data) && data.length ? data[0].details : null;
    if (!det) return null;
    if (typeof det === 'string') {
      try { return JSON.parse(det); } catch { return det; }
    }
    return det;
  }

  function toIsoOrNull(value, isDateOnly = false) {
    if (!value) return null;
    if (isDateOnly) return value;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function normalizeSignalDetails(details, context, row) {
    const base =
      details && typeof details === 'object'
        ? { ...details }
        : {};
    if (!base.tipo) {
      base.tipo = context.typeLabel(row);
    }
    if (!('numero_sigadaer' in base)) {
      base.numero_sigadaer = null;
    }
    return base;
  }

  function buildSignalForm(context, row) {
    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'prazo-popup';

    const heading = document.createElement('h3');
    heading.textContent = `Sinalizar ${context.cardTitle}`;
    form.appendChild(heading);

    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent = `${row.nup} • ${context.typeLabel(row)}`;
    form.appendChild(info);

    const fields = document.createElement('div');
    fields.className = 'prazo-popup-fields';

    let dateInput = null;
    if (context.dateField === 'datetime') {
      const label = document.createElement('label');
      label.textContent = context.dateLabel;
      dateInput = document.createElement('input');
      dateInput.type = 'datetime-local';
      dateInput.required = true;
      label.appendChild(dateInput);
      fields.appendChild(label);
    } else if (context.dateField === 'date') {
      const label = document.createElement('label');
      label.textContent = context.dateLabel;
      dateInput = document.createElement('input');
      dateInput.type = 'date';
      dateInput.required = true;
      label.appendChild(dateInput);
      fields.appendChild(label);
    }

    const numberLabel = document.createElement('label');
    numberLabel.textContent = context.numberLabel;
    const numberInput = document.createElement('input');
    numberInput.type = 'text';
    numberInput.placeholder = 'Opcional';
    numberLabel.appendChild(numberInput);
    fields.appendChild(numberLabel);

    const obsLabel = document.createElement('label');
    obsLabel.textContent = context.observationLabel;
    const obsInput = document.createElement('textarea');
    obsInput.placeholder = 'Opcional';
    obsLabel.appendChild(obsInput);
    fields.appendChild(obsLabel);

    form.appendChild(fields);

    const msg = document.createElement('div');
    msg.className = 'msg';
    form.appendChild(msg);

    const menu = document.createElement('menu');
    menu.className = 'prazo-actions';
    const sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.textContent = 'Enviar';
    menu.appendChild(sendBtn);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Fechar';
    closeBtn.addEventListener('click', () => form.closest('dialog')?.close());
    menu.appendChild(closeBtn);
    form.appendChild(menu);

    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      msg.textContent = '';
      msg.classList.remove('error');
      try {
        const rawDate = dateInput?.value.trim();
        if (dateInput && !rawDate) throw new Error('Preencha a data solicitada.');
        const sigNumber = numberInput.value.trim() || null;
        const observation = obsInput.value.trim() || null;
        const details = {
          tipo: context.typeLabel(row),
          numero_sigadaer: sigNumber,
          observacao: observation
        };
        if (dateInput) {
          const isDateOnly = context.dateField === 'date';
          const converted = toIsoOrNull(rawDate, isDateOnly);
          if (!converted) throw new Error('Data inválida.');
          details[context.dateKey] = converted;
        }

        const { id: processId } = await fetchProcessByNup(row.nup);
        await insertHistoryRecord(processId, context.signalAction, details);

        upsertPending(context.key, row.nup, {
          processId,
          details,
          typeLabel: context.typeLabel(row)
        }, { updateBadge: true });

        form.closest('dialog')?.close();
      } catch (err) {
        msg.textContent = err?.message || String(err);
        msg.classList.add('error');
      }
    });

    return form;
  }

  function buildDetailsList(details) {
    const list = document.createElement('dl');
    list.className = 'prazo-details';
    const entries = [
      ['Tipo', details?.tipo || '—'],
      ['Número SIGADAER', details?.numero_sigadaer || '—'],
      ['Observação', details?.observacao || '—']
    ];
    entries.forEach(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      list.appendChild(dt);
      const dd = document.createElement('dd');
      dd.textContent = value;
      list.appendChild(dd);
    });
    return list;
  }

  async function ensureSignalInfo(row, context) {
    const key = makePendingKey(context.key, row.nup);
    let info = pendingSignals.get(key) || null;
    let processId = info?.processId;
    if (!processId) {
      const proc = await fetchProcessByNup(row.nup);
      processId = proc.id;
    }
    let details = info?.details;
    if (!details) {
      details = await fetchLatestSignalDetails(processId, context.signalAction);
    }
    if (!details) {
      throw new Error('Nenhuma sinalização registrada para este processo.');
    }
    info = { processId, details, typeLabel: info?.typeLabel || context.typeLabel(row) };
    upsertPending(context.key, row.nup, info);
    return { key, info };
  }

  function openSignalPopup(row, context) {
    if (!context) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'prazo-dialog';
    dlg.appendChild(buildSignalForm(context, row));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  function openValidationPopup(row, context) {
    if (!context) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'prazo-dialog';

    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'prazo-popup';

    const heading = document.createElement('h3');
    heading.textContent = `Validação – ${context.cardTitle}`;
    form.appendChild(heading);

    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent = `${row.nup} • ${context.typeLabel(row)}`;
    form.appendChild(info);

    const detailsBox = document.createElement('div');
    detailsBox.className = 'prazo-popup-fields';
    form.appendChild(detailsBox);

    const msg = document.createElement('div');
    msg.className = 'msg';
    form.appendChild(msg);

    const obsLabel = document.createElement('label');
    obsLabel.textContent = 'Observação da rejeição (obrigatória para rejeitar)';
    const obsInput = document.createElement('textarea');
    obsInput.placeholder = 'Informe a justificativa para rejeitar';
    obsInput.disabled = true;
    obsLabel.appendChild(obsInput);
    form.appendChild(obsLabel);

    const menu = document.createElement('menu');
    menu.className = 'prazo-actions';

    const validateBtn = document.createElement('button');
    validateBtn.type = 'button';
    validateBtn.textContent = 'Validar';
    validateBtn.disabled = true;
    menu.appendChild(validateBtn);

    const rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.textContent = 'Rejeitar';
    rejectBtn.disabled = true;
    menu.appendChild(rejectBtn);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Fechar';
    closeBtn.addEventListener('click', () => dlg.close());
    menu.appendChild(closeBtn);

    form.appendChild(menu);

    let signalInfo = null;

    function showError(err) {
      msg.textContent = err?.message || String(err);
      msg.classList.add('error');
    }

    function clearError() {
      msg.textContent = '';
      msg.classList.remove('error');
    }

    validateBtn.addEventListener('click', async () => {
      clearError();
      try {
        if (!signalInfo) {
          throw new Error('Nenhuma sinalização encontrada para este processo.');
        }

        const details = normalizeSignalDetails(signalInfo.details, context, row);
        await insertHistoryRecord(signalInfo.processId, context.validateAction, details);
        upsertPending(context.key, row.nup, {
          processId: signalInfo.processId,
          details,
          typeLabel: signalInfo.typeLabel || context.typeLabel(row)
        });
        dlg.close();
      } catch (err) {
        showError(err);
      }
    });

    rejectBtn.addEventListener('click', async () => {
      clearError();
      try {
        if (!signalInfo) {
          throw new Error('Nenhuma sinalização encontrada para este processo.');
        }

        const observation = obsInput.value.trim();
        if (!observation) {
          throw new Error('Informe a observação para rejeitar a sinalização.');
        }

        const details = normalizeSignalDetails(signalInfo.details, context, row);
        details.observacao = observation;

        await insertHistoryRecord(signalInfo.processId, context.rejectAction, details);
        clearPending(context.key, row.nup);

        dlg.close();
      } catch (err) {
        showError(err);
      }
    });

    ensureSignalInfo(row, context)
      .then(({ info: fetched }) => {
        signalInfo = fetched;
        detailsBox.innerHTML = '';
        detailsBox.appendChild(buildDetailsList(fetched.details));
        validateBtn.disabled = false;
        rejectBtn.disabled = false;
        obsInput.disabled = false;
      })
      .catch(err => {
        detailsBox.innerHTML = '';
        const warn = document.createElement('div');
        warn.className = 'msg error';
        warn.textContent = err?.message || 'Não foi possível obter os detalhes da sinalização.';
        detailsBox.appendChild(warn);
        validateBtn.disabled = true;
        rejectBtn.disabled = true;
        obsInput.disabled = true;
        showError(err);
      });

    dlg.appendChild(form);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  function openProcessActionsPopup(row, context) {
    if (!row || !row.nup) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'prazo-dialog';
    const box = document.createElement('div');
    box.className = 'prazo-popup';

    const title = document.createElement('h3');
    title.textContent = `Processo ${row.nup}`;
    box.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'muted';
    const typeInfo = context ? context.typeLabel(row) : (row.type_label || row.type || '');
    subtitle.textContent = [context?.cardTitle, typeInfo].filter(Boolean).join(' • ');
    box.appendChild(subtitle);

    const actions = document.createElement('menu');
    actions.className = 'prazo-actions';

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.textContent = 'Ver na lista de processos';
    viewBtn.addEventListener('click', () => {
      sessionStorage.setItem('procPreSelect', row.nup);
      dlg.close();
      window.location.href = 'processos.html';
    });
    actions.appendChild(viewBtn);

    const signalBtn = document.createElement('button');
    signalBtn.type = 'button';
    signalBtn.textContent = 'Sinalizar';
    if (context) {
      signalBtn.addEventListener('click', () => {
        dlg.close();
        openSignalPopup(row, context);
      });
    } else {
      signalBtn.disabled = true;
      signalBtn.title = 'Sinalização indisponível para este card.';
    }
    actions.appendChild(signalBtn);

    const validationBtn = document.createElement('button');
    validationBtn.type = 'button';
    validationBtn.textContent = 'Validação';
    const isAdmin = window.AccessGuards?.getRole?.() === 'Administrador';
    if (!context) {
      validationBtn.disabled = true;
      validationBtn.title = 'Validação indisponível para este card.';
    } else if (!isAdmin) {
      validationBtn.disabled = true;
      validationBtn.title = 'Apenas Administradores podem validar sinalizações.';
    } else {
      validationBtn.addEventListener('click', () => {
        dlg.close();
        openValidationPopup(row, context);
      });
    }
    actions.appendChild(validationBtn);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Fechar';
    closeBtn.addEventListener('click', () => dlg.close());
    actions.appendChild(closeBtn);

    box.appendChild(actions);
    dlg.appendChild(box);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  const PARECERES_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    {
      key: 'type_label',
      label: 'Tipo',
      value: r => r.type_label || r.type || ''
    },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const REMOCAO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const OBRAS_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
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
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  const MONITOR_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'type', label: 'Tipo' },
    { key: 'number', label: 'Número', value: r => (r.number ? String(r.number).padStart(6, '0') : '') }
  ];

  const DOAGA_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  const ADHEL_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : '') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  function bindRowLinks(tbody, context = null) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      if (tr.dataset.prazoBound === '1') return;
      try {
        const data = JSON.parse(tr.dataset.row);
        if (!data?.nup) return;
        tr.dataset.prazoBound = '1';
        tr.dataset.nup = data.nup;
        tr.addEventListener('click', () => openProcessActionsPopup(data, context));
        if (context) refreshRowValidationBadge(data.nup, context.key);
      } catch {}
    });
  }

  function getPareceresRows() {
    return pareceres;
  }

  function renderPareceres() {
    const rows = getPareceresRows();
    const { tbody } = Utils.renderTable('prazoParec', PARECERES_COLUMNS, rows);
    bindRowLinks(tbody, getCardContextByTableId('prazoParec'));
  }

  async function loadPareceres() {
    const [intRes, extRes] = await Promise.all([
      sb
        .from('v_prazo_pareceres')
        .select('nup,type,due_date,days_remaining,deadline_days'),
      sb
        .from('v_prazo_pareceres_externos')
        .select('nup,type,due_date,days_remaining,deadline_days')
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
    syncPendingForCard('pareceres', pareceres);
    renderPareceres();
  }

  function getRemocaoRows() {
    return remocao;
  }

  function renderRemocao() {
    const rows = getRemocaoRows();
    const { tbody } = Utils.renderTable('prazoRemocao', REMOCAO_COLUMNS, rows);
    bindRowLinks(tbody, getCardContextByTableId('prazoRemocao'));
  }

  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('nup,due_date,days_remaining');
    remocao = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    syncPendingForCard('remocao', remocao);
    renderRemocao();
  }

  function getObraRows() {
    return obras;
  }

  function renderObra() {
    const rows = getObraRows();
    const { tbody } = Utils.renderTable('prazoObra', OBRAS_COLUMNS, rows);
    bindRowLinks(tbody, getCardContextByTableId('prazoObra'));
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,due_date,days_remaining,em_atraso');
    obras = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    syncPendingForCard('obras', obras);
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
    sobrestamento = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderSobrestamento();
  }

  function getMonitorRows() {
    return monitor;
  }

  function renderMonitor() {
    const rows = getMonitorRows();
    const { tbody } = Utils.renderTable('prazoMonit', MONITOR_COLUMNS, rows);
    bindRowLinks(tbody, getCardContextByTableId('prazoMonit'));
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup,type,number');
    monitor = data || [];
    syncPendingForCard('leitura', monitor);
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
    bindRowLinks(tbody, getCardContextByTableId('prazoADHEL'));
  }

  async function loadADHEL() {
    const { data } = await sb.from('v_prazo_ad_hel')
      .select('nup,due_date,days_remaining');
    adhel = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    syncPendingForCard('revogar', adhel);
    renderADHEL();
  }

  function init() {
    Object.values(CARD_CONTEXTS).forEach(ctx => getCardMetaElement(ctx.key));
    restorePendingState();
  }

  async function load() {
    restorePendingState({ applyIndicators: false });
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
