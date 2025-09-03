window.Modules = window.Modules || {};
window.Modules.processos = (() => {
  let currentProcId = null;

  function bindTabs() {
    // Abas do cartão esquerdo
    $$('.tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        ['tabProc','tabOpiniao','tabNotif','tabSig'].forEach(id => Utils.hide(id));
        Utils.show('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
      });
    });
  }

  function enableDirtyTracking() {
    const form = el('formProc');
    if (!form) return;
    form.addEventListener('input', () => {
      el('btnSalvarProc').disabled = false;
    });
  }

  async function upsertProcess() {
    const nup = el('procNUP').value.trim();
    const type = el('procTipo').value;
    const status = el('procStatus').value;
    const firstEntry = el('procEntrada').value;
    const obraTerm = el('procObraTermino').value || null;
    const obraConcl = el('procObraConcluida').checked;

    if (!nup || !firstEntry) return Utils.setMsg('procMsg', 'Preencha NUP e Data 1ª entrada.', true);
    Utils.setMsg('procMsg', currentProcId ? 'Atualizando...' : 'Cadastrando...');
    const u = await getUser();
    if (!u) return Utils.setMsg('procMsg', 'Sessão expirada.', true);

    try {
      if (!currentProcId) {
        // Novo
        const { data, error } = await sb.from('processes').insert({
          nup, type, status,
          obra_termino_date: obraTerm,
          obra_concluida: obraConcl,
          first_entry_date: firstEntry,
          created_by: u.id
        }).select('*').single();
        if (error) throw error;
        currentProcId = data.id;
      } else {
        const { error } = await sb.from('processes').update({
          nup, type, status,
          obra_termino_date: obraTerm,
          obra_concluida: obraConcl,
          first_entry_date: firstEntry
        }).eq('id', currentProcId);
        if (error) throw error;
      }
      Utils.setMsg('procMsg', 'Salvo com sucesso.');
      el('btnSalvarProc').disabled = true;
      await reloadLists();
    } catch (e) {
      Utils.setMsg('procMsg', e.message || String(e), true);
    }
  }

  async function findProcessByNUP(nup) {
    const { data, error } = await sb.from('processes').select('id').eq('nup', nup).maybeSingle();
    if (error) throw error;
    return data?.id || null;
  }

  // —— Parecer interno ——
  async function cadastrarOpiniao() {
    const nup = el('opNUP').value.trim();
    const type = el('opTipo').value;
    const t = el('opSolic').value;
    const requested_at = t ? new Date(t).toISOString() : new Date().toISOString();
    Utils.setMsg('opMsg', 'Cadastrando parecer…');
    try {
      const pid = await findProcessByNUP(nup);
      if (!pid) throw new Error('Processo não encontrado para o NUP informado.');
      const u = await getUser();
      const { error } = await sb.from('internal_opinions').insert({
        process_id: pid, type, requested_at, created_by: u.id
      });
      if (error) throw error; // triggers validam status do processo e unicidade SOLICITADO
      Utils.setMsg('opMsg', 'Parecer cadastrado (status SOLICITADO).');
      await reloadLists();
    } catch (e) {
      Utils.setMsg('opMsg', e.message || String(e), true);
    }
  }

  async function receberOpiniao() {
    const id = el('opIDRec').value.trim();
    const t = el('opRec').value;
    if (!id || !t) return Utils.setMsg('opMsg', 'Informe ID do parecer e data/hora de recebimento.', true);
    Utils.setMsg('opMsg', 'Registrando recebimento…');
    try {
      const { error } = await sb.from('internal_opinions').update({
        status: 'RECEBIDO',
        received_at: new Date(t).toISOString()
      }).eq('id', id);
      if (error) throw error;
      Utils.setMsg('opMsg', 'Parecer marcado como RECEBIDO.');
      await reloadLists();
    } catch (e) {
      Utils.setMsg('opMsg', e.message || String(e), true);
    }
  }

  // —— Notificação ——
  async function cadastrarNotif() {
    const nup = el('ntNUP').value.trim();
    const type = el('ntTipo').value;
    const t = el('ntSolic').value;
    const requested_at = t ? new Date(t).toISOString() : new Date().toISOString();
    Utils.setMsg('ntMsg', 'Cadastrando notificação…');
    try {
      const pid = await findProcessByNUP(nup);
      if (!pid) throw new Error('Processo não encontrado para o NUP informado.');
      const u = await getUser();
      const { error } = await sb.from('notifications').insert({
        process_id: pid, type, requested_at, created_by: u.id
      });
      if (error) throw error;
      Utils.setMsg('ntMsg', 'Notificação cadastrada (status SOLICITADA).');
      await reloadLists();
    } catch (e) {
      Utils.setMsg('ntMsg', e.message || String(e), true);
    }
  }

  async function marcarNotifLida() {
    const id = el('ntIDLida').value.trim();
    const t = el('ntLidaEm').value;
    if (!id || !t) return Utils.setMsg('ntMsg', 'Informe ID da notificação e data/hora de leitura.', true);
    Utils.setMsg('ntMsg', 'Registrando leitura…');
    try {
      const { error } = await sb.from('notifications').update({
        status: 'LIDA',
        read_at: new Date(t).toISOString()
      }).eq('id', id);
      if (error) throw error; // trigger do banco pode mudar processo para SOB-DOC/SOB-TEC
      Utils.setMsg('ntMsg', 'Notificação marcada como LIDA.');
      await reloadLists();
    } catch (e) {
      Utils.setMsg('ntMsg', e.message || String(e), true);
    }
  }

  // —— SIGADAER ——
  function parseSixDigitsList(s) {
    if (!s) return null;
    const arr = s.split(',').map(x => x.trim()).filter(Boolean);
    if (!arr.length) return null;
    const nums = [];
    for (const a of arr) {
      if (!/^\d{6}$/.test(a)) throw new Error(`Número inválido: ${a} (use 6 dígitos)`);
      nums.push(Number(a));
    }
    return nums;
  }

  async function cadastrarSig() {
    const nup = el('sgNUP').value.trim();
    const type = el('sgTipo').value;
    const t = el('sgSolic').value;
    const requested_at = t ? new Date(t).toISOString() : new Date().toISOString();
    const numbers = el('sgNums').value;
    const notes = el('sgObs').value;
    Utils.setMsg('sgMsg', 'Cadastrando SIGADAER…');
    try {
      const pid = await findProcessByNUP(nup);
      if (!pid) throw new Error('Processo não encontrado para o NUP informado.');
      const u = await getUser();
      const payload = {
        process_id: pid, type, requested_at, notes, created_by: u.id
      };
      const nums = parseSixDigitsList(numbers);
      if (nums) payload.numbers = nums;
      const { error } = await sb.from('sigadaer').insert(payload);
      if (error) throw error;
      Utils.setMsg('sgMsg', 'SIGADAER cadastrado (status SOLICITADO).');
      await reloadLists();
    } catch (e) {
      Utils.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  async function expedirSig() {
    const id = el('sgIDExp').value.trim();
    const t = el('sgExpEm').value;
    if (!id || !t) return Utils.setMsg('sgMsg', 'Informe ID e data/hora de expedição.', true);
    Utils.setMsg('sgMsg', 'Registrando expedição…');
    try {
      const { error } = await sb.from('sigadaer').update({
        status: 'EXPEDIDO',
        expedit_at: new Date(t).toISOString()
      }).eq('id', id);
      if (error) throw error;
      Utils.setMsg('sgMsg', 'SIGADAER marcado como EXPEDIDO.');
      await reloadLists();
    } catch (e) { Utils.setMsg('sgMsg', e.message || String(e), true); }
  }

  async function receberSig() {
    const id = el('sgIDRec').value.trim();
    const t = el('sgRecEm').value;
    if (!id || !t) return Utils.setMsg('sgMsg', 'Informe ID e data/hora de recebimento.', true);
    Utils.setMsg('sgMsg', 'Registrando recebimento…');
    try {
      const { error } = await sb.from('sigadaer').update({
        status: 'RECEBIDO',
        received_at: new Date(t).toISOString()
      }).eq('id', id);
      if (error) throw error; // trigger impede RECEBIDO se não EXPEDIDO
      Utils.setMsg('sgMsg', 'SIGADAER marcado como RECEBIDO.');
      await reloadLists();
    } catch (e) { Utils.setMsg('sgMsg', e.message || String(e), true); }
  }

  // —— Listas e histórico ——
  async function loadProcessList() {
    const { data: procs, error } = await sb.from('processes')
      .select('id,nup,type,status,first_entry_date')
      .order('first_entry_date', { ascending: false });
    if (error) { Utils.setMsg('procMsg', error.message, true); return; }

    const ids = procs.map(p => p.id);
    let pendingOp = {}, pendingNt = {}, expSig = {}, adDone = {};
    if (ids.length) {
      // Pareceres pendentes
      const { data: ops } = await sb.from('internal_opinions')
        .select('process_id').in('process_id', ids).eq('status','SOLICITADO');
      ops?.forEach(o => { pendingOp[o.process_id] = true; });
      // Notificações pendentes
      const { data: nts } = await sb.from('notifications')
        .select('process_id').in('process_id', ids).eq('status','SOLICITADA');
      nts?.forEach(n => { pendingNt[n.process_id] = true; });
      // SIGADAER expedidos
      const { data: sig } = await sb.from('sigadaer')
        .select('process_id').in('process_id', ids).eq('status','EXPEDIDO');
      sig?.forEach(s => { expSig[s.process_id] = true; });
      // Checklists concluídas
      const { data: ad } = await sb.from('checklist_responses')
        .select('process_id').in('process_id', ids);
      ad?.forEach(a => { adDone[a.process_id] = true; });
    }

    const rows = procs.map(p => ({
      ...p,
      tempo: `${Utils.daysBetween(p.first_entry_date)} d`,
      op: Utils.yesNo(pendingOp[p.id]),
      nt: Utils.yesNo(pendingNt[p.id]),
      sg: Utils.yesNo(expSig[p.id]),
      ad: Utils.yesNo(adDone[p.id])
    }));

    const { tbody } = Utils.renderTable('listaProcessos', [
      { key: 'nup', label: 'NUP' },
      { key: 'type', label: 'Tipo' },
      { key: 'status', label: 'Status' },
      { key: 'first_entry_date', label: '1ª entrada', value: r => Utils.fmtDate(r.first_entry_date) },
      { key: 'tempo', label: 'Tempo decorrido' },
      { key: 'op', label: 'Parecer pend.' },
      { key: 'nt', label: 'Notif. pend.' },
      { key: 'sg', label: 'SIG exped.' },
      { key: 'ad', label: 'Checklist AD' }
    ], rows);

    // Click → carrega no formulário e histórico
    tbody?.addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr'); if (!tr) return;
      const row = JSON.parse(tr.dataset.row);
      fillProcessForm(row);
      loadHistory(row.id);
    });
  }

  function fillProcessForm(p) {
    currentProcId = p.id;
    el('procNUP').value = p.nup;
    el('procTipo').value = p.type;
    el('procStatus').value = p.status;
    el('procEntrada').value = toDateInputValue(p.first_entry_date);
    // Campos de obra são preenchidos só ao buscar individualmente (opcional)
    el('btnSalvarProc').disabled = true;
    Utils.setMsg('procMsg', `Carregado processo ${p.nup}.`);
  }

  async function loadHistory(processId) {
    // Junta auditorias de diferentes entidades relacionadas ao processo
    const list = [];

    const push = (arr) => arr?.forEach(x => list.push(x));

    const { data: a1 } = await sb.from('audit_log')
      .select('occurred_at,user_email,action,entity_type,entity_id')
      .eq('entity_type','processes').eq('entity_id', processId);
    push(a1);

    const { data: a2 } = await sb.from('audit_log')
      .select('occurred_at,user_email,action,entity_type,details')
      .eq('entity_type','internal_opinions')
      .filter('details->>process_id','eq', processId);
    push(a2);

    const { data: a3 } = await sb.from('audit_log')
      .select('occurred_at,user_email,action,entity_type,details')
      .eq('entity_type','notifications')
      .filter('details->>process_id','eq', processId);
    push(a3);

    const { data: a4 } = await sb.from('audit_log')
      .select('occurred_at,user_email,action,entity_type,details')
      .eq('entity_type','sigadaer')
      .filter('details->>process_id','eq', processId);
    push(a4);

    list.sort((a,b) => new Date(b.occurred_at) - new Date(a.occurred_at));

    Utils.renderTable('histProcesso', [
      { key: 'occurred_at', label: 'Data/Hora', value: r => Utils.fmtDateTime(r.occurred_at) },
      { key: 'user_email', label: 'Usuário' },
      { key: 'entity_type', label: 'Entidade' },
      { key: 'action', label: 'Ação' }
    ], list);
  }

  async function reloadLists() {
    await loadProcessList();
    await loadHistory(currentProcId || '');
  }

  function bindForms() {
    el('btnSalvarProc').addEventListener('click', (ev) => { ev.preventDefault(); upsertProcess(); });
    // Opiniao
    el('btnCadOpiniao').addEventListener('click', (ev) => { ev.preventDefault(); cadastrarOpiniao(); });
    el('btnRecOpiniao').addEventListener('click', (ev) => { ev.preventDefault(); receberOpiniao(); });
    // Notificação
    el('btnCadNotif').addEventListener('click', (ev) => { ev.preventDefault(); cadastrarNotif(); });
    el('btnMarcarLida').addEventListener('click', (ev) => { ev.preventDefault(); marcarNotifLida(); });
    // SIGADAER
    el('btnCadSig').addEventListener('click', (ev) => { ev.preventDefault(); cadastrarSig(); });
    el('btnExpSig').addEventListener('click', (ev) => { ev.preventDefault(); expedirSig(); });
    el('btnRecSig').addEventListener('click', (ev) => { ev.preventDefault(); receberSig(); });
  }

  function init() {
    bindTabs();
    bindForms();
    enableDirtyTracking();
  }

  async function load() {
    await loadProcessList();
    el('histProcesso').innerHTML = '<div class="msg">Selecione um processo para ver o histórico.</div>';
  }

  return { init, load };
})();
