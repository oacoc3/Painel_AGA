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
      // Por enquanto, sem função (placeholder solicitado).
      // Futuro: chamar RPC set_prazo_signal(process_id, 'LEITURA_EXPEDICAO', ...)
      // Aqui manteremos apenas um aviso não intrusivo no console:
      console.info('[Prazo] Botão "Sinalizar" clicado para NUP', nup);
    };
    btnFechar.onclick = () => {
      if (typeof dlg.close === 'function') dlg.close();
    };
    // Ação do botão "Validação": abre popup com Validar/Rejeitar
    if (btnValidacao) {
      btnValidacao.onclick = () => {
        const vdlg = ensurePrazoValidationDialog();
        const nupVal = dlg.dataset.nup || '';
        const rowKey = dlg.dataset.rowKey || '';
        const [nupKey, numberKey, typeKey] = rowKey.split('|');

        vdlg.dataset.nup = nupVal || nupKey || '';
        vdlg.dataset.type = typeKey || '';
        vdlg.dataset.number = numberKey || '';

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

        const doClose = () => { if (typeof vdlg.close === 'function') vdlg.close(); };

        const btnApprove = vdlg.querySelector('#prazoValApprove');
        const btnReject = vdlg.querySelector('#prazoValReject');
        const btnCloseV = vdlg.querySelector('#prazoValClose');

        if (btnApprove) btnApprove.onclick = async () => {
          try {
            await window.PrazoSignalHistory?.validarSinalizacao(
              vdlg.dataset.nup, vdlg.dataset.type, vdlg.dataset.number, obsEl?.value || null
            );
          } catch (e) { console.error('[Prazo] Validação (Admin) falhou:', e); }
          doClose();
          if (typeof prazoClickDialog?.close === 'function') prazoClickDialog.close();
        };

        if (btnReject) btnReject.onclick = async () => {
          try {
            await window.PrazoSignalHistory?.rejeitarSinalizacao(
              vdlg.dataset.nup, vdlg.dataset.type, vdlg.dataset.number, obsEl?.value || null
            );
          } catch (e) { console.error('[Prazo] Rejeição (Admin) falhou:', e); }
          doClose();
          if (typeof prazoClickDialog?.close === 'function') prazoClickDialog.close();
        };

        if (btnCloseV) btnCloseV.onclick = () => doClose();

        if (typeof vdlg.showModal === 'function') vdlg.showModal();
        else vdlg.setAttribute('open','open');
      };
    }


    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.style.display = 'block';
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
    renderPareceres();
  }

  function getRemocaoRows() {
    return remocao;
  }

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

  function getObraRows() {
    return obras;
  }

  function renderObra() {
    const rows = getObraRows();
    const { tbody } = Utils.renderTable('prazoObra', OBRAS_COLUMNS, rows);
    bindRowLinks(tbody);
  }

  async function loadObra() {
    const { data } = await sb.from('v_prazo_termino_obra')
      .select('nup,due_date,days_remaining,em_atraso');
    obras = (data || []).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
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
    bindRowLinks(tbody);
  }

  async function loadMonitor() {
    const { data } = await sb.from('v_monitorar_tramitacao')
      .select('nup,type,number');
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

  return { init, load };
})();



// === AGA patch: Implementação do botão "Sinalizar" (Leitura/Expedição) ===
// - Abre popup com data/hora (obrigatória) e observações (opcional).
// - "Enviar" fecha os popups, destaca a linha clicada e o título do card.
// - Só habilita "Enviar" quando houver data/hora.
// - Somente ativo para o card Leitura/Expedição (container 'prazoMonit').

