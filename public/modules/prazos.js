// public/modules/prazos.js
window.Modules = window.Modules || {};
window.Modules.prazos = (() => {
  // ==================================================
  // Persistência local da sinalização (até validação)
  // ==================================================
  const SIGNAL_STORAGE_KEY = 'monitSignals'; // [{ nup, number, type, key }]
  const HIGHLIGHT_COLOR = '#fff3b0';

  function makeRowKey(row) {
    const nup = row?.nup ?? '';
    const number = row?.number ?? '';
    const type = row?.type ?? '';
    return `${nup}|${number}|${type}`;
  }
  function loadSignals() {
    try {
      const raw = localStorage.getItem(SIGNAL_STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function saveSignals(list) {
    try { localStorage.setItem(SIGNAL_STORAGE_KEY, JSON.stringify(list)); } catch {}
  }
  function addSignal({ nup, number, type }) {
    const key = makeRowKey({ nup, number, type });
    const all = loadSignals();
    if (!all.find(k => k.key === key)) {
      all.push({ nup: String(nup), number: number ?? '', type: type ?? '', key });
      saveSignals(all);
    }
  }
  function hasSignalKey(key) {
    return !!loadSignals().find(k => k.key === key);
  }

  // ==============
  // Popups
  // ==============
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
          <button id="prazoVerLista" type="button">Ver na lista de processos</button>
          <button id="prazoSinalizar" type="button">Sinalizar</button>
          <button id="prazoFechar" type="button">Fechar</button>
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
        <input id="prazoSignalDateTime" type="datetime-local" required style="width:100%;" />
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

  function highlightCardTitle(containerEl) {
    const h2 = containerEl.closest('.card')?.querySelector('.card-title h2');
    if (h2) {
      h2.style.backgroundColor = HIGHLIGHT_COLOR;
      h2.style.padding = '2px 4px';
      h2.style.borderRadius = '4px';
    }
  }

  function applySavedHighlightsToMonitor() {
    const box = document.getElementById('prazoMonit');
    if (!box) return;
    let any = false;
    box.querySelectorAll('tbody tr').forEach(tr => {
      try {
        const data = JSON.parse(tr.dataset.row || '{}');
        const key = makeRowKey(data);
        if (hasSignalKey(key)) {
          tr.style.backgroundColor = HIGHLIGHT_COLOR;
          any = true;
        }
      } catch {}
    });
    if (any) highlightCardTitle(box);
  }

  function openPrazoSignalPopup({ nup, number, type }) {
    const dlg = ensurePrazoSignalDialog();
    const nupEl = dlg.querySelector('#prazoSignalNup');
    const dt = dlg.querySelector('#prazoSignalDateTime');
    const obs = dlg.querySelector('#prazoSignalObs');
    const btnSend = dlg.querySelector('#prazoSignalSend');
    const btnClose = dlg.querySelector('#prazoSignalClose');

    if (nupEl) {
      const parts = [`NUP: ${nup}`];
      if (type) parts.push(`Tipo: ${type}`);
      if (number != null && number !== '') parts.push(`Nº: ${String(number).padStart(6, '0')}`);
      nupEl.textContent = parts.join(' • ');
    }
    if (dt) dt.value = '';
    if (obs) obs.value = '';
    if (btnSend) btnSend.disabled = true;

    const validate = () => { btnSend.disabled = !dt?.value; };
    dt?.addEventListener('input', validate);

    btnClose.onclick = () => { if (typeof dlg.close === 'function') dlg.close(); };

    btnSend.onclick = () => {
      if (!dt?.value) return; // obrigatório
      // (futuro) persistir em banco; por ora, localStorage
      addSignal({ nup, number, type });

      // Fecha popups e aplica realce no card Leitura/Expedição
      if (typeof dlg.close === 'function') dlg.close();
      if (prazoClickDialog && typeof prazoClickDialog.close === 'function') prazoClickDialog.close();
      applySavedHighlightsToMonitor();
    };

    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', 'open');
  }

  function openPrazoClickPopup(row) {
    const { nup, number, type } = row || {};
    const dlg = ensurePrazoClickDialog();
    const nupEl = dlg.querySelector('#prazoClickNup');
    if (nupEl) {
      const parts = [`NUP: ${nup}`];
      if (type) parts.push(`Tipo: ${type}`);
      if (number != null && number !== '') parts.push(`Nº: ${String(number).padStart(6, '0')}`);
      nupEl.textContent = parts.join(' • ');
    }

    const btnVer = dlg.querySelector('#prazoVerLista');
    const btnSinalizar = dlg.querySelector('#prazoSinalizar');
    const btnFechar = dlg.querySelector('#prazoFechar');

    btnVer.onclick = () => {
      try { sessionStorage.setItem('procPreSelect', nup); } catch {}
      window.location.href = 'processos.html';
    };
    btnSinalizar.onclick = () => openPrazoSignalPopup({ nup, number, type });
    btnFechar.onclick = () => { if (typeof dlg.close === 'function') dlg.close(); };

    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', 'open');
  }

  // =========================
  // Colunas por card
  // =========================
  const PARECERES_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'type', label: 'Tipo' },
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

  // =========================
  // Render helpers
  // =========================
  function bindRowLinks(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      try {
        const data = JSON.parse(tr.dataset.row);
        if (!data?.nup) return;
        tr.addEventListener('click', () => openPrazoClickPopup({
          nup: String(data.nup),
          number: data?.number ?? '',
          type: data?.type ?? ''
        }));
      } catch {}
    });
  }

  function renderInto(containerId, columns, rows) {
    const { tbody } = Utils.renderTable(containerId, columns, rows);
    bindRowLinks(tbody);
    if (containerId === 'prazoMonit') applySavedHighlightsToMonitor();
  }

  // =========================
  // Estado (datasets)
  // =========================
  let pareceres = [];
  let remocao = [];
  let obra = [];
  let sobrestamento = [];
  let monitor = [];
  let doaga = [];
  let adhel = [];

  // =========================
  // Carregamento (views do HOMOLOG10)
  // =========================
  async function loadPareceres() {
    // v_prazo_parecer: nup, type, due_date, em_atraso, days_remaining
    const { data } = await sb.from('v_prazo_parecer')
      .select('nup,type,due_date,em_atraso,days_remaining');
    pareceres = data || [];
    renderInto('prazoParec', PARECERES_COLUMNS, pareceres);
  }

  async function loadRemocao() {
    // v_prazo_remocao_rebaixamento: nup, due_date, days_remaining, em_atraso?
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('nup,due_date,days_remaining,em_atraso');
    remocao = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderInto('prazoRemocao', REMOCAO_COLUMNS, remocao);
  }

  async function loadObra() {
    // v_prazo_termino_obra: nup, due_date, days_remaining
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,due_date,days_remaining,em_atraso');
    obra = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderInto('prazoObra', OBRA_COLUMNS, obra);
  }

  async function loadSobrestamento() {
    // v_prazo_sobrestamento: nup, due_date, days_remaining
    const { data } = await sb.from('v_prazo_sobrestamento')
      .select('nup,due_date,days_remaining');
    sobrestamento = data || [];
    renderInto('prazoSobrestamento', SOBRESTAMENTO_COLUMNS, sobrestamento);
  }

  async function loadMonitor() {
    // v_monitorar_tramitacao: nup, type, number
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup,type,number');
    monitor = data || [];
    renderInto('prazoMonit', MONITOR_COLUMNS, monitor);
  }

  async function loadDOAGA() {
    // v_prazo_revogar_validade: nup, due_date, days_remaining
    const { data } = await sb.from('v_prazo_revogar_validade')
      .select('nup,due_date,days_remaining');
    doaga = data || [];
    renderInto('prazoDOAGA', DOAGA_COLUMNS, doaga);
  }

  async function loadADHEL() {
    // v_prazo_revogar_plano: nup, due_date, days_remaining
    const { data } = await sb.from('v_prazo_revogar_plano')
      .select('nup,due_date,days_remaining');
    adhel = data || [];
    renderInto('prazoADHEL', ADHEL_COLUMNS, adhel);
  }

  // =========================
  // API pública
  // =========================
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
