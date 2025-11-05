// public/modules/prazos.js
window.Modules = window.Modules || {};
window.Modules.prazos = (() => {
  const U = Utils;
  const FLAG_ALLOWED_ROLES = new Set(['Administrador', 'Analista OACO']);

  function canUserTriggerFlag() {
    const role = AccessGuards?.getRole ? AccessGuards.getRole() : null;
    return role ? FLAG_ALLOWED_ROLES.has(role) : false;
  }

  function notifyFlagAccessDenied() {
    const message = AccessGuards?.message || 'Função não disponível para o seu perfil de acesso.';
    try {
      window.alert(message);
    } catch (err) {
      console.warn('Acesso negado à funcionalidade de sinalização.', err);
    }
  }

  let pareceres = [];
  let monitor = [];
  let adhel = [];

  let flagMap = new Map();

  const CARD_CONFIG = {
    pareceres: {
      label: 'Pareceres/Info',
      elementId: 'prazoParec',
      metaId: 'cardMetaPareceres',
      supportsFlagging: true,
      form: {
        kind: 'datetime',
        eventLabel: 'Data/hora do recebimento de pareceres',
        eventKey: 'data_hora_recebimento',
        numberLabel: 'Número do SIGADAER (se houver)',
        obsLabel: 'Observação (se houver)'
      }
    },
    monitor: {
      label: 'Leitura/Expedição',
      elementId: 'prazoMonit',
      metaId: 'cardMetaMonitor',
      supportsFlagging: true,
      form: {
        kind: 'datetime',
        eventLabel: 'Data/hora da leitura da notificação ou expedição do SIGADAER',
        eventKey: 'data_hora_leitura',
        numberLabel: 'Número do SIGADAER (se houver)',
        obsLabel: 'Observação (se houver)'
      }
    },
    adhel: {
      label: 'Revogar plano',
      elementId: 'prazoADHEL',
      metaId: 'cardMetaAdhel',
      supportsFlagging: true,
      form: {
        kind: 'date',
        eventLabel: 'Data da inserção da informação do AD/HEL nas publicações AIS',
        eventKey: 'data_insercao_adhel',
        numberLabel: 'Número do SIGADAER (se houver)',
        obsLabel: 'Observação (se houver)'
      }
    }
  };

  const PARECERES_COLUMNS = () => [
    { key: 'nup', label: 'NUP', render: row => renderNupCell('pareceres', row) },
    { key: 'type_label', label: 'Tipo', value: r => r.type_label || r.type || '' },
    { key: 'due_date', label: 'Prazo', value: r => U.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => U.daysBetween(new Date(), r.due_date) }
  ];

  const MONITOR_COLUMNS = () => [
    { key: 'nup', label: 'NUP', render: row => renderNupCell('monitor', row) },
    { key: 'type', label: 'Tipo', value: r => r.type || '' },
    { key: 'number', label: 'Número', render: r => (r.number ? String(r.number).padStart(6, '0') : '') }
  ];

  const ADHEL_COLUMNS = () => [
    { key: 'nup', label: 'NUP', render: row => renderNupCell('adhel', row) },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? U.fmtDate(r.due_date) : '') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? U.daysBetween(new Date(), r.due_date) : '') }
  ];

  function getCardConfig(cardKey) {
    return CARD_CONFIG[cardKey] || {
      label: 'Prazos',
      elementId: null,
      metaId: null,
      supportsFlagging: false
    };
  }

  function makeItemKey(cardKey, row = {}) {
    const processId = row.process_id || row.processId || '';
    const baseParts = [cardKey, String(processId || row.nup || '')];
    switch (cardKey) {
      case 'pareceres':
        baseParts.push(row.origin || '');
        baseParts.push(row.type || '');
        baseParts.push(String(row.requested_at || row.start_count || row.due_date || row.deadline_days || ''));
        break;
      case 'monitor':
        baseParts.push(row.type || '');
        baseParts.push(String(row.number || row.id || row.reference || ''));
        baseParts.push(row.origin || '');
        break;
      case 'adhel':
        baseParts.push(String(row.read_date || row.start_count || row.due_date || ''));
        break;
      default:
        baseParts.push(String(row.due_date || ''));
        break;
    }
    return baseParts.join('|');
  }

  function applyRowMeta(cardKey, row = {}) {
    const enriched = { ...row };
    enriched.cardKey = cardKey;
    enriched.item_key = makeItemKey(cardKey, enriched);
    return enriched;
  }

  function renderNupCell(cardKey, row) {
    const parts = [`<div>${row.nup || ''}</div>`];
    if (isRowFlagged(cardKey, row)) {
      parts.push('<div class="badge-validar">VALIDAR</div>');
    }
    return parts.join('');
  }

  function bindRowActions(tbody, cardKey) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      tr.addEventListener('click', () => {
        try {
          const data = JSON.parse(tr.dataset.row);
          showItemActions(cardKey, data);
        } catch (err) {
          console.error('Falha ao interpretar linha de prazo', err);
        }
      });
    });
  }

  function renderTableForCard(cardKey, elementId, columns, rows) {
    const { tbody } = U.renderTable(elementId, columns, rows);
    bindRowActions(tbody, cardKey);
    renderCardBadge(cardKey, rows);
  }

  function renderCardBadge(cardKey, rows) {
    const config = getCardConfig(cardKey);
    if (!config.metaId) return;
    const el = document.getElementById(config.metaId);
    if (!el) return;
    if (!config.supportsFlagging) {
      el.innerHTML = '';
      return;
    }
    const flagged = rows.some(r => isRowFlagged(cardKey, r));
    el.innerHTML = flagged ? '<span class="badge-validar">VALIDAR</span>' : '';
  }

  function getFlag(cardKey, row) {
    const key = row?.item_key || makeItemKey(cardKey, row || {});
    const cardFlags = flagMap.get(cardKey);
    if (!cardFlags) return null;
    return cardFlags.get(key) || null;
  }

  function isRowFlagged(cardKey, row) {
    return !!getFlag(cardKey, row);
  }

  function describeRow(cardKey, row = {}) {
    const prazo = row.due_date ? U.fmtDate(row.due_date) : '';
    switch (cardKey) {
      case 'pareceres':
        return [row.type_label || row.type || '', prazo ? `Prazo ${prazo}` : null]
          .filter(Boolean)
          .join(' • ');
      case 'monitor':
        return [row.type || '', row.number ? `Número ${String(row.number).padStart(6, '0')}` : null]
          .filter(Boolean)
          .join(' • ');
      case 'adhel':
        return [prazo ? `Prazo ${prazo}` : null].filter(Boolean).join('');
      default:
        return prazo ? `Prazo ${prazo}` : '';
    }
  }

  function humanizeKey(key) {
    return key
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function formatDetailValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return U.fmtDateTime(value);
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return U.fmtDate(value);
    }
    return String(value);
  }

  function formatFlagDetails(flag) {
    if (!flag?.details || typeof flag.details !== 'object') return '';
    return Object.entries(flag.details)
      .filter(([, val]) => val != null && val !== '')
      .map(([key, val]) => `<div>${humanizeKey(key)}: ${formatDetailValue(val)}</div>`)
      .join('');
  }

  function viewProcess(row) {
    if (!row?.nup) return;
    sessionStorage.setItem('procPreSelect', row.nup);
    window.location.href = 'processos.html';
  }

  function buildFlagSummary(flag, cardKey) {
    if (!flag) return '';
    const createdAt = flag.created_at ? U.fmtDateTime(flag.created_at) : '';
    const createdBy = flag.created_by_name || '';
    const details = formatFlagDetails(flag);
    const parts = [
      '<div class="flag-status">',
      '<span class="badge-validar">VALIDAR</span>'
    ];
    if (createdAt) parts.push(`<time>${createdAt}</time>`);
    if (createdBy) parts.push(`<div>${createdBy}</div>`);
    if (details) parts.push(`<div>${details}</div>`);
    parts.push('</div>');
    return parts.join('');
  }

  function showItemActions(cardKey, row) {
    const config = getCardConfig(cardKey);
    const flag = getFlag(cardKey, row);
    const role = AccessGuards?.getRole ? AccessGuards.getRole() : null;
    const isAdmin = role === 'Administrador';
    const supportsFlag = !!config.supportsFlagging;
    const canReject = supportsFlag && !!flag && isAdmin;

    const dlg = document.createElement('dialog');
    dlg.className = 'prazo-popup';
    dlg.innerHTML = `
      <form method="dialog">
        <h3>${config.label || 'Item de prazo'}</h3>
        <div class="flag-info">
          <strong>${row.nup || ''}</strong>
          <span>${describeRow(cardKey, row)}</span>
        </div>
        ${flag ? buildFlagSummary(flag, cardKey) : ''}
        <menu>
          <button type="button" data-action="view">Ver na lista de processos</button>
          ${supportsFlag ? `<button type="button" data-action="flag">${flag ? 'Atualizar sinalização' : 'Sinalizar'}</button>` : ''}
          ${canReject ? '<button type="button" class="danger" data-action="reject">Rejeitar sinalização</button>' : ''}
          <button value="cancel" formnovalidate>Fechar</button>
        </menu>
      </form>
    `;
    document.body.appendChild(dlg);

    dlg.addEventListener('close', () => dlg.remove());

    dlg.querySelector('[data-action="view"]')?.addEventListener('click', ev => {
      ev.preventDefault();
      dlg.close();
      viewProcess(row);
    });

    if (supportsFlag) {
      dlg.querySelector('[data-action="flag"]')?.addEventListener('click', ev => {
        ev.preventDefault();
        if (!canUserTriggerFlag()) {
          notifyFlagAccessDenied();
          return;
        }
        dlg.close();
        showFlagForm(cardKey, row, flag);
      });
    }

    if (canReject) {
      dlg.querySelector('[data-action="reject"]')?.addEventListener('click', ev => {
        ev.preventDefault();
        dlg.close();
        showRejectForm(cardKey, row, flag);
      });
    }

    dlg.showModal();
  }

  function setInputValue(input, value, kind) {
    if (!input || value == null) return;
    if (kind === 'datetime') {
      input.value = U.toDateTimeLocalValue(value) || '';
    } else {
      input.value = U.toDateInputValue(value) || '';
    }
  }

  function showFlagForm(cardKey, row, flag) {
    const config = getCardConfig(cardKey);
    if (!config.supportsFlagging) return;
    const formCfg = config.form || {};
    if (!canUserTriggerFlag()) {
      notifyFlagAccessDenied();
      return;
    }

    const dlg = document.createElement('dialog');
    dlg.className = 'prazo-popup';
    dlg.innerHTML = `
      <form method="dialog">
        <h3>${flag ? 'Atualizar sinalização' : 'Sinalizar item'}</h3>
        <div class="flag-info">
          <strong>${row.nup || ''}</strong>
          <span>${describeRow(cardKey, row)}</span>
        </div>
        <label>${formCfg.eventLabel || 'Data'}
          <input type="${formCfg.kind === 'datetime' ? 'datetime-local' : 'date'}" id="flagEvent" required>
        </label>
        <label>${formCfg.numberLabel || 'Número do SIGADAER (se houver)'}
          <input type="text" id="flagNumber" placeholder="Opcional">
        </label>
        <label>${formCfg.obsLabel || 'Observação (se houver)'}
          <textarea id="flagObs" placeholder="Opcional"></textarea>
        </label>
        <menu>
          <button value="cancel" formnovalidate>Fechar</button>
          <button id="flagConfirm" value="default">${flag ? 'Atualizar' : 'Confirmar'}</button>
        </menu>
      </form>
    `;
    document.body.appendChild(dlg);

    dlg.addEventListener('close', () => dlg.remove());

    const eventInput = dlg.querySelector('#flagEvent');
    const numberInput = dlg.querySelector('#flagNumber');
    const obsInput = dlg.querySelector('#flagObs');
    if (flag?.details) {
      setInputValue(eventInput, flag.details[formCfg.eventKey], formCfg.kind);
      if (numberInput && flag.details.numero_sigadaer) numberInput.value = flag.details.numero_sigadaer;
      if (obsInput && flag.details.observacao) obsInput.value = flag.details.observacao;
    }

    dlg.querySelector('#flagConfirm')?.addEventListener('click', async ev => {
      ev.preventDefault();
      const eventValue = eventInput?.value?.trim();
      if (!eventValue) {
        alert('Informe a data solicitada.');
        return;
      }
      const numberValue = numberInput?.value?.trim() || '';
      const obsValue = obsInput?.value?.trim() || '';
      try {
        await saveFlag(cardKey, row, flag, {
          eventValue,
          numberValue,
          obsValue
        });
        dlg.close();
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    dlg.showModal();
  }

  function showRejectForm(cardKey, row, flag) {
    if (!flag) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'prazo-popup';
    dlg.innerHTML = `
      <form method="dialog">
        <h3>Rejeitar sinalização</h3>
        <div class="flag-info">
          <strong>${row.nup || ''}</strong>
          <span>${describeRow(cardKey, row)}</span>
        </div>
        <label>Observação (obrigatória)
          <textarea id="rejectObs" required></textarea>
        </label>
        <menu>
          <button value="cancel" formnovalidate>Fechar</button>
          <button id="rejectConfirm" value="default">Confirmar</button>
        </menu>
      </form>
    `;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());

    dlg.querySelector('#rejectConfirm')?.addEventListener('click', async ev => {
      ev.preventDefault();
      const obsValue = dlg.querySelector('#rejectObs')?.value?.trim();
      if (!obsValue) {
        alert('Informe a observação para rejeitar a sinalização.');
        return;
      }
      try {
        await rejectFlag(cardKey, row, flag, obsValue);
        dlg.close();
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    dlg.showModal();
  }

  function buildFlagDetails(cardKey, prevFlag, inputs) {
    const config = getCardConfig(cardKey);
    const formCfg = config.form || {};
    const details = {};
    if (formCfg.kind === 'datetime') {
      const dt = new Date(inputs.eventValue);
      if (!inputs.eventValue || Number.isNaN(+dt)) {
        throw new Error('Data/hora inválida.');
      }
      details[formCfg.eventKey] = dt.toISOString();
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(inputs.eventValue)) {
        throw new Error('Data inválida.');
      }
      details[formCfg.eventKey] = inputs.eventValue;
    }
    if (inputs.numberValue) details.numero_sigadaer = inputs.numberValue;
    if (inputs.obsValue) details.observacao = inputs.obsValue;
    return details;
  }

  async function resolveProcessId(row) {
    if (row.process_id) return row.process_id;
    if (row.processId) return row.processId;
    if (!row.nup) throw new Error('NUP indisponível para localizar o processo.');
    const { data, error } = await sb
      .from('processes')
      .select('id')
      .eq('nup', row.nup)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new Error('Processo não encontrado para o NUP informado.');
    row.process_id = data.id;
    return data.id;
  }

  async function insertHistory(processId, action, details, user) {
    const payload = {
      process_id: processId,
      action,
      details,
      user_id: user.id,
      user_name: (user.user_metadata && user.user_metadata.name) || user.email || user.id
    };
    const { error } = await sb.from('history').insert(payload);
    if (error) throw error;
  }

  async function saveFlag(cardKey, row, previousFlag, inputs) {
    const user = await getUser();
    if (!user) throw new Error('Sessão expirada. Faça login novamente.');
    const processId = await resolveProcessId(row);
    const itemKey = row.item_key || makeItemKey(cardKey, row);
    const details = buildFlagDetails(cardKey, previousFlag, inputs);
    const config = getCardConfig(cardKey);

    const payload = {
      process_id: processId,
      card: cardKey,
      item_key: itemKey,
      nup: row.nup,
      details,
      created_by: user.id,
      created_by_name: (user.user_metadata && user.user_metadata.name) || user.email || user.id
    };

    const { error: upsertErr } = await sb
      .from('deadline_flags')
      .upsert(payload, { onConflict: 'card,item_key' });
    if (upsertErr) throw upsertErr;

    try {
      await insertHistory(processId, `Sinalização ${config.label}`, {
        nup: row.nup,
        item: describeRow(cardKey, row),
        ...details
      }, user);
    } catch (err) {
      if (!previousFlag) {
        await sb
          .from('deadline_flags')
          .delete()
          .eq('card', cardKey)
          .eq('item_key', itemKey);
      } else {
        await sb.from('deadline_flags').upsert({
          id: previousFlag.id,
          process_id: previousFlag.process_id,
          card: previousFlag.card,
          item_key: previousFlag.item_key,
          nup: previousFlag.nup,
          details: previousFlag.details,
          created_by: previousFlag.created_by,
          created_by_name: previousFlag.created_by_name
        }, { onConflict: 'card,item_key' });
      }
      throw err;
    }

    await loadFlags();
    renderAll();
  }

  async function rejectFlag(cardKey, row, flag, obsValue) {
    const user = await getUser();
    if (!user) throw new Error('Sessão expirada. Faça login novamente.');
    const processId = flag?.process_id || (await resolveProcessId(row));
    const config = getCardConfig(cardKey);

    const { error: delErr } = await sb
      .from('deadline_flags')
      .delete()
      .eq('id', flag.id);
    if (delErr) throw delErr;

    try {
      await insertHistory(processId, `Sinalização rejeitada ${config.label}`, {
        nup: row.nup,
        item: describeRow(cardKey, row),
        ...flag.details,
        observacao_administrador: obsValue
      }, user);
    } catch (err) {
      // Rollback removal para manter destaque até histórico ser registrado.
      await sb.from('deadline_flags').insert({
        process_id: flag.process_id,
        card: flag.card,
        item_key: flag.item_key,
        nup: flag.nup,
        details: flag.details,
        created_by: flag.created_by,
        created_by_name: flag.created_by_name
      });
      throw err;
    }

    await loadFlags();
    renderAll();
  }

  function getPareceresRows() { return pareceres; }
  function getMonitorRows() { return monitor; }
  function getAdhelRows() { return adhel; }

  function renderPareceres() {
    renderTableForCard('pareceres', 'prazoParec', PARECERES_COLUMNS(), getPareceresRows());
  }

  function renderMonitor() {
    renderTableForCard('monitor', 'prazoMonit', MONITOR_COLUMNS(), getMonitorRows());
  }

  function renderADHEL() {
    renderTableForCard('adhel', 'prazoADHEL', ADHEL_COLUMNS(), getAdhelRows());
  }

  function renderAll() {
    renderPareceres();
    renderMonitor();
    renderADHEL();
  }

  async function loadPareceres() {
    try {
      const [intRes, extRes] = await Promise.all([
        sb.from('v_prazo_pareceres').select('process_id,nup,type,requested_at,start_count,due_date,days_remaining,deadline_days'),
        sb.from('v_prazo_pareceres_externos').select('process_id,nup,type,requested_at,start_count,due_date,days_remaining,deadline_days')
      ]);

      const normalize = rows => (Array.isArray(rows) ? rows : []);

      const parecerRows = normalize(intRes.data)
        .filter(row => ['ATM', 'DT', 'CGNA'].includes(row.type))
        .map(row => applyRowMeta('pareceres', {
          ...row,
          origin: 'parecer',
          type_label: `Parecer ${row.type}`
        }));

      const sigadaerRows = normalize(extRes.data)
        .filter(row => row.due_date || typeof row.deadline_days === 'number')
        .map(row => applyRowMeta('pareceres', {
          ...row,
          origin: 'sigadaer',
          type_label: `SIGADAER ${row.type}`,
          days_remaining: typeof row.days_remaining === 'number' ? row.days_remaining : U.daysBetween(new Date(), row.due_date)
        }));

      pareceres = [...parecerRows, ...sigadaerRows]
        .filter(row => row.due_date)
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    } catch (err) {
      console.error('Falha ao carregar prazos de pareceres', err);
      pareceres = [];
    }
  }

  async function loadMonitor() {
    try {
      const { data, error } = await sb
        .from('v_monitorar_tramitacao')
        .select('*');
      if (error) throw error;
      monitor = (Array.isArray(data) ? data : [])
        .map(row => applyRowMeta('monitor', row));
    } catch (err) {
      console.error('Falha ao carregar monitoramento de leitura/expedição', err);
      monitor = [];
    }
  }

  async function loadADHEL() {
    try {
      const { data, error } = await sb
        .from('v_prazo_ad_hel')
        .select('process_id,nup,read_date,start_count,due_date,days_remaining');
      if (error) throw error;
      adhel = (Array.isArray(data) ? data : [])
        .map(row => applyRowMeta('adhel', row))
        .sort((a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31'));
    } catch (err) {
      console.error('Falha ao carregar prazos AD/HEL', err);
      adhel = [];
    }
  }

  async function loadFlags() {
    try {
      const { data, error } = await sb
        .from('deadline_flags')
        .select('id,process_id,card,item_key,nup,details,created_at,created_by,created_by_name');
      if (error) throw error;
      flagMap = new Map();
      (Array.isArray(data) ? data : []).forEach(item => {
        if (!flagMap.has(item.card)) flagMap.set(item.card, new Map());
        flagMap.get(item.card).set(item.item_key, item);
      });
    } catch (err) {
      console.error('Falha ao carregar sinalizações de prazos', err);
      flagMap = new Map();
    }
  }

  function init() {}

  async function load() {
    await Promise.all([
      loadPareceres(),
      loadMonitor(),
      loadADHEL()
    ]);
    await loadFlags();
    renderAll();
  }

  return { init, load };
})();