(function() {
  const HIGHLIGHT_COLOR = '#fff3b0';

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

  function highlightRowByKey(containerId, rowKey) {
    const box = document.getElementById(containerId);
    if (!box) return;
    const tr = Array.from(box.querySelectorAll('tbody tr'))
      .find(tr => tr.dataset.rowkey === rowKey);
    if (tr) tr.style.backgroundColor = HIGHLIGHT_COLOR;
    highlightCardTitle(box);
  }

  // Reimplementa a abertura do popup principal para aceitar contexto completo
  const _openPrazoClickPopup = openPrazoClickPopup;
  function openPrazoClickPopup(ctxNupOrObj) {
    // Compatibilidade com chamadas antigas: se vier string, mantém comportamento
    if (typeof ctxNupOrObj === 'string') {
      return _openPrazoClickPopup(ctxNupOrObj);
    }
    const { nup, originId, rowKey } = ctxNupOrObj || {};
    const dlg = ensurePrazoClickDialog();
    const nupEl = dlg.querySelector('#prazoClickNup');
    if (nupEl) nupEl.textContent = `NUP: ${nup}`;
    // Guarda contexto para uso por Validação
    dlg.dataset.nup = nup || '';
    dlg.dataset.rowKey = rowKey || '';

    // Garante a existência do botão "Validação" entre Sinalizar e Fechar
    let btnValidacao = dlg.querySelector('#prazoValidacao');
    const btnVer = dlg.querySelector('#prazoVerLista');
    const btnSinalizar = dlg.querySelector('#prazoSinalizar');
    const btnFechar = dlg.querySelector('#prazoFechar');
    if (!btnValidacao) {
      btnValidacao = document.createElement('button');
      btnValidacao.id = 'prazoValidacao';
      btnValidacao.type = 'button';
      btnValidacao.textContent = 'Validação';
      // Inserir após Sinalizar e antes de Fechar
      if (btnSinalizar && btnFechar && btnFechar.parentElement) {
        btnFechar.parentElement.insertBefore(btnValidacao, btnFechar);
      } else if (btnSinalizar && btnSinalizar.parentElement) {
        btnSinalizar.parentElement.appendChild(btnValidacao);
      }
    }


    const btnVer = dlg.querySelector('#prazoVerLista');
    const btnSinalizar = dlg.querySelector('#prazoSinalizar');
    const btnFechar = dlg.querySelector('#prazoFechar');

    btnVer.onclick = () => {
      try { sessionStorage.setItem('procPreSelect', nup); } catch (_) {}
      window.location.href = 'processos.html';
    };

    btnSinalizar.onclick = () => {
      // Só ativa no card Leitura/Expedição
      if (originId !== 'prazoMonit') {
        console.info('[Prazo] "Sinalizar" habilitado apenas no card Leitura/Expedição.');
        return;
      }
      const sdlg = ensurePrazoSignalDialog();
      sdlg.dataset.originId = originId || '';
      sdlg.dataset.rowKey = rowKey || '';
      const nEl = sdlg.querySelector('#prazoSignalNup');
      if (nEl) nEl.textContent = `NUP: ${nup}`;

      const dt = sdlg.querySelector('#prazoSignalDateTime');
      const obs = sdlg.querySelector('#prazoSignalObs');
      const send = sdlg.querySelector('#prazoSignalSend');
      const closeBtn = sdlg.querySelector('#prazoSignalClose');
      if (dt) dt.value = '';
      if (obs) obs.value = '';
      if (send) send.disabled = true;

      const validate = () => { send.disabled = !dt?.value; };
      dt?.addEventListener('input', validate, { once: false });

      closeBtn.onclick = () => { if (typeof sdlg.close === 'function') sdlg.close(); };

      send.onclick = () => {
        if (!dt?.value) return;
        // === Registro no histórico (Analista) ===
        try {
          const rk = sdlg.dataset.rowKey || '';
          const [nupKey, numberKey, typeKey] = rk.split('|');
          let processId = null;
          if (nupKey) {
            const { data: procRows, error: pErr } = await sb
              .from('processes')
              .select('id')
              .eq('nup', nupKey)
              .limit(1);
            if ((!procRows || !procRows[0]) && nupNorm) {
              // tentativa 2: ilike por trecho numérico
              const pat = `%${nupNorm.slice(-10)}%`;
              const { data: procRows2 } = await sb.from('processes').select('id,nup').ilike('nup', pat).limit(1);
              if (Array.isArray(procRows2) && procRows2[0]?.id) processId = procRows2[0].id;
            }
            if (!pErr && Array.isArray(procRows) && procRows[0]?.id) {
              processId = procRows[0].id;
            }
          }
          if (processId) {
            const details = {
              tipo: typeKey || null,
              numero_sigadaer: numberKey || null,
              observacoes: obs?.value || null
            };
            const u = await (window.getUser ? window.getUser() : null);
            await sb.from('history').insert({
              process_id: processId,
              action: 'Sinalização Leitura/Expedição',
              details,
              created_by: u ? u.id : null
            });
          }
        } catch (e) { console.error('[Prazo] Erro ao registrar histórico (analista):', e); }
    
        // Por ora, apenas UI (futuro: persistir em banco).
        if (typeof sdlg.close === 'function') sdlg.close();
        if (typeof prazoClickDialog?.close === 'function') prazoClickDialog.close();
        const cid = sdlg.dataset.originId || 'prazoMonit';
        const rk = sdlg.dataset.rowKey || '';
        highlightRowByKey(cid, rk);
      };

      if (typeof sdlg.showModal === 'function') sdlg.showModal();
      else sdlg.setAttribute('open', 'open');
    };

    btnFechar.onclick = () => { if (typeof dlg.close === 'function') dlg.close(); };

    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.style.display = 'block';
  }
  
  // Popup de Validação/Rejeição (Admin)
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

  window.openPrazoClickPopup = openPrazoClickPopup; // expõe redefinição

  // Reimplementa bindRowLinks para gerar uma chave estável da linha e passar o originId
  const _bindRowLinks = bindRowLinks;
  function bindRowLinks(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      try {
        const data = JSON.parse(tr.dataset.row);
        if (!data?.nup) return;
        const container = tbody.closest('div[id]');
        const originId = container ? container.id : '';

        // Monta uma chave estável para conseguir destacar apenas a linha clicada
        const rowKey = [data.nup, data.number || '', data.type || ''].join('|');
        tr.dataset.rowkey = rowKey;

        tr.addEventListener('click', () => {
          openPrazoClickPopup({
            nup: String(data.nup),
            originId,
            rowKey
          });
        });
      } catch {}
    });
  }
  window.bindRowLinks = bindRowLinks; // expõe redefinição
})();


