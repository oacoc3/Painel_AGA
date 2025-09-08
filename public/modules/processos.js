// public/modules/processos.js
window.Modules = window.Modules || {};
window.Modules.processos = (() => {
  let currentProcId = null;
  let currentNUP = '';
  let currentOpiniaoRecId = null;
  let currentNotifLidaId = null;
  let currentSigExpId = null;
  let currentSigRecId = null;

  function el(id) { return document.getElementById(id); }

  function syncNUP() {
    if (el('procNUP')) el('procNUP').value = currentNUP || '';
    if (el('opNUP')) el('opNUP').value = currentNUP || '';
    if (el('ntNUP')) el('ntNUP').value = currentNUP || '';
    if (el('sgNUP')) el('sgNUP').value = currentNUP || '';
  }

  // Mostra a aba (formulário à esquerda) e alterna a lista do meio
  function showTab(tab) {
    const tabs = ['proc','opiniao','notif','sig'];
    tabs.forEach(t => {
      const box = el('tab' + t.charAt(0).toUpperCase() + t.slice(1));
      if (box) box.style.display = t === tab ? 'block' : 'none';
    });
    // Destaque no botão ativo
    Array.from(document.querySelectorAll('[data-tab]'))
      .forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    // Alterna a lista na coluna do meio
    const map = { proc: 'procLista', opiniao: 'opLista', notif: 'ntLista', sig: 'sgLista' };
    Object.values(map).forEach(id => { if (el(id)) el(id).style.display = 'none'; });
    if (el(map[tab])) el(map[tab]).style.display = 'block';
  }

  function toggleObraConcluida() {
    el('btnObraConcluida').classList.toggle('active');
    el('btnSalvarProc').disabled = false;
  }

  function clearProcessForm() {
    currentProcId = null;
    currentNUP = '';
    syncNUP();
    el('procNUP').value = '';
    el('procTipo').value = 'PDIR';
    el('procStatus').value = 'ANATEC-PRE';
    el('procStatusDate').value = '';
    el('procEntrada').value = '';
    el('procObraTermino').value = '';
    el('procObs').value = '';
    el('btnObraConcluida').classList.remove('active');
    el('btnSalvarProc').disabled = true;
    Utils.setMsg('procMsg', '');
    // Limpa listas e histórico visuais
    if (el('procLista')) el('procLista').innerHTML = '';
    if (el('opLista')) el('opLista').innerHTML = '';
    if (el('ntLista')) el('ntLista').innerHTML = '';
    if (el('sgLista')) el('sgLista').innerHTML = '';
    if (el('histProcesso')) el('histProcesso').innerHTML = '';
  }

  function bindProcFormTracking() {
    const inputs = ['procNUP','procTipo','procStatus','procStatusDate','procEntrada','procObraTermino','procObs'];
    inputs.forEach(id => {
      const e = el(id);
      if (!e) return;
      e.addEventListener('input', () => { el('btnSalvarProc').disabled = false; });
      e.addEventListener('change', () => { el('btnSalvarProc').disabled = false; });
    });
  }

  async function upsertProcess() {
    const nup = el('procNUP').value.trim();
    const type = el('procTipo').value;
    const status = el('procStatus').value;
    const statusSinceInput = el('procStatusDate').value;
    const firstEntry = el('procEntrada').value ? new Date(el('procEntrada').value).toISOString() : null;
    const obraTerm = el('procObraTermino').value ? new Date(el('procObraTermino').value).toISOString() : null;
    const obraConcl = el('btnObraConcluida').classList.contains('active');
    const crea = el('procObs').value?.trim() || null;

    if (!nup) return Utils.setMsg('procMsg', 'Informe o NUP.', true);
    Utils.setMsg('procMsg', 'Salvando…');

    try {
      if (!window.getUser) throw new Error('Auth não inicializado.');
      const u = await getUser();
      if (!u) throw new Error('Sessão expirada. Faça login novamente.');

      if (!currentProcId) {
        // insert
        const payload = {
          nup, type, status,
          status_since: statusSinceInput ? new Date(statusSinceInput).toISOString() : null,
          first_entry_date: firstEntry,
          obra_termino_date: obraTerm,
          obra_concluida: obraConcl,
          observations: crea,
          created_by: u.id
        };
        const { data, error } = await sb.from('processes').insert(payload).select('id').single();
        if (error) throw error;
        currentProcId = data?.id || null;
        currentNUP = nup;
        syncNUP();
        Utils.setMsg('procMsg', 'Processo cadastrado.');
        await Promise.all([loadProcessList(), reloadLists()]);
      } else {
        // update
        const payload = {
          nup, type, status,
          status_since: statusSinceInput ? new Date(statusSinceInput).toISOString() : null,
          first_entry_date: firstEntry,
          obra_termino_date: obraTerm,
          obra_concluida: obraConcl,
          observations: crea
        };
        const { error } = await sb.from('processes').update(payload).eq('id', currentProcId);
        if (error) throw error;
        Utils.setMsg('procMsg', 'Processo atualizado.');
        await Promise.all([loadProcessList(), reloadLists()]);
      }
    } catch (e) {
      Utils.setMsg('procMsg', e.message || String(e), true);
    }
  }

  // ======== LISTA DE PROCESSOS (coluna do meio quando aba "Processo") ========
  async function loadProcessList() {
    const box = el('procLista');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb.from('processes')
        .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida,created_at,created_by')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>NUP</th><th>Tipo</th><th>Status</th><th>Desde</th>
          <th>1ª Entrada</th><th>Obra (término)</th><th>Concluída</th><th>Ações</th>
        </tr>`;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      (data || []).forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.nup}</td>
          <td>${row.type}</td>
          <td>${row.status || ''}</td>
          <td>${row.status_since ? Utils.fmtDateTime(row.status_since) : ''}</td>
          <td>${row.first_entry_date ? Utils.fmtDate(row.first_entry_date) : ''}</td>
          <td>${row.obra_termino_date ? Utils.fmtDate(row.obra_termino_date) : ''}</td>
          <td>${row.obra_concluida ? 'Sim' : 'Não'}</td>
          <td><button type="button" data-id="${row.id}" class="selProc">Selecionar</button></td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.innerHTML = '';
      box.appendChild(table);

      Array.from(box.querySelectorAll('.selProc')).forEach(btn => {
        btn.addEventListener('click', async () => {
          currentProcId = btn.getAttribute('data-id');
          const row = (data || []).find(r => r.id === currentProcId);
          currentNUP = row?.nup || '';
          syncNUP();
          // Preenche formulário (aba Processo)
          el('procNUP').value = row.nup;
          el('procTipo').value = row.type;
          el('procStatus').value = row.status || 'ANATEC-PRE';
          el('procStatusDate').value = row.status_since ? Utils.toDateTimeLocalValue(row.status_since) : '';
          el('procEntrada').value = row.first_entry_date ? Utils.toDateInputValue(row.first_entry_date) : '';
          el('procObraTermino').value = row.obra_termino_date ? Utils.toDateInputValue(row.obra_termino_date) : '';
          el('procObs').value = row.observations || '';
          if (row.obra_concluida) el('btnObraConcluida').classList.add('active'); else el('btnObraConcluida').classList.remove('active');
          el('btnSalvarProc').disabled = true;
          Utils.setMsg('procMsg', 'Processo selecionado.');
          await reloadLists(); // carrega listas das outras abas + histórico
        });
      });
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  // ======== OPINIÕES INTERNAS ========
  async function cadastrarOpiniao() {
    const type = el('opTipo')?.value;
    const t = el('opSolic')?.value;
    const requested_at = t ? new Date(t).toISOString() : new Date().toISOString();
    if (!currentProcId) return Utils.setMsg('opMsg', 'Nenhum processo selecionado.', true);
    Utils.setMsg('opMsg', 'Cadastrando…');
    try {
      if (!window.getUser) throw new Error('Auth não inicializado.');
      const u = await getUser();
      if (!u) throw new Error('Sessão expirada. Faça login novamente.');
      const payload = { process_id: currentProcId, type, requested_at, created_by: u.id };
      const { error } = await sb.from('internal_opinions').insert(payload);
      if (error) throw error;
      Utils.setMsg('opMsg', 'Parecer cadastrado (status SOLICITADO).');
      await reloadLists();
    } catch (e) {
      Utils.setMsg('opMsg', e.message || String(e), true);
    }
  }
  function showRecebOpiniaoForm(id) {
    currentOpiniaoRecId = id;
    el('opRecInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('opLista'); Utils.show('opRecForm');
  }
  function cancelarRecOpiniao() {
    currentOpiniaoRecId = null;
    Utils.hide('opRecForm'); Utils.show('opLista');
  }
  async function registrarRecebOpiniao() {
    if (!currentOpiniaoRecId) return cancelarRecOpiniao();
    const v = el('opRecInput')?.value;
    const received_at = v ? new Date(v).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb.from('internal_opinions')
        .update({ received_at }).eq('id', currentOpiniaoRecId);
      if (error) throw error;
      cancelarRecOpiniao();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('opMsg', e.message || String(e), true);
    }
  }
  function showFimOpiniaoForm(id) {
    currentOpiniaoRecId = id;
    el('opFinInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('opLista'); Utils.show('opFinForm');
  }
  function cancelarFimOpiniao() {
    currentOpiniaoRecId = null;
    Utils.hide('opFinForm'); Utils.show('opLista');
  }
  async function registrarFimOpiniao() {
    if (!currentOpiniaoRecId) return cancelarFimOpiniao();
    const v = el('opFinInput')?.value;
    const finalized_at = v ? new Date(v).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb.from('internal_opinions')
        .update({ finalized_at, status: 'EMITIDO' }).eq('id', currentOpiniaoRecId);
      if (error) throw error;
      cancelarFimOpiniao();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('opMsg', e.message || String(e), true);
    }
  }
  async function loadOpiniaoList(processId) {
    const box = el('opLista');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb.from('internal_opinions')
        .select('id,type,requested_at,received_at,finalized_at,status')
        .eq('process_id', processId)
        .order('requested_at', { ascending: false });
      if (error) throw error;

      const table = document.createElement('table');
      table.innerHTML = `
        <thead>
          <tr><th>Tipo</th><th>Solicitada</th><th>Recebida</th><th>Finalizada</th><th>Status</th><th>Ações</th></tr>
        </thead>`;
      const tbody = document.createElement('tbody');
      (data || []).forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.type}</td>
          <td>${row.requested_at ? Utils.fmtDateTime(row.requested_at) : ''}</td>
          <td>${row.received_at ? Utils.fmtDateTime(row.received_at) : ''}</td>
          <td>${row.finalized_at ? Utils.fmtDateTime(row.finalized_at) : ''}</td>
          <td>${row.status || ''}</td>
          <td>
            <button type="button" class="recOp" data-id="${row.id}">Receb.</button>
            <button type="button" class="fimOp" data-id="${row.id}">Finaliz.</button>
          </td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.innerHTML = ''; box.appendChild(table);

      Array.from(box.querySelectorAll('.recOp')).forEach(btn => {
        btn.addEventListener('click', () => showRecebOpiniaoForm(btn.getAttribute('data-id')));
      });
      Array.from(box.querySelectorAll('.fimOp')).forEach(btn => {
        btn.addEventListener('click', () => showFimOpiniaoForm(btn.getAttribute('data-id')));
      });
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  // ======== NOTIFICAÇÕES ========
  function showNotifLidaForm(id) {
    currentNotifLidaId = id;
    el('ntLidaInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('ntLista'); Utils.show('ntLidaForm');
  }
  function cancelarNotifLida() {
    currentNotifLidaId = null;
    Utils.hide('ntLidaForm'); Utils.show('ntLista');
  }
  async function registrarNotifLida() {
    if (!currentNotifLidaId) return cancelarNotifLida();
    const v = el('ntLidaInput')?.value;
    const read_at = v ? new Date(v).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb.from('notifications')
        .update({ read_at, status: 'LIDA' }).eq('id', currentNotifLidaId);
      if (error) throw error;
      cancelarNotifLida();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('ntMsg', e.message || String(e), true);
    }
  }
  async function loadNotifList(processId) {
    const box = el('ntLista');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb.from('notifications')
        .select('id,type,requested_at,read_at,status')
        .eq('process_id', processId)
        .order('requested_at', { ascending: false });
      if (error) throw error;

      const table = document.createElement('table');
      table.innerHTML = `
        <thead>
          <tr><th>Tipo</th><th>Solicitada</th><th>Lida</th><th>Status</th><th>Ações</th></tr>
        </thead>`;
      const tbody = document.createElement('tbody');
      (data || []).forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.type}</td>
          <td>${row.requested_at ? Utils.fmtDateTime(row.requested_at) : ''}</td>
          <td>${row.read_at ? Utils.fmtDateTime(row.read_at) : ''}</td>
          <td>${row.status || ''}</td>
          <td><button type="button" class="lidaNt" data-id="${row.id}">Marcar lida</button></td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.innerHTML = ''; box.appendChild(table);

      Array.from(box.querySelectorAll('.lidaNt')).forEach(btn => {
        btn.addEventListener('click', () => showNotifLidaForm(btn.getAttribute('data-id')));
      });
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  // ======== SIGADAER ========
  function cancelarSIGExp() { Utils.hide('sgExpForm'); Utils.show('sgLista'); currentSigExpId = null; }
  function cancelarSIGRec() { Utils.hide('sgRecForm'); Utils.show('sgLista'); currentSigRecId = null; }
  function showSIGExpForm(id) {
    currentSigExpId = id;
    el('sgExpInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('sgLista'); Utils.show('sgExpForm');
  }
  function showSIGRecForm(id) {
    currentSigRecId = id;
    el('sgRecInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('sgLista'); Utils.show('sgRecForm');
  }

  async function loadSIGList(processId) {
    const box = el('sgLista');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb.from('sigadaer')
        .select('id,numbers,requested_at,expedit_at,received_at,status')
        .eq('process_id', processId)
        .order('requested_at', { ascending: false });
      if (error) throw error;

      const table = document.createElement('table');
      table.innerHTML = `
        <thead>
          <tr><th>Números</th><th>Solicitado</th><th>Expedido</th><th>Recebido</th><th>Status</th><th>Ações</th></tr>
        </thead>`;
      const tbody = document.createElement('tbody');
      (data || []).forEach(row => {
        const nums = Array.isArray(row.numbers) ? row.numbers.join(', ') : (row.numbers ?? '');
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${nums}</td>
          <td>${row.requested_at ? Utils.fmtDateTime(row.requested_at) : ''}</td>
          <td>${row.expedit_at ? Utils.fmtDateTime(row.expedit_at) : ''}</td>
          <td>${row.received_at ? Utils.fmtDateTime(row.received_at) : ''}</td>
          <td>${row.status || ''}</td>
          <td>
            <button type="button" class="expSg" data-id="${row.id}">Expedido</button>
            <button type="button" class="recSg" data-id="${row.id}">Recebido</button>
          </td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.innerHTML = ''; box.appendChild(table);

      Array.from(box.querySelectorAll('.expSg')).forEach(btn => {
        btn.addEventListener('click', () => showSIGExpForm(btn.getAttribute('data-id')));
      });
      Array.from(box.querySelectorAll('.recSg')).forEach(btn => {
        btn.addEventListener('click', () => showSIGRecForm(btn.getAttribute('data-id')));
      });
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  async function registrarSIGExpedido() {
    if (!currentSigExpId) return cancelarSIGExp();
    const v = el('sgExpInput')?.value;
    const expedit_at = v ? new Date(v).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb.from('sigadaer').update({ expedit_at, status: 'EXPEDIDO' }).eq('id', currentSigExpId);
      if (error) throw error;
      cancelarSIGExp(); await reloadLists();
    } catch (e) {
      Utils.setMsg('sgMsg', e.message || String(e), true);
    }
  }
  async function registrarSIGRecebido() {
    if (!currentSigRecId) return cancelarSIGRec();
    const v = el('sgRecInput')?.value;
    const received_at = v ? new Date(v).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb.from('sigadaer').update({ received_at, status: 'RECEBIDO' }).eq('id', currentSigRecId);
      if (error) throw error;
      cancelarSIGRec(); await reloadLists();
    } catch (e) {
      Utils.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  // ======== HISTÓRICO (coluna direita) ========
  function resumoDetalhes(obj) {
    if (!obj || typeof obj !== 'object') return '';
    const prefer = ['nup','type','status','status_since','first_entry_date','obra_termino_date','obra_concluida','requested_at','received_at','finalized_at','expedit_at','numbers'];
    const out = [];
    prefer.forEach(k => {
      if (k in obj && obj[k] != null) {
        let v = obj[k];
        if (Array.isArray(v)) v = v.join(', ');
        if (typeof v === 'string' && v.length > 80) v = v.slice(0, 80) + '…';
        out.push(`${k}=${v}`);
      }
    });
    if (!out.length) {
      const keys = Object.keys(obj).slice(0, 5);
      keys.forEach(k => out.push(`${k}=${typeof obj[k]==='object' ? '…' : obj[k]}`));
    }
    return out.join(' | ');
  }

  async function loadHistory(processId) {
    const box = el('histProcesso');
    if (!box) return;
    if (!processId) { box.innerHTML = '<div class="msg">Selecione um processo…</div>'; return; }
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb.from('history')
        .select('id,action,details,user_email,created_at')
        .eq('process_id', processId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      Utils.renderTable('histProcesso', [
        { label: 'Quando', render: r => Utils.fmtDateTime(r.created_at), width: '140px' },
        { label: 'Ação',   key: 'action', width: '90px' },
        { label: 'Usuário', key: 'user_email' },
        { label: 'Detalhes', render: r => resumoDetalhes(r.details) }
      ], data || []);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  // ======== RELOAD de listas relacionadas + histórico ========
  async function reloadLists() {
    if (!currentProcId) return;
    await Promise.all([
      loadOpiniaoList(currentProcId),
      loadNotifList(currentProcId),
      loadSIGList(currentProcId),
      loadHistory(currentProcId),
    ]);
  }

  // ======== BINDINGS ========
  function bindEvents() {
    // Abas
    Array.from(document.querySelectorAll('[data-tab]')).forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });
    showTab('proc'); // padrão

    // Processo
    if (el('btnObraConcluida')) el('btnObraConcluida').addEventListener('click', toggleObraConcluida);
    if (el('btnSalvarProc')) el('btnSalvarProc').addEventListener('click', (ev) => { ev.preventDefault(); upsertProcess(); });
    if (el('btnNovoProc')) el('btnNovoProc').addEventListener('click', (ev) => { ev.preventDefault(); clearProcessForm(); });
    bindProcFormTracking();

    // Parecer
    if (el('btnCadOpiniao')) el('btnCadOpiniao').addEventListener('click', (ev) => { ev.preventDefault(); cadastrarOpiniao(); });
    if (el('btnSalvarOpRec')) el('btnSalvarOpRec').addEventListener('click', (ev) => { ev.preventDefault(); registrarRecebOpiniao(); });
    if (el('btnVoltarOpRec')) el('btnVoltarOpRec').addEventListener('click', (ev) => { ev.preventDefault(); cancelarRecOpiniao(); });
    if (el('btnSalvarOpFin')) el('btnSalvarOpFin').addEventListener('click', (ev) => { ev.preventDefault(); registrarFimOpiniao(); });
    if (el('btnVoltarOpFin')) el('btnVoltarOpFin').addEventListener('click', (ev) => { ev.preventDefault(); cancelarFimOpiniao(); });

    // Notificação
    if (el('btnCadNotif')) el('btnCadNotif').addEventListener('click', async (ev) => {
      ev.preventDefault();
      const type = el('ntTipo')?.value;
      const t = el('ntSolic')?.value;
      const requested_at = t ? new Date(t).toISOString() : new Date().toISOString();
      if (!currentProcId) return Utils.setMsg('ntMsg', 'Nenhum processo selecionado.', true);
      Utils.setMsg('ntMsg', 'Cadastrando…');
      try {
        if (!window.getUser) throw new Error('Auth não inicializado.');
        const u = await getUser();
        if (!u) throw new Error('Sessão expirada. Faça login novamente.');
        const payload = { process_id: currentProcId, type, requested_at, status: 'SOLICITADA', created_by: u.id };
        const { error } = await sb.from('notifications').insert(payload);
        if (error) throw error;
        Utils.setMsg('ntMsg', 'Solicitação cadastrada.');
        await reloadLists();
      } catch (e) {
        Utils.setMsg('ntMsg', e.message || String(e), true);
      }
    });
    if (el('btnSalvarNtLida')) el('btnSalvarNtLida').addEventListener('click', (ev) => { ev.preventDefault(); registrarNotifLida(); });
    if (el('btnVoltarNtLida')) el('btnVoltarNtLida').addEventListener('click', (ev) => { ev.preventDefault(); cancelarNotifLida(); });

    // SIGADAER
    if (el('btnCadSIG')) el('btnCadSIG').addEventListener('click', async (ev) => {
      ev.preventDefault();
      const type = el('sgTipo')?.value;
      const rawNums = el('sgNums')?.value?.trim() || '';
      const numbers = rawNums ? (rawNums.match(/\d+/g)?.map(n => parseInt(n, 10)) || null) : null; // extrai números
      const t = el('sgSolic')?.value;
      const requested_at = t ? new Date(t).toISOString() : new Date().toISOString();
      if (!currentProcId) return Utils.setMsg('sgMsg', 'Nenhum processo selecionado.', true);
      Utils.setMsg('sgMsg', 'Cadastrando…');
      try {
        if (!window.getUser) throw new Error('Auth não inicializado.');
        const u = await getUser();
        if (!u) throw new Error('Sessão expirada. Faça login novamente.');
        const payload = { process_id: currentProcId, type, numbers, requested_at, status: 'SOLICITADA', created_by: u.id };
        const { error } = await sb.from('sigadaer').insert(payload);
        if (error) throw error;
        Utils.setMsg('sgMsg', 'Solicitação cadastrada.');
        await reloadLists();
      } catch (e) {
        Utils.setMsg('sgMsg', e.message || String(e), true);
      }
    });
    if (el('btnSalvarSgExp')) el('btnSalvarSgExp').addEventListener('click', (ev) => { ev.preventDefault(); registrarSIGExpedido(); });
    if (el('btnVoltarSgExp')) el('btnVoltarSgExp').addEventListener('click', (ev) => { ev.preventDefault(); cancelarSIGExp(); });
    if (el('btnSalvarSgRec')) el('btnSalvarSgRec').addEventListener('click', (ev) => { ev.preventDefault(); registrarSIGRecebido(); });
    if (el('btnVoltarSgRec')) el('btnVoltarSgRec').addEventListener('click', (ev) => { ev.preventDefault(); cancelarSIGRec(); });
  }

  async function init() {
    bindEvents();
    await loadProcessList(); // carrega a lista inicial
    await loadHistory(null); // mostra mensagem "Selecione um processo…"
  }

  return { init };
})();
document.addEventListener('DOMContentLoaded', () => {
  if (window.Modules?.processos?.init) window.Modules.processos.init();
});
