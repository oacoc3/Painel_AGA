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
          <button id="prazoFechar" value="close" type="button">Fechar</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    prazoClickDialog = dlg;
    return dlg;
  }

  // --- Registro no histórico (Sinalização / Validação / Rejeição) ---
  function normalizeNupToBankFormat(input) {
    const digits = String(input || '').replace(/\D/g, '');
    if (!digits) return '';
    let d = digits;
    if (d.length > 5) d = d.slice(5);
    if (d.length >= 12) {
      const p1 = d.slice(0, 6);
      const p2 = d.slice(6, 10);
      const p3 = d.slice(10, 12);
      return `${p1}/${p2}-${p3}`;
    }
    return input || '';
  }

  async function recordHistoryByNup(nup, action, extraDetails = {}) {
    try {
      const norm = normalizeNupToBankFormat(nup);
      if (!norm) throw new Error('NUP inválido.');
      const { data: procs, error: e1 } = await sb.from('processes').select('id').eq('nup', norm).limit(1);
      if (e1) throw e1;
      const proc = Array.isArray(procs) && procs[0];
      if (!proc?.id) throw new Error('Processo não encontrado para o NUP informado.');

      const u = await getUser();
      const name = (window.APP_PROFILE && window.APP_PROFILE.name)
        || (u && u.user_metadata && u.user_metadata.name)
        || (u && u.email) || 'Usuário';

      const payload = {
        process_id: proc.id,
        action: action,
        user_name: name,
        details: { nup: norm, modulo: 'Prazos', ...extraDetails }
      };
      const { error: e2 } = await sb.from('history').insert(payload);
      if (e2) throw e2;
      return true;
    } catch (err) {
      console.error('[Prazos] Falha ao registrar histórico:', err);
      Utils.setMsg && Utils.setMsg('prazoMsg', String(err.message || err), true);
      return false;
    }
  }

  async function registrarSinalizacao(nup) {
    return recordHistoryByNup(nup, 'SINALIZAÇÃO', { origem: 'Prazos' });
  }
  async function registrarValidacao(nup) {
    return recordHistoryByNup(nup, 'VALIDAÇÃO', { origem: 'Prazos' });
  }
  async function registrarRejeicao(nup) {
    return recordHistoryByNup(nup, 'REJEIÇÃO', { origem: 'Prazos' });
  }

  function openPrazoClickPopup(nup) {
    const dlg = ensurePrazoClickDialog();
    const nupEl = dlg.querySelector('#prazoClickNup');
    if (nupEl) nupEl.textContent = `NUP: ${nup}`;
    // Limpa handlers anteriores para evitar múltiplos binds
    const btnVer = dlg.querySelector('#prazoVerLista');
    const btnSinalizar = dlg.querySelector('#prazoSinalizar');
    const btnFechar = dlg.querySelector('#prazoFechar');

    btnVer.onclick = () => {
      try { sessionStorage.setItem('procPreSelect', nup); } catch (_) {}
      window.location.href = 'processos.html';
    };
    btnSinalizar.onclick = () => {
      registrarSinalizacao(nup);
    };
    btnFechar.onclick = () => dlg.close();

    dlg.showModal();
  }

  function bindRowLinks(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      try {
        const data = JSON.parse(tr.dataset.row);
        if (!data?.nup) return;
        tr.addEventListener('click', () => {
          openPrazoClickPopup(String(data.nup));
        });
      } catch {}
    });
  }

  let pareceres = [];
  let remocao = [];
  let obras = [];
  let sobrestamento = [];
  let monitor = [];
  let doaga = [];
  let adhel = [];

  const PARECERES_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    {
      key: 'type_label',
      label: 'Tipo',
      value: r => {
        if (!r.type) return '';
        if (r.type === 'PDIR') return 'Parecer PDIR';
        if (r.type === 'EXPL') return 'Parecer Exploração';
        if (r.type === 'INSC') return 'Parecer Inscrição';
        if (r.type === 'ALTR') return 'Parecer Alteração';
        return r.type;
      }
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
      value: r => Utils.fmtDate(r.due_date)
    },
    {
      key: 'days_remaining',
      label: '',
      value: r => Utils.daysBetween(new Date(), r.due_date)
    }
  ];

  const SOBRESTAMENTO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const MONITOR_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const DOAGA_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  const ADHEL_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date) },
    { key: 'days_remaining', label: '', value: r => Utils.daysBetween(new Date(), r.due_date) }
  ];

  function getParecerRows() {
    return pareceres;
  }
  function renderPareceres() {
    const rows = getParecerRows();
    const { tbody } = Utils.renderTable('prazoParec', PARECERES_COLUMNS, rows);
    bindRowLinks(tbody);
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

    const intRows = (intRes.data || []).map(r => ({
      ...r,
      type_label: r.type
    }));
    const extRows = (extRes.data || []).map(r => ({
      ...r,
      type_label: r.type
    }));

    pareceres = [...intRows, ...extRows].sort(
      (a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderPareceres();
  }

  function getRemocaoRows() { return remocao; }
  function renderRemocao() {
    const rows = getRemocaoRows();
    const { tbody } = Utils.renderTable('prazoRemocao', REMOCAO_COLUMNS, rows);
    bindRowLinks(tbody);
  }
  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao_rebaixamento')
      .select('nup,due_date,days_remaining');
    remocao = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    renderRemocao();
  }

  function getObraRows() { return obras; }
  function renderObra() {
    const rows = getObraRows();
    const { tbody } = Utils.renderTable('prazoObra', OBRAS_COLUMNS, rows);
    bindRowLinks(tbody);
  }
  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,due_date,days_remaining');
    obras = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderObra();
  }

  function getSobrestamentoRows() { return sobrestamento; }
  function renderSobrestamento() {
    const rows = getSobrestamentoRows();
    const { tbody } = Utils.renderTable('prazoSobrest', SOBRESTAMENTO_COLUMNS, rows);
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

  function getMonitorRows() { return monitor; }
  function renderMonitor() {
    const rows = getMonitorRows();
    const { tbody } = Utils.renderTable('prazoMonitor', MONITOR_COLUMNS, rows);
    bindRowLinks(tbody);
  }
  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup,due_date,days_remaining');
    monitor = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderMonitor();
  }

  function getDoagaRows() { return doaga; }
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

  function getADHELRows() { return adhel; }
  function renderADHEL() {
    const rows = getADHELRows();
    const { tbody } = Utils.renderTable('prazoADHEL', ADHEL_COLUMNS, rows);
    bindRowLinks(tbody);
  }
  async function loadADHEL() {
    const { data } = await sb.from('v_prazo_ad_hel')
      .select('nup,due_date,days_remaining');
    adhel = (data || []).sort(
      (a, b) =>
        new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31')
    );
    renderADHEL();
  }

  function init() {}

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

  return { init, load, registrarSinalizacao, registrarValidacao, registrarRejeicao };
})();
