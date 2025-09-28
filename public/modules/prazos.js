// public/modules/prazos.js
window.Modules = window.Modules || {};
window.Modules.prazos = (() => {
  // Popup ao clicar em um processo nos cards de Prazos
  let prazoClickDialog = null;
  function ensurePrazoClickDialog() {
    if (prazoClickDialog) return prazoClickDialog;
    // Usa <dialog> nativo para não alterar CSS do projeto
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

  // Popup específico para Sinalizar (Leitura/Expedição)
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

  // Destaque apenas da linha (nup, number) no card Leitura/Expedição
  function highlightMonitorRow(nup, number) {
    const box = document.getElementById('prazoMonit');
    if (!box) return;

    // Destaca apenas a linha que casa (nup, number)
    const trList = box.querySelectorAll('tbody tr');
    trList.forEach(tr => {
      try {
        const data = JSON.parse(tr.dataset.row || '{}');
        const sameNup = String(data?.nup) === String(nup);
        const sameNumber = (data?.number == null && number == null)
          || String(data?.number) === String(number);
        if (sameNup && sameNumber) {
          tr.style.backgroundColor = '#fff3b0'; // amarelo claro
        }
      } catch {}
    });

    // Título do card em amarelo (único por card)
    const cardTitle = box.closest('.card')?.querySelector('.card-title h2');
    if (cardTitle) {
      cardTitle.style.backgroundColor = '#fff3b0';
      cardTitle.style.padding = '2px 4px';
      cardTitle.style.borderRadius = '4px';
    }
  }

  function openPrazoSignalPopup(nup, number) {
    const dlg = ensurePrazoSignalDialog();

    // Guarda identificadores no próprio dialog
    dlg.dataset.nup = String(nup);
    dlg.dataset.number = number != null ? String(number) : '';

    // Preenche NUP e limpa campos
    const nupEl = dlg.querySelector('#prazoSignalNup');
    if (nupEl) nupEl.textContent = `NUP: ${nup}${number != null ? ` • Nº: ${String(number).padStart(6, '0')}` : ''}`;

    const dt = dlg.querySelector('#prazoSignalDateTime');
    const obs = dlg.querySelector('#prazoSignalObs');
    const btnSend = dlg.querySelector('#prazoSignalSend');
    const btnClose = dlg.querySelector('#prazoSignalClose');

    if (dt) dt.value = '';
    if (obs) obs.value = '';
    if (btnSend) btnSend.disabled = true;

    function validate() {
      btnSend.disabled = !dt?.value;
    }

    dt?.addEventListener('input', validate, { once: false });

    btnClose.onclick = () => {
      if (typeof dlg.close === 'function') dlg.close();
    };

    btnSend.onclick = () => {
      if (!dt?.value) return; // guarda de segurança
      // Futuro: poderá chamar RPC para persistência; por ora apenas UI
      if (typeof dlg.close === 'function') dlg.close();
      if (prazoClickDialog && typeof prazoClickDialog.close === 'function') prazoClickDialog.close();

      // Usa os identificadores que salvamos no dialog
      const selNup = dlg.dataset.nup;
      const selNumber = dlg.dataset.number || null;
      highlightMonitorRow(selNup, selNumber);
    };

    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', 'open');
  }

  function openPrazoClickPopup(nup, number, originId) {
    const dlg = ensurePrazoClickDialog();
    const nupEl = dlg.querySelector('#prazoClickNup');
    if (nupEl) {
      const numStr = number != null ? ` • Nº: ${String(number).padStart(6, '0')}` : '';
      nupEl.textContent = `NUP: ${nup}${numStr}`;
    }
    dlg.dataset.origin = originId || '';
    dlg.dataset.nup = String(nup);
    dlg.dataset.number = number != null ? String(number) : '';

    // Limpa handlers anteriores para evitar múltiplos binds
    const btnVer = dlg.querySelector('#prazoVerLista');
    const btnSinalizar = dlg.querySelector('#prazoSinalizar');
    const btnFechar = dlg.querySelector('#prazoFechar');

    btnVer.onclick = () => {
      try { sessionStorage.setItem('procPreSelect', nup); } catch (_) {}
      window.location.href = 'processos.html';
    };
    btnSinalizar.onclick = () => {
      const origin = dlg.dataset.origin || '';
      if (origin === 'prazoMonit') {
        openPrazoSignalPopup(nup, number);
      } else {
        console.info('[Prazo] Sinalizar clicado (sem ação específica) para', nup, 'em', origin);
      }
    };
    btnFechar.onclick = () => {
      if (typeof dlg.close === 'function') dlg.close();
    };

    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', 'open');
  }

  // --- Abaixo: lógica de carregamento/renders já existentes dos cards ---

  const PARECERES_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'type', label: 'Tipo' },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date),
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
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date),
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

  // Importante: passamos também o "number" ao abrir o popup
  function bindRowLinks(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      try {
        const data = JSON.parse(tr.dataset.row);
        if (!data?.nup) return;
        tr.addEventListener('click', () => {
          const container = tbody.closest('div[id]');
          const originId = container ? container.id : '';
          openPrazoClickPopup(String(data.nup), data?.number ?? null, originId);
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
  }

  function getRemocaoRows() {
    return remocao;
  }

  function renderRemocao() {
    const rows = getRemocaoRows();
    const { tbody } = Utils.renderTable('prazoRemocao', REMOCAO_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  function getObraRows() {
    return obra;
  }

  function renderObra() {
    const rows = getObraRows();
    const { tbody } = Utils.renderTable('prazoObra', OBRA_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  function getMonitorRows() {
    return monitor;
  }

  function renderMonitor() {
    const rows = getMonitorRows();
    const { tbody } = Utils.renderTable('prazoMonit', MONITOR_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  function getDoagaRows() {
    return doaga;
  }

  function renderDOAGA() {
    const rows = getDoagaRows();
    const { tbody } = Utils.renderTable('prazoDOAGA', DOAGA_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  function getADHELRows() {
    return adhel;
  }

  function renderADHEL() {
    const rows = getADHELRows();
    const { tbody } = Utils.renderTable('prazoADHEL', ADHEL_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  // ---------- Estado e carregamento dos datasets ----------
  let pareceres = [];
  let remocao = [];
  let obra = [];
  let monitor = [];
  let doaga = [];
  let adhel = [];
  let sobrestamento = [];

  async function loadPareceres() {
    // v_prazo_parecer: NUP, tipo, prazo, em_atraso, etc.
    const { data } = await sb.from('v_prazo_parecer')
      .select('nup,type,due_date,em_atraso,days_remaining');
    const rows = (data || []);
    pareceres = rows;
    renderPareceres();
  }

  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('nup,due_date,days_remaining');
    remocao = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderRemocao();
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,due_date,days_remaining');
    obra = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderObra();
  }

  async function loadSobrestamento() {
    const { data } = await sb.from('v_prazo_sobrestamento')
      .select('nup,due_date,days_remaining');
    sobrestamento = (data || []);
    renderSobrestamento();
  }

  function getSobrestamentoRows() {
    return sobrestamento;
  }

  function renderSobrestamento() {
    const rows = getSobrestamentoRows();
    const { tbody } = Utils.renderTable('prazoSobrestamento', SOBRESTAMENTO_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  const SOBRESTAMENTO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => (r.due_date ? Utils.fmtDate(r.due_date) : 'Sobrestado') },
    { key: 'days_remaining', label: '', value: r => (r.due_date ? Utils.daysBetween(new Date(), r.due_date) : '') }
  ];

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup,type,number');
    monitor = data || [];
    renderMonitor();
  }

  async function loadDOAGA() {
    const { data } = await sb.from('v_prazo_revogar_validade')
      .select('nup,due_date,days_remaining');
    doaga = data || [];
    renderDOAGA();
  }

  async function loadADHEL() {
    const { data } = await sb.from('v_prazo_revogar_plano')
      .select('nup,due_date,days_remaining');
    adhel = data || [];
    renderADHEL();
  }

  // API pública
  async function init() {
    // Carrega ao abrir a página
    await load();
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

  return { init, load };
})();
