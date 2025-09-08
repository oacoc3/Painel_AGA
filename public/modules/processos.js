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

  function showTab(tab) {
    const tabs = ['proc','opiniao','notif','sig'];
    tabs.forEach(t => {
      const box = el('tab' + t.charAt(0).toUpperCase() + t.slice(1));
      if (box) box.style.display = t === tab ? 'block' : 'none';
    });

    const buttons = Array.from(document.querySelectorAll('[data-tab]'));
    // destaca botão ativo
    buttons.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
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
  }

  function bindProcFormTracking() {
    const inputs = ['procNUP','procTipo','procStatus','procStatusDate','procEntrada','procObraTermino','procObs'];
    inputs.forEach(id => {
      const e = el(id);
      if (!e) return;
      e.addEventListener('input', () => {
        el('btnSalvarProc').disabled = false;
      });
      e.addEventListener('change', () => {
        el('btnSalvarProc').disabled = false;
      });
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

    if (!nup || !firstEntry) {
      Utils.setMsg('procMsg', 'Preencha NUP e Data 1ª entrada.', true);
      return;
    }
    Utils.setMsg('procMsg', currentProcId ? 'Atualizando...' : 'Cadastrando...');

    try {
      if (!window.getUser) throw new Error('Auth não inicializado.');
      const u = await getUser();
      if (!u) throw new Error('Sessão expirada. Faça login novamente.');

      if (!currentProcId) {
        const payload = {
          nup, type, status,
          status_since: statusSinceInput ? new Date(statusSinceInput).toISOString() : null,
          first_entry_date: firstEntry,
          obra_termino_date: obraTerm,
          obra_concluida: obraConcl,
          observations: crea,
          created_by: u.id
        };
        const { data, error } = await sb.from('processes').insert(payload).select('id').maybeSingle();
        if (error) throw error;
        currentProcId = data?.id || null;
        currentNUP = nup;
        syncNUP();
        Utils.setMsg('procMsg', 'Processo cadastrado.');
      } else {
        const payload = {
          nup, type, status,
          observations: crea,
          obra_termino_date: obraTerm,
          obra_concluida: obraConcl,
          status_since: statusSinceInput ? new Date(statusSinceInput).toISOString() : null,
          first_entry_date: firstEntry
        };
        const { error } = await sb.from('processes').update(payload).eq('id', currentProcId);
        if (error) throw error;
        Utils.setMsg('procMsg', 'Processo atualizado.');
      }
      await reloadLists();
    } catch (e) {
      Utils.setMsg('procMsg', e.message || String(e), true);
    }
  }

  async function loadProcessList() {
    const box = el('procLista');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb.from('processes')
        .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida,created_at,created_by')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      if (!data || !data.length) {
        box.innerHTML = '<div class="msg">Nenhum processo encontrado.</div>';
        return;
      }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>NUP</th><th>Tipo</th><th>Status</th><th>Desde</th><th>1ª Entrada</th><th>Obra (término)</th><th>Concluída</th><th>Ações</th></tr>';
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.nup}</td>
          <td>${row.type}</td>
          <td>${row.status || ''}</td>
          <td>${row.status_since ? Utils.fmtDateTime(row.status_since) : ''}</td>
          <td>${row.first_entry_date ? Utils.fmtDate(row.first_entry_date) : ''}</td>
          <td>${row.obra_termino_date ? Utils.fmtDate(row.obra_termino_date) : ''}</td>
          <td>${row.obra_concluida ? 'Sim' : 'Não'}</td>
          <td>
            <button type="button" data-id="${row.id}" class="selProc">Selecionar</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.innerHTML = '';
      box.appendChild(table);

      Array.from(box.querySelectorAll('.selProc')).forEach(btn => {
        btn.addEventListener('click', async () => {
          currentProcId = btn.getAttribute('data-id');
          const row = data.find(r => r.id === currentProcId);
          currentNUP = row?.nup || '';
          syncNUP();
          // Preenche o formulário
          el('procNUP').value = row.nup;
          el('procTipo').value = row.type;
          el('procStatus').value = row.status || 'ANATEC-PRE';
          el('procStatusDate').value = row.status_since ? Utils.toDateTimeLocalValue(row.status_since) : '';
          el('procEntrada').value = row.first_entry_date ? Utils.toDateLocalValue(row.first_entry_date) : '';
          el('procObraTermino').value = row.obra_termino_date ? Utils.toDateLocalValue(row.obra_termino_date) : '';
          el('procObs').value = row.observations || '';
          row.obra_concluida ? el('btnObraConcluida').classList.add('active') : el('btnObraConcluida').classList.remove('active');
          el('btnSalvarProc').disabled = true;
          Utils.setMsg('procMsg', 'Processo selecionado.');
          await reloadLists();
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
    Utils.hide('opLista');
    Utils.show('opRecForm');
  }
  function cancelarRecOpiniao() {
    currentOpiniaoRecId = null;
    Utils.hide('opRecForm');
    Utils.show('opLista');
  }

  async function registrarRecebOpiniao() {
    const t = el('opRecInput').value;
    const received_at = t ? new Date(t).toISOString() : new Date().toISOString();
    if (!currentOpiniaoRecId) return Utils.setMsg('opMsg', 'Nenhuma solicitação selecionada.', true);
    Utils.setMsg('opMsg', 'Registrando recebimento…');
    try {
      const { error } = await sb.from('internal_opinions').update({ received_at }).eq('id', currentOpiniaoRecId);
      if (error) throw error;
      Utils.setMsg('opMsg', 'Recebimento registrado.');
      cancelarRecOpiniao();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('opMsg', e.message || String(e), true);
    }
  }

  async function finalizarOpiniao() {
    const t = el('opFinInput').value;
    const finalized_at = t ? new Date(t).toISOString() : new Date().toISOString();
    if (!currentOpiniaoRecId) return Utils.setMsg('opMsg', 'Nenhuma solicitação selecionada.', true);
    Utils.setMsg('opMsg', 'Finalizando…');
    try {
      const { error } = await sb.from('internal_opinions').update({ status: 'FINALIZADO', finalized_at }).eq('id', currentOpiniaoRecId);
      if (error) throw error;
      Utils.setMsg('opMsg', 'Parecer finalizado.');
      cancelarFinOpiniao();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('opMsg', e.message || String(e), true);
    }
  }

  function showFinOpiniaoForm(id) {
    currentOpiniaoRecId = id;
    el('opFinInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('opLista');
    Utils.show('opFinForm');
  }
  function cancelarFinOpiniao() {
    currentOpiniaoRecId = null;
    Utils.hide('opFinForm');
    Utils.show('opLista');
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

      if (!data || !data.length) {
        box.innerHTML = '<div class="msg">Nenhum parecer encontrado.</div>';
        return;
      }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Tipo</th><th>Solicitado</th><th>Recebido</th><th>Finalizado</th><th>Status</th><th>Ações</th></tr>';
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.type}</td>
          <td>${row.requested_at ? Utils.fmtDateTime(row.requested_at) : ''}</td>
          <td>${row.received_at ? Utils.fmtDateTime(row.received_at) : ''}</td>
          <td>${row.finalized_at ? Utils.fmtDateTime(row.finalized_at) : ''}</td>
          <td>${row.status}</td>
          <td>
            <button type="button" data-id="${row.id}" class="recOp">Recebido</button>
            <button type="button" data-id="${row.id}" class="finOp">Finalizar</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.innerHTML = '';
      box.appendChild(table);

      Array.from(box.querySelectorAll('.recOp')).forEach(btn => {
        btn.addEventListener('click', () => {
          showRecebOpiniaoForm(btn.getAttribute('data-id'));
        });
      });
      Array.from(box.querySelectorAll('.finOp')).forEach(btn => {
        btn.addEventListener('click', () => {
          showFinOpiniaoForm(btn.getAttribute('data-id'));
        });
      });
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  // ======== NOTIFICAÇÕES ========
  async function cadastrarNotif() {
    const type = el('ntTipo')?.value;
    const t = el('ntSolic')?.value;
    const requested_at = t ? new Date(t).toISOString() : new Date().toISOString();
    if (!currentProcId) return Utils.setMsg('ntMsg', 'Nenhum processo selecionado.', true);
    Utils.setMsg('ntMsg', 'Cadastrando…');
    try {
      if (!window.getUser) throw new Error('Auth não inicializado.');
      const u = await getUser();
      if (!u) throw new Error('Sessão expirada. Faça login novamente.');

      const payload = { process_id: currentProcId, type, requested_at, created_by: u.id };
      const { error } = await sb.from('notifications').insert(payload);
      if (error) throw error;
      Utils.setMsg('ntMsg', 'Notificação cadastrada.');
      await reloadLists();
    } catch (e) {
      Utils.setMsg('ntMsg', e.message || String(e), true);
    }
  }

  function showNotifLidaForm(id) {
    currentNotifLidaId = id;
    el('ntLidaInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('ntLista');
    Utils.show('ntLidaForm');
  }
  function cancelarNotifLida() {
    currentNotifLidaId = null;
    Utils.hide('ntLidaForm');
    Utils.show('ntLista');
  }

  async function marcarNotifLida() {
    const t = el('ntLidaInput').value;
    const read_at = t ? new Date(t).toISOString() : new Date().toISOString();
    if (!currentNotifLidaId) return Utils.setMsg('ntMsg', 'Nenhuma notificação selecionada.', true);
    Utils.setMsg('ntMsg', 'Marcando como lida…');
    try {
      const { error } = await sb.from('notifications').update({ status: 'LIDA', read_at }).eq('id', currentNotifLidaId);
      if (error) throw error;
      Utils.setMsg('ntMsg', 'Notificação marcada como lida.');
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
        .select('id,type,requested_at,read_at')
        .eq('process_id', processId)
        .order('requested_at', { ascending: false });
      if (error) throw error;

      if (!data || !data.length) {
        box.innerHTML = '<div class="msg">Nenhuma notificação encontrada.</div>';
        return;
      }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Tipo</th><th>Solicitada</th><th>Lida</th><th>Status</th><th>Ações</th></tr>';
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.type}</td>
          <td>${row.requested_at ? Utils.fmtDateTime(row.requested_at) : ''}</td>
          <td>${row.read_at ? Utils.fmtDateTime(row.read_at) : ''}</td>
          <td>${row.read_at ? 'LIDA' : 'SOLICITADA'}</td>
          <td>
            ${row.read_at ? '' : `<button type="button" data-id="${row.id}" class="lidaNt">Marcar Lida</button>`}
          </td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.innerHTML = '';
      box.appendChild(table);

      Array.from(box.querySelectorAll('.lidaNt')).forEach(btn => {
        btn.addEventListener('click', () => {
          showNotifLidaForm(btn.getAttribute('data-id'));
        });
      });
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  // ======== SIGADAER ========
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

      if (!data || !data.length) {
        box.innerHTML = '<div class="msg">Nenhuma solicitação encontrada.</div>';
        return;
      }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Números</th><th>Solicitado</th><th>Expedido</th><th>Recebido</th><th>Status</th><th>Ações</th></tr>';
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.numbers || ''}</td>
          <td>${row.requested_at ? Utils.fmtDateTime(row.requested_at) : ''}</td>
          <td>${row.expedit_at ? Utils.fmtDateTime(row.expedit_at) : ''}</td>
          <td>${row.received_at ? Utils.fmtDateTime(row.received_at) : ''}</td>
          <td>${row.status}</td>
          <td>
            ${row.expedit_at ? '' : `<button type="button" data-id="${row.id}" class="sgExp">Expedido</button>`}
            ${row.received_at ? '' : `<button type="button" data-id="${row.id}" class="sgRec">Recebido</button>`}
          </td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.innerHTML = '';
      box.appendChild(table);

      Array.from(box.querySelectorAll('.sgExp')).forEach(btn => {
        btn.addEventListener('click', () => {
          currentSigExpId = btn.getAttribute('data-id');
          el('sgExpInput').value = Utils.toDateTimeLocalValue(new Date());
          Utils.hide('sgLista');
          Utils.show('sgExpForm');
        });
      });

      Array.from(box.querySelectorAll('.sgRec')).forEach(btn => {
        btn.addEventListener('click', () => {
          showSIGRecForm(btn.getAttribute('data-id'));
        });
      });
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  async function registrarSIGExpedido() {
    const t = el('sgExpInput').value;
    const expedit_at = t ? new Date(t).toISOString() : new Date().toISOString();
    if (!currentSigExpId) return Utils.setMsg('sgMsg', 'Nenhuma solicitação selecionada.', true);
    Utils.setMsg('sgMsg', 'Registrando expedição…');
    try {
      const { error } = await sb.from('sigadaer').update({ status: 'EXPEDIDO', expedit_at }).eq('id', currentSigExpId);
      if (error) throw error;
      Utils.setMsg('sgMsg', 'Expedição registrada.');
      el('sgExpInput').value = '';
      Utils.hide('sgExpForm');
      Utils.show('sgLista');
      await reloadLists();
    } catch (e) {
      Utils.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  function showSIGRecForm(id) {
    currentSigRecId = id;
    el('sgRecInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('sgLista');
    Utils.show('sgRecForm');
  }
  function cancelarSIGRec() {
    currentSigRecId = null;
    Utils.hide('sgRecForm');
    Utils.show('sgLista');
  }

  async function registrarSIGRecebido() {
    const t = el('sgRecInput').value;
    const received_at = t ? new Date(t).toISOString() : new Date().toISOString();
    if (!currentSigRecId) return Utils.setMsg('sgMsg', 'Nenhuma solicitação selecionada.', true);
    Utils.setMsg('sgMsg', 'Registrando recebimento…');
    try {
      const { error } = await sb.from('sigadaer').update({ status: 'RECEBIDO', received_at }).eq('id', currentSigRecId);
      if (error) throw error;
      Utils.setMsg('sgMsg', 'Recebimento registrado.');
      cancelarSIGRec();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  async function reloadLists() {
    if (!currentProcId) return;
    await Promise.all([
      loadOpiniaoList(currentProcId),
      loadNotifList(currentProcId),
      loadSIGList(currentProcId),
    ]);
  }

  function bindEvents() {
    // tabs
    const buttons = Array.from(document.querySelectorAll('[data-tab]'));
    buttons.forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });
    // Abre 'Processo' por padrão já com destaque
    showTab('proc');

    // Processo
    if (el('btnObraConcluida')) el('btnObraConcluida').addEventListener('click', toggleObraConcluida);
    if (el('btnSalvarProc')) el('btnSalvarProc').addEventListener('click', (ev) => { ev.preventDefault(); upsertProcess(); });
    if (el('btnNovoProc')) el('btnNovoProc').addEventListener('click', (ev) => { ev.preventDefault(); clearProcessForm(); });
    bindProcFormTracking();

    // Parecer
    if (el('btnCadOpiniao')) el('btnCadOpiniao').addEventListener('click', (ev) => { ev.preventDefault(); cadastrarOpiniao(); });
    if (el('btnSalvarOpRec')) el('btnSalvarOpRec').addEventListener('click', (ev) => { ev.preventDefault(); registrarRecebOpiniao(); });
    if (el('btnVoltarOpRec')) el('btnVoltarOpRec').addEventListener('click', (ev) => { ev.preventDefault(); cancelarRecOpiniao(); });
    if (el('btnSalvarOpFin')) el('btnSalvarOpFin').addEventListener('click', (ev) => { ev.preventDefault(); finalizarOpiniao(); });
    if (el('btnVoltarOpFin')) el('btnVoltarOpFin').addEventListener('click', (ev) => { ev.preventDefault(); cancelarFinOpiniao(); });

    // Notificação
    if (el('btnCadNotif')) el('btnCadNotif').addEventListener('click', (ev) => { ev.preventDefault(); cadastrarNotif(); });
    if (el('btnSalvarNtLida')) el('btnSalvarNtLida').addEventListener('click', (ev) => { ev.preventDefault(); marcarNotifLida(); });
    if (el('btnVoltarNtLida')) el('btnVoltarNtLida').addEventListener('click', (ev) => { ev.preventDefault(); cancelarNotifLida(); });

    // SIGADAER
    if (el('btnCadSIG')) el('btnCadSIG').addEventListener('click', async (ev) => {
      ev.preventDefault();
      const type = el('sgTipo')?.value;
      const rawNums = el('sgNums')?.value?.trim() || '';
      // Extrai números inteiros do input (ex.: "123/2024; 456/2024" -> [123,2024,456,2024])
      const numbers = rawNums ? (rawNums.match(/\d+/g)?.map(n => parseInt(n, 10)) || null) : null;
      const t = el('sgSolic')?.value;
      const requested_at = t ? new Date(t).toISOString() : new Date().toISOString();
      if (!currentProcId) return Utils.setMsg('sgMsg', 'Nenhum processo selecionado.', true);
      Utils.setMsg('sgMsg', 'Cadastrando…');
      if (!window.getUser) throw new Error('Auth não inicializado.');
      const u = await getUser();
      if (!u) throw new Error('Sessão expirada. Faça login novamente.');
      try {
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
    if (el('btnVoltarSgExp')) el('btnVoltarSgExp').addEventListener('click', (ev) => { ev.preventDefault(); Utils.hide('sgExpForm'); Utils.show('sgLista'); });
    if (el('btnSalvarSgRec')) el('btnSalvarSgRec').addEventListener('click', (ev) => { ev.preventDefault(); registrarSIGRecebido(); });
    if (el('btnVoltarSgRec')) el('btnVoltarSgRec').addEventListener('click', (ev) => { ev.preventDefault(); cancelarSIGRec(); });
  }

  async function init() {
    bindEvents();
    await loadProcessList();
  }

  return { init };
})();
document.addEventListener('DOMContentLoaded', () => {
  if (window.Modules?.processos?.init) window.Modules.processos.init();
});
