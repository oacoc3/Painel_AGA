// public/modules/prazos.js — homolog10 + ajustes de Sinalizar/Validação e histórico
window.Modules = window.Modules || {};
window.Modules.prazos = (() => {
  const HIGHLIGHT_COLOR = '#fff3b0';
  const CARD_MONITOR_ID = 'prazoMonit'; // Leitura/Expedição

  // ================= Popups =================
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
          <button id="prazoValidacao" type="button">Validação</button>
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
        <div id="prazoSignalInfo" style="margin:0 0 8px; font-size:.95em; opacity:.9;"></div>
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

  let prazoValidationDialog = null;
  function ensurePrazoValidationDialog() {
    if (prazoValidationDialog) return prazoValidationDialog;
    const dlg = document.createElement('dialog');
    dlg.id = 'prazoValidationDlg';
    dlg.innerHTML = `
      <form method="dialog" style="min-width:320px; max-width:90vw;">
        <h3 style="margin:0 0 12px 0;">Validação da Sinalização</h3>
        <div id="prazoValNup" style="margin:0 0 8px; font-weight:600;"></div>
        <div id="prazoValInfo" style="margin:0 0 12px; font-size:0.95em; opacity:.9;"></div>
        <label style="display:block; margin:8px 0 4px;">Observações (opcional)</label>
        <textarea id="prazoValObs" rows="3" style="width:100%; resize:vertical;"></textarea>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; margin-top:12px;">
          <button id="prazoValApprove" type="button">Validar</button>
          <button id="prazoValReject" type="button">Rejeitar</button>
          <button id="prazoValClose" type="button">Fechar</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    prazoValidationDialog = dlg;
    return dlg;
  }

  // ================= Utilitários =================
  function highlightCardTitle(containerEl) {
    const h2 = containerEl.closest('.card')?.querySelector('.card-title h2');
    if (h2) {
      h2.style.backgroundColor = HIGHLIGHT_COLOR;
      h2.style.padding = '2px 4px';
      h2.style.borderRadius = '4px';
    }
  }
  function highlightRowByKey(containerId, rowKey) {
    const box = document.getElementById(containerId);
    if (!box) return;
    const tr = Array.from(box.querySelectorAll('tbody tr')).find(tr => tr.dataset.rowkey === rowKey);
    if (tr) tr.style.backgroundColor = HIGHLIGHT_COLOR;
    highlightCardTitle(box);
  }

  async function resolveProcessIdByNup(nup) {
    if (!nup) return null;
    const { data, error } = await sb.from('processes').select('id').eq('nup', nup).limit(1);
    if (!error && Array.isArray(data) && data[0]?.id) return data[0].id;
    return null;
  }

  // ================= Popup principal =================
  function openPrazoClickPopup(ctx) {
    const dlg = ensurePrazoClickDialog();

    let nup = '', originId = '', rowKey = '', typeKey = '', numberKey = '';
    if (typeof ctx === 'string') {
      nup = ctx;
    } else if (ctx && typeof ctx === 'object') {
      nup = ctx.nup || '';
      originId = ctx.originId || '';
      rowKey = ctx.rowKey || '';
      typeKey = ctx.type || '';
      numberKey = ctx.number || '';
    }

    dlg.dataset.nup = nup;
    dlg.dataset.rowKey = rowKey;
    dlg.dataset.originId = originId;

    const nupEl = dlg.querySelector('#prazoClickNup');
    if (nupEl) nupEl.textContent = `NUP: ${nup}`;

    const btnVer = dlg.querySelector('#prazoVerLista');
    const btnSinalizar = dlg.querySelector('#prazoSinalizar');
    const btnValidacao = dlg.querySelector('#prazoValidacao');
    const btnFechar = dlg.querySelector('#prazoFechar');

    // Exibir Sinalizar/Validação SOMENTE no card Leitura/Expedição
    const enableActions = originId === 'prazoMonit';
    btnSinalizar.style.display = enableActions ? '' : 'none';
    btnValidacao.style.display = enableActions ? '' : 'none';

    // Ver na lista
    btnVer.onclick = () => {
      try { sessionStorage.setItem('procPreSelect', nup); } catch {}
      window.location.href = 'processos.html';
    };

    // Sinalizar (apenas quando permitido)
    btnSinalizar.onclick = enableActions ? () => {
      const sdlg = ensurePrazoSignalDialog();
      sdlg.dataset.originId = originId || 'prazoMonit';
      sdlg.dataset.rowKey = rowKey || '';
      sdlg.dataset.nup = nup || '';

      const nEl = sdlg.querySelector('#prazoSignalNup');
      if (nEl) nEl.textContent = `NUP: ${nup}`;
      const infoEl = sdlg.querySelector('#prazoSignalInfo');
      if (infoEl) {
        const parts = [];
        if (typeKey) parts.push(`Tipo: ${typeKey}`);
        if (numberKey) parts.push(`Nº: ${String(numberKey).padStart(6,'0')}`);
        infoEl.textContent = parts.join(' • ');
      }

      const dt = sdlg.querySelector('#prazoSignalDateTime');
      const obs = sdlg.querySelector('#prazoSignalObs');
      const send = sdlg.querySelector('#prazoSignalSend');
      const closeBtn = sdlg.querySelector('#prazoSignalClose');
      if (dt) dt.value = ''; if (obs) obs.value = ''; if (send) send.disabled = true;
      const validate = () => { send.disabled = !dt?.value; };
      dt?.addEventListener('input', validate);

      closeBtn.onclick = () => { if (typeof sdlg.close === 'function') sdlg.close(); };

      send.onclick = async () => {
        if (!dt?.value) return;
        try {
          const rk = sdlg.dataset.rowKey || '';
          const [nupKey, numberKey2, typeKey2] = rk.split('|');
          const nupToUse = nupKey || sdlg.dataset.nup || nup;
          const processId = await resolveProcessIdByNup(nupToUse);
          if (processId) {
            const details = {
              tipo: typeKey2 || typeKey || null,
              numero_sigadaer: numberKey2 || numberKey || null,
              observacoes: obs?.value || null
            };
            const u = await (window.getUser ? window.getUser() : null);
            const { error: hErr } = await sb.from('history').insert({
              process_id: processId,
              action: 'Sinalização Leitura/Expedição',
              details,
              created_by: u ? u.id : null
            });
            if (hErr) console.error('[Prazo] insert history (analista) erro:', hErr);
          } else {
            console.error('[Prazo] process_id não encontrado para NUP', nupToUse);
          }
        } catch (e) { console.error('[Prazo] Histórico (analista) exceção:', e); }

        if (typeof sdlg.close === 'function') sdlg.close();
        if (typeof prazoClickDialog?.close === 'function') prazoClickDialog.close();
        highlightRowByKey(sdlg.dataset.originId || 'prazoMonit', sdlg.dataset.rowKey || '');
      };

      if (typeof sdlg.showModal === 'function') sdlg.showModal();
      else sdlg.setAttribute('open','open');
    } : null;

    // Validação (apenas quando permitido)
    btnValidacao.onclick = enableActions ? async () => {
      const vdlg = ensurePrazoValidationDialog();
      const rk = dlg.dataset.rowKey || rowKey || '';
      const [nupKey, numberKey3, typeKey3] = rk.split('|');
      vdlg.dataset.nup = nup || nupKey || '';
      vdlg.dataset.type = typeKey3 || typeKey || '';
      vdlg.dataset.number = numberKey3 || numberKey || '';

      const nupEl2 = vdlg.querySelector('#prazoValNup');
      if (nupEl2) nupEl2.textContent = `NUP: ${vdlg.dataset.nup}`;
      const infoEl = vdlg.querySelector('#prazoValInfo');
      if (infoEl) {
        const parts = [];
        if (vdlg.dataset.type) parts.push(`Tipo: ${vdlg.dataset.type}`);
        if (vdlg.dataset.number) parts.push(`Nº: ${String(vdlg.dataset.number).padStart(6,'0')}`);
        infoEl.textContent = parts.join(' • ');
      }
      const obsEl = vdlg.querySelector('#prazoValObs'); if (obsEl) obsEl.value = '';

      const btnApprove = vdlg.querySelector('#prazoValApprove');
      const btnReject = vdlg.querySelector('#prazoValReject');
      const btnCloseV = vdlg.querySelector('#prazoValClose');
      const doClose = () => { if (typeof vdlg.close === 'function') vdlg.close(); };

      const processId = await resolveProcessIdByNup(vdlg.dataset.nup);

      if (btnApprove) btnApprove.onclick = async () => {
        try {
          const u = await (window.getUser ? window.getUser() : null);
          const details = { tipo: vdlg.dataset.type || null, numero_sigadaer: vdlg.dataset.number || null, observacoes: obsEl?.value || null };
          const { error: hErr } = await sb.from('history').insert({
            process_id: processId,
            action: 'Sinalização Leitura/Expedição validada',
            details,
            created_by: u ? u.id : null
          });
          if (hErr) console.error('[Prazo] insert history (validar) erro:', hErr);
        } catch (e) { console.error('[Prazo] Validação (Admin) exceção:', e); }
        doClose(); if (typeof prazoClickDialog?.close === 'function') prazoClickDialog.close();
      };

      if (btnReject) btnReject.onclick = async () => {
        try {
          const u = await (window.getUser ? window.getUser() : null);
          const details = { tipo: vdlg.dataset.type || null, numero_sigadaer: vdlg.dataset.number || null, observacoes: obsEl?.value || null };
          const { error: hErr } = await sb.from('history').insert({
            process_id: processId,
            action: 'Sinalização Leitura/Expedição rejeitada',
            details,
            created_by: u ? u.id : null
          });
          if (hErr) console.error('[Prazo] insert history (rejeitar) erro:', hErr);
        } catch (e) { console.error('[Prazo] Rejeição (Admin) exceção:', e); }
        doClose(); if (typeof prazoClickDialog?.close === 'function') prazoClickDialog.close();
      };

      if (btnCloseV) btnCloseV.onclick = () => doClose();

      if (typeof vdlg.showModal === 'function') vdlg.showModal();
      else vdlg.setAttribute('open','open');
    } : null;

    // Fechar
    btnFechar.onclick = () => { if (typeof dlg.close === 'function') dlg.close(); };

    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.style.display = 'block';
  }

  // ================= Colunas (homolog10) =================
  const PARECERES_COLUMNS = [
    { key: 'nup', label: 'NUP', value: r => r.nup },
    { key: 'type_label', label: 'Tipo', value: r => r.type_label || r.type || '' },
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
    { key: 'due_date', label: 'Prazo', value: r => Utils.fmtDate(r.due_date),
      render: r => { const prazo = Utils.fmtDate(r.due_date); return r.em_atraso ? `<div>${prazo}</div><div class="text-danger">ADICIONAL</div>` : `<div>${prazo}</div>`; } },
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

  // ================= Bind de linhas =================
  function bindRowLinks(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      try {
        const data = JSON.parse(tr.dataset.row);
        if (!data?.nup) return;
        const rowKey = [data.nup, data.number || '', data.type || ''].join('|');
        tr.dataset.rowkey = rowKey;
        tr.addEventListener('click', () => {
          const container = tbody.closest('div[id]');
          const originId = container ? container.id : '';
          openPrazoClickPopup({
            nup: String(data.nup),
            originId,
            rowKey,
            type: data?.type || '',
            number: data?.number || ''
          });
        });
      } catch {}
    });
  }

  // ================= Carregamento (homolog10) =================
  let pareceres = [], remocao = [], obras = [], sobrestamento = [], monitor = [], doaga = [], adhel = [];

  async function loadPareceres() {
    const [intRes, extRes] = await Promise.all([
      sb.from('v_prazo_pareceres').select('nup,type,due_date,days_remaining,deadline_days'),
      sb.from('v_prazo_pareceres_externos').select('nup,type,due_date,days_remaining,deadline_days')
    ]);
    const normalize = rows => (Array.isArray(rows) ? rows : []);
    const parecerRows = normalize(intRes.data)
      .filter(row => ['ATM', 'DT', 'CGNA'].includes(row.type))
      .map(row => ({ ...row, origin: 'parecer', type_label: `Parecer ${row.type}` }));
    const sigadaerRows = normalize(extRes.data)
      .filter(row => row.due_date || typeof row.deadline_days === 'number')
      .map(row => ({
        ...row, origin: 'sigadaer', type_label: `SIGADAER ${row.type}`,
        days_remaining: typeof row.days_remaining === 'number' ? row.days_remaining : Utils.daysBetween(new Date(), row.due_date)
      }));
    pareceres = [...parecerRows, ...sigadaerRows].sort((a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31'));
    const { tbody } = Utils.renderTable('prazoParec', PARECERES_COLUMNS, pareceres);
    bindRowLinks(tbody);
  }

  async function loadRemocao() {
    const { data } = await sb.from('v_prazo_remocao_rebaixamento').select('nup,due_date,days_remaining');
    remocao = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    const { tbody } = Utils.renderTable('prazoRemocao', REMOCAO_COLUMNS, remocao);
    bindRowLinks(tbody);
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra').select('nup,due_date,days_remaining,em_atraso');
    obras = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    const { tbody } = Utils.renderTable('prazoObra', OBRAS_COLUMNS, obras);
    bindRowLinks(tbody);
  }

  async function loadSobrestamento() {
    const { data } = await sb.from('v_prazo_sobrestamento').select('nup,due_date,days_remaining');
    sobrestamento = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    const { tbody } = Utils.renderTable('prazoSobrestamento', SOBRESTAMENTO_COLUMNS, sobrestamento);
    bindRowLinks(tbody);
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao').select('nup,type,number');
    monitor = data || [];
    const { tbody } = Utils.renderTable('prazoMonit', MONITOR_COLUMNS, monitor);
    bindRowLinks(tbody);
  }

  async function loadDOAGA() {
    const { data } = await sb.from('v_prazo_do_aga').select('nup,due_date,days_remaining');
    doaga = (data || []).sort((a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31'));
    const { tbody } = Utils.renderTable('prazoDOAGA', DOAGA_COLUMNS, doaga);
    bindRowLinks(tbody);
  }

  async function loadADHEL() {
    const { data } = await sb.from('v_prazo_ad_hel').select('nup,due_date,days_remaining');
    adhel = (data || []).sort((a, b) => new Date(a.due_date || '9999-12-31') - new Date(b.due_date || '9999-12-31'));
    const { tbody } = Utils.renderTable('prazoADHEL', ADHEL_COLUMNS, adhel);
    bindRowLinks(tbody);
  }

  // ================= API pública =================
  async function init() { await load(); }
  async function load() {
    await Promise.all([
      loadPareceres(), loadRemocao(), loadObra(),
      loadSobrestamento(), loadMonitor(), loadDOAGA(), loadADHEL()
    ]);
  }

  return { init, load };
})();

// ======= Helpers do Admin (histórico) =======
window.PrazoSignalHistory = {
  async validarSinalizacao(processId, nup, type, number, observacoes) {
    if (!processId) processId = await (async () => {
      const { data } = await sb.from('processes').select('id').eq('nup', nup).limit(1);
      return (Array.isArray(data) && data[0]?.id) ? data[0].id : null;
    })();
    if (!processId) return;
    const u = await (window.getUser ? window.getUser() : null);
    const details = { tipo: type || null, numero_sigadaer: number || null, observacoes: observacoes || null };
    await sb.from('history').insert({
      process_id: processId,
      action: 'Sinalização Leitura/Expedição validada',
      details,
      created_by: u ? u.id : null
    });
  },
  async rejeitarSinalizacao(processId, nup, type, number, observacoes) {
    if (!processId) processId = await (async () => {
      const { data } = await sb.from('processes').select('id').eq('nup', nup).limit(1);
      return (Array.isArray(data) && data[0]?.id) ? data[0].id : null;
    })();
    if (!processId) return;
    const u = await (window.getUser ? window.getUser() : null);
    const details = { tipo: type || null, numero_sigadaer: number || null, observacoes: observacoes || null };
    await sb.from('history').insert({
      process_id: processId,
      action: 'Sinalização Leitura/Expedição rejeitada',
      details,
      created_by: u ? u.id : null
    });
  }
};