// === Auxiliar: registros de Validação/Rejeição pelo Administrador ===
// Estes helpers podem ser chamados quando os botões de Admin forem implementados.
window.PrazoSignalHistory = {
  async validarSinalizacao(nup, type, number, observacoes) {
    // Resolve process_id por NUP
    let processId = null;
    if (nup) {
      const { data: procRows, error: pErr } = await sb.from('processes').select('id').eq('nup', nup).limit(1);
      if (!pErr && Array.isArray(procRows) && procRows[0]?.id) processId = procRows[0].id;
    }%`;
        const { data: procRows2 } = await sb.from('processes').select('id,nup').ilike('nup', pat).limit(1);
        if (Array.isArray(procRows2) && procRows2[0]?.id) processId = procRows2[0].id;
      }
    }
    if (!processId) return;
    const details = {
      tipo: type || null,
      numero_sigadaer: number || null,
      observacoes: observacoes || null
    };
    const uV = await (window.getUser ? window.getUser() : null);
    await sb.from('history').insert({ process_id: processId, action: 'Sinalização Leitura/Expedição validada', details, created_by: uV ? uV.id : null });
  },
  async rejeitarSinalizacao(nup, type, number, observacoes) {
    let processId = null;
    if (nup) {
      const { data: procRows, error: pErr } = await sb.from('processes').select('id').eq('nup', nup).limit(1);
      if (!pErr && Array.isArray(procRows) && procRows[0]?.id) processId = procRows[0].id;
    }%`;
        const { data: procRows2 } = await sb.from('processes').select('id,nup').ilike('nup', pat).limit(1);
        if (Array.isArray(procRows2) && procRows2[0]?.id) processId = procRows2[0].id;
      }
    }
    if (!processId) return;
    const details = {
      tipo: type || null,
      numero_sigadaer: number || null,
      observacoes: observacoes || null
    };
    const uR = await (window.getUser ? window.getUser() : null);
    await sb.from('history').insert({ process_id: processId, action: 'Sinalização Leitura/Expedição rejeitada', details, created_by: uR ? uR.id : null });
  }
};
