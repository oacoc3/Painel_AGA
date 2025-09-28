// public/modules/prazos.js
window.Modules = window.Modules || {};
window.Modules.prazos = (() => {
  // ---------- Utils locais ----------
  const HIGHLIGHT_COLOR = '#fff3b0'; // amarelo claro
  const HL_STORAGE_KEY = 'prazoMonitHighlights'; // sessionStorage

  // Mantém em memória as chaves destacadas (também persiste na sessão)
  const highlightedKeys = new Set(loadHighlights());

  function loadHighlights() {
    try {
      const raw = sessionStorage.getItem(HL_STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }
  function persistHighlights() {
    try {
      sessionStorage.setItem(HL_STORAGE_KEY, JSON.stringify([...highlightedKeys]));
    } catch (_) {}
  }

  // Gera uma chave estável para linhas do card Leitura/Expedição (v_monitorar_tramitacao)
  function makeRowKey(row) {
    const nup = row?.nup ?? '';
    const number = row?.number ?? '';        // pode ser vazio
    const type = row?.type ?? '';            // NCD, FAV etc. — diferencia o seu caso do print
    return `${nup}|${number}|${type}`;
  }

  // ---------- Popups ----------
  let prazoClickDialog = null;
  function ensurePrazoClickDialog() {
    if (prazoClickDialog) return prazoClickDialog;
    const dlg = document.createElement('dialog');
    dlg.id = 'prazoClickDlg';
    dlg.innerHTML = `
      <form method="dialog" style="min-width:320px; max-width:90vw;">
        <h3 style="margin:0 0 12px 0;">Ação para o processo</h3>
        <div id="prazoClickNup" style="margin:0 0 16px 0; font-weight:600;"></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
          <button id="prazoVerLista" value="ver" type="button">Ver na lista de processos</button>
          <button id="prazoSinalizar" value="sinalizar" type="button">Sinalizar</button>
          <button id="prazoFechar" value="fechar" type="button">Fechar</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    prazoClickDialog = dlg;
    return dlg;
  }

  let prazoSignalDialog = null;
  function ensurePrazoSignalDialog() {
    if (prazoSignalDialog) return prazoSignalDialog;
    const dlg = document.createElement('dialog');
    dlg.id = 'prazoSignalDlg';
    dlg.innerHTML = `
      <form method="dialog" style="min-width:320px; max-width:90vw;">
        <h3 style="margin:0 0 12px 0;">Sinalizar Leitura/Expedição</h3>
        <div id="prazoSignalNup" style="margin:0 0 12px 0; font-weight:600;"></div>
        <label style="display:block; margin:8px 0 4px;">Data/hora da leitura da notificação/expedição do SIGADAER <span style="color:#a00">*</span></label>
        <input id="prazoSignalDateTime" type="datetime-local" required style="width:100%;"/>
        <label style="display:block; margin:12px 0 4px;">Observações</label>
        <textarea id="prazoSignalObs" rows="3" style="width:100%; resize:vertical;"></textarea>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; margin-top:12px;">
          <button id="prazoSignalSend" type="button" disabled>Enviar</button>
          <button id="prazoSignalClose" type="button">Fechar</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    prazoSignalDialog = dlg;
    return dlg;
  }

  // ---------- Destaques ----------
  function highlightCardTitle(containerEl) {
    const cardTitle = containerEl.closest('.card')?.querySelector('.card-title h2');
    if (cardTitle) {
      cardTitle.style.backgroundColor = HIGHLIGHT_COLOR;
      cardTitle.style.padding = '2px 4px';
      cardTitle.style.borderRadius = '4px';
    }
  }

  // Aplica destaque nas TRs cujas chaves estão salvas (apenas no card Leitura/Expedição)
  function applySavedHighlights(containerId) {
    if (containerId !== 'prazoMonit') return;
    const box = document.getElementById(containerId);
    if (!box) return;

    let anyHighlighted = false;
    box.querySelectorAll('tbody tr').forEach(tr => {
      const k = tr.dataset.rowkey;
      if (k && highlightedKeys.has(k)) {
        tr.style.backgroundColor = HIGHLIGHT_COLOR;
        anyHighlighted = true;
      }
    });

    if (anyHighlighted) highlightCardTitle(box);
  }

  // Ao enviar do popup, salva a chave, persiste e aplica
  function saveAndHighlightOne({ containerId, rowKey }) {
    if (!rowKey) return;
    highlightedKeys.add(rowKey);
    persistHighlights();

    const box = document.getElementById(containerId);
    if (!box) return;

    const tr = box.querySelector(`tbody tr[data-rowkey="${rowKey}"]`);
    if (tr) tr.style.backgroundColor = HIGHLIGHT_COLOR;
    highlightCardTitle(box);
  }

  // ---------- Abertura dos popups ----------
  function openPrazoSignalPopup(ctx) {
    const { nup, number, type, originId, rowKey } = ctx;
    const dlg = ensurePrazoSignalDialog();

    // Guarda contexto
    dlg.dataset.originId = originId || '';
    dlg.dataset.rowKey = rowKey || '';
    dlg.dataset.nup = String(nup);
    dlg.dataset.number = number != null ? String(number) : '';
    dlg.dataset.type = type != null ? String(type) : '';

    const nupEl = dlg.querySelector('#prazoSignalNup');
    if (nupEl) {
      const parts = [`NUP: ${nup}`];
      if (type) parts.push(`Tipo: ${type}`);
      if (number != null && number !== '') parts.push(`Nº: ${String(number).padStart(6, '0')}`);
      nupEl.textContent = parts.join(' • ');
    }

    const dt = dlg.querySelector('#prazoSignalDateTime');
    const obs = dlg.querySelector('#prazoSignalObs');
    const btnSend = dlg.querySelector('#prazoSignalSend');
    const btnClose = dlg.querySelector('#prazoSignalClose');

    if (dt) dt.value = '';
    if (obs) obs.value = '';
    if (btnSend) btnSend.disabled = true;

    const validate = () => { btnSend.disabled = !dt?.value; };
    dt?.addEventListener('input', validate);

    btnClose.onclick = () => {
      if (typeof dlg.close === 'function') dlg.close();
    };

    btnSend.onclick = () => {
      if (!dt?.value) return; // obrigatório
      // (futuro) Persistir no backend; por ora apenas UI
      if (typeof dlg.close === 'function') dlg.close();
      if (prazoClickDialog && typeof prazoClickDialog.close === 'function') prazoClickDialog.close();

      const selOrigin = dlg.dataset.originId || '';
      const selKey = dlg.dataset.rowKey || '';
      saveAndHighlightOne({ containerId: selOrigin, rowKey: selKey });
    };

    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', 'open');
  }

  function openPrazoClickPopup({ nup, number, type, originId, rowKey }) {
    const dlg = ensurePrazoClickDialog();

    const nupEl = dlg.querySelector('#prazoClickNup');
    if (nupEl) {
      const parts = [`NUP: ${nup}`];
      if (type) parts.push(`Tipo: ${type}`);
      if (number != null && number !== '') parts.push(`Nº: ${String(number).padStart(6, '0')}`);
      nupEl.textContent = parts.join(' • ');
    }

    // Guarda contexto da linha
    dlg.dataset.originId = originId || '';
    dlg.dataset.rowKey = rowKey || '';
    dlg.dataset.nup = String(nup);
    dlg.dataset.number = number != null ? String(number) : '';
    dlg.dataset.type = type != null ? String(type) : '';

    const btnVer = dlg.querySelector('#prazoVerLista');
    const btnSinalizar = dlg.querySelector('#prazoSinalizar');
    const btnFechar = dlg.querySelector('#prazoFechar');

    btnVer.onclick = () => {
      try { sessionStorage.setItem('procPreSelect', nup); } catch (_) {}
      window.location.href = 'processos.html';
    };

    btnSinalizar.onclick = () => {
      const origin = dlg.dataset.originId || '';
      if (origin === 'prazoMonit') {
        openPrazoSignalPopup({
          nup,
          number,
          type,
          originId: origin,
          rowKey
        });
      } else {
        console.info('[Prazo] Sinalizar clicado para', nup, 'em', origin);
      }
    };

    btnFechar.onclick = () => {
      if (typeof dlg.close === 'function') dlg.close();
    };

    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', 'open');
  }

  // ---------- Colunas dos cards ----------
  const PARECERES_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'type', label: 'Tipo' },
    {
      key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date),
      render: r => {
        const prazo = Utils.fmtDate(r.due_date);
        if (!r.em_atraso) return `<div>${prazo}</div>`;
        return `<div>${prazo}</div><div class="text-danger">ADICIONAL</div>`;
      }
    },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const REMOCAO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    {
      key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date),
      render: r => {
        const prazo = Utils.fmtDate(r.due_date);
        if (!r.em_atraso) return `<div>${prazo}</div>`;
        return `<div>${prazo}</div><div class="text-danger">ADICIONAL</div>`;
      }
    },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const OBRA_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
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

  const SOBRESTAMENTO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  // ---------- Render helpers ----------
  function bindRowLinks(tbody) {
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach(tr => {
      if (!tr.dataset.row) return;
      try {
        const data = JSON.parse(tr.dataset.row);
        if (!data?.nup) return;

        // Atribui uma rowKey estável para reaplicar destaque após re-render
        const rowKey = makeRowKey(data);
        tr.dataset.rowkey = rowKey;

        // Clique da linha abre o popup com contexto completo
        tr.addEventListener('click', () => {
          const container = tbody.closest('div[id]');
          const originId = container ? container.id : '';
          openPrazoClickPopup({
            nup: String(data.nup),
            number: data?.number ?? '',
            type: data?.type ?? '',
            originId,
            rowKey
          });
        });
      } catch {}
    });
  }

  function renderInto(containerId, columns, rows) {
    const { tbody } = Utils.renderTable(containerId, columns, rows);
    bindRowLinks(tbody);
    applySavedHighlights(containerId); // reaplica destaque salvo após cada render
  }

  // ---------- Estado e carregamento ----------
  let pareceres = [];
  let remocao = [];
  let obra = [];
  let monitor = [];
  let doaga = [];
  let adhel = [];
  let sobrestamento = [];

  async function loadPareceres() {
    const { data } = await sb.from('v_prazo_parecer')
      .select('nup,type,due_date,em_atraso,days_remaining');
    pareceres = data || [];
    renderInto('prazoParec', PARECERES_COLUMNS, pareceres);
  }

  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('nup,due_date,days_remaining');
    remocao = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderInto('prazoRemocao', REMOCAO_COLUMNS, remocao);
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,due_date,days_remaining');
    obra = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderInto('prazoObra', OBRA_COLUMNS, obra);
  }

  async function loadSobrestamento() {
    const { data } = await sb.from('v_prazo_sobrestamento')
      .select('nup,due_date,days_remaining');
    sobrestamento = data || [];
    renderInto('prazoSobrestamento', SOBRESTAMENTO_COLUMNS, sobrestamento);
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup,type,number');
    monitor = data || [];
    renderInto('prazoMonit', MONITOR_COLUMNS, monitor);
  }

  async function loadDOAGA() {
    const { data } = await sb.from('v_prazo_revogar_validade')
      .select('nup,due_date,days_remaining');
    doaga = data || [];
    renderInto('prazoDOAGA', DOAGA_COLUMNS, doaga);
  }

  async function loadADHEL() {
    const { data } = await sb.from('v_prazo_revogar_plano')
      .select('nup,due_date,days_remaining');
    adhel = data || [];
    renderInto('prazoADHEL', ADHEL_COLUMNS, adhel);
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
  }

  async function init() {
    await load();
  }

  return { init, load };
})();
