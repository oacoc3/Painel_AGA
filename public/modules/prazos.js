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
      </form>
    `;
    document.body.appendChild(dlg);
    prazoClickDialog = dlg;
    return dlg;
  }

  async function resolveProcIdByNup(nup) {
    const sb = window.supabaseClient;
    // Consulta direta por NUP já formatado (a tabela 'processes' tem constraint de formato)
    const { data, error } = await sb
      .from('processes')
      .select('id')
      .eq('nup', String(nup))
      .maybeSingle();
    if (error) throw error;
    return data?.id || null;
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
    btnSinalizar.onclick = async () => {
      try {
        const procId = await resolveProcIdByNup(nup);
        if (!procId) {
          console.warn('Processo não encontrado para NUP', nup);
          if (typeof dlg.close === 'function') dlg.close();
          return;
        }
        const sb = window.supabaseClient;
        const { error } = await sb.from('le_signals').insert({
          process_id: procId,
          signal_type: 'SINALIZAR',
          reason: null,
          extra: { origem: 'Prazos/LeituraExpedicao' }
        });
        if (error) throw error;
      } catch (e) {
        console.error('Falha ao sinalizar LE:', e);
      } finally {
        if (typeof dlg.close === 'function') dlg.close();
      }
    };
    btnFechar.onclick = () => {
      if (typeof dlg.close === 'function') dlg.close();
    };
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }

  // === Dados dos cards ===
  const sb = window.supabaseClient;

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
      value: r => r.type_label || r.type || ''
    },
    { key: 'days', label: 'Dias', value: r => r.days ?? '' },
    { key: 'days_deadline', label: 'Prazo', value: r => r.days_deadline ?? '' },
    { key: 'em_atraso', label: 'Em atraso', value: r => r.em_atraso ? 'Sim' : 'Não' },
  ];

  const REMOCAO_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'days', label: 'Dias', value: r => r.days ?? '' },
    { key: 'days_deadline', label: 'Prazo', value: r => r.days_deadline ?? '' },
    { key: 'em_atraso', label: 'Em atraso', value: r => r.em_atraso ? 'Sim' : 'Não' },
  ];

  const OBRA_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'status_label', label: 'Status', value: r => r.status_label || r.status || '' },
    { key: 'days', label: 'Dias', value: r => r.days ?? '' },
    { key: 'days_deadline', label: 'Prazo', value: r => r.days_deadline ?? '' },
    { key: 'em_atraso', label: 'Em atraso', value: r => r.em_atraso ? 'Sim' : 'Não' },
  ];

  const SOBREST_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'days', label: 'Dias', value: r => r.days ?? '' },
    { key: 'days_deadline', label: 'Prazo', value: r => r.days_deadline ?? '' },
    { key: 'em_atraso', label: 'Em atraso', value: r => r.em_atraso ? 'Sim' : 'Não' },
  ];

  const MONITOR_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'days', label: 'Dias', value: r => r.days ?? '' },
    { key: 'days_deadline', label: 'Prazo', value: r => r.days_deadline ?? '' },
    { key: 'em_atraso', label: 'Em atraso', value: r => r.em_atraso ? 'Sim' : 'Não' },
  ];

  const DOAGA_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'type_label', label: 'Tipo', value: r => r.type_label || r.type || '' },
    { key: 'days', label: 'Dias', value: r => r.days ?? '' },
    { key: 'days_deadline', label: 'Prazo', value: r => r.days_deadline ?? '' },
    { key: 'em_atraso', label: 'Em atraso', value: r => r.em_atraso ? 'Sim' : 'Não' },
  ];

  const ADHEL_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'days', label: 'Dias', value: r => r.days ?? '' },
    { key: 'days_deadline', label: 'Prazo', value: r => r.days_deadline ?? '' },
    { key: 'em_atraso', label: 'Em atraso', value: r => r.em_atraso ? 'Sim' : 'Não' },
  ];

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
    const { tbody } = Utils.renderTable('prazoRemoc', REMOCAO_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  function getObraRows() {
    return obras;
  }

  function renderObra() {
    const rows = getObraRows();
    const { tbody } = Utils.renderTable('prazoObra', OBRA_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  function getSobrestRows() {
    return sobrestamento;
  }

  function renderSobrest() {
    const rows = getSobrestRows();
    const { tbody } = Utils.renderTable('prazoSobrest', SOBREST_COLUMNS, rows);
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

  async function loadDOAGA() {
    const { data } = await sb.from('v_prazo_doaga').select('*').order('em_atraso', { ascending: false }).order('days', { ascending: false });
    doaga = Array.isArray(data) ? data.map(row => ({
      ...row,
      type_label: row?.type_label || row?.type || ''
    })) : [];
    renderDOAGA();
  }

  function getAdhelRows() {
    return adhel;
  }

  function renderADHEL() {
    const rows = getAdhelRows();
    const { tbody } = Utils.renderTable('prazoADHEL', ADHEL_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadADHEL() {
    const { data } = await sb.from('v_prazo_adhel').select('*').order('em_atraso', { ascending: false }).order('days', { ascending: false });
    adhel = Array.isArray(data) ? data.map(row => ({
      ...row,
      type_label: row?.type_label || row?.type || ''
    })) : [];
    renderADHEL();
  }

  async function loadPareceres() {
    const { data: parecerRows } = await sb.from('v_prazo_pareceres').select('*').order('em_atraso', { ascending: false }).order('days', { ascending: false });
    const { data: sigadaerRows } = await sb.from('v_prazo_sigadaer').select('*').order('em_atraso', { ascending: false }).order('days', { ascending: false });
    pareceres = [...parecerRows, ...sigadaerRows]
      .map(row => ({
        ...row,
        type_label: row?.type_label || row?.type || ''
      }));
    renderPareceres();
  }

  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao').select('*').order('em_atraso', { ascending: false }).order('days', { ascending: false });
    remocao = Array.isArray(data) ? data : [];
    renderRemocao();
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_obra').select('*').order('em_atraso', { ascending: false }).order('days', { ascending: false });
    obras = Array.isArray(data) ? data : [];
    renderObra();
  }

  async function loadSobrestamento() {
    const { data } = await sb.from('v_prazo_sobrestamento').select('*').order('em_atraso', { ascending: false }).order('days', { ascending: false });
    sobrestamento = Array.isArray(data) ? data : [];
    renderSobrest();
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_prazo_monitor').select('*').order('em_atraso', { ascending: false }).order('days', { ascending: false });
    monitor = Array.isArray(data) ? data : [];
    renderMonitor();
  }

  async function init() {
    // Bind inicial das tabelas quando a página carregar
    await load();
    // Rebind nos tbodys para novos dados
    ['prazoParec','prazoRemoc','prazoObra','prazoSobrest','prazoMonit','prazoDOAGA','prazoADHEL']
      .forEach(id => {
        const { tbody } = Utils.renderTable(id, [], []);
        bindRowLinks(tbody);
      });
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
