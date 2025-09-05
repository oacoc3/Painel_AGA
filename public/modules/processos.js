// public/modules/processos.js
window.Modules = window.Modules || {};
window.Modules.processos = (() => {
  let currentProcId = null;
  let currentNUP = '';
  let currentOpiniaoRecId = null;
  let currentNotifLidaId = null;
  let currentSigExpId = null;
  let currentSigRecId = null;
  function bindTabs() {
    // Abas do cartão esquerdo
    const buttons = $$('.tabs button');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        ['tabProc','tabOpiniao','tabNotif','tabSig'].forEach(id => Utils.hide(id));
        Utils.show('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
        buttons.forEach(b => b.classList.toggle('active', b === btn));
        syncNUP();
      });
    });
    buttons[0]?.classList.add('active');
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
    const statusSinceInput = el('procStatusDate').value;
    const firstEntry = el('procEntrada').value;
    const obraTerm = el('procObraTermino').value || null;
   const obraConcl = el('btnObraConcluida').classList.contains('active');
   const note = el('procObs').value.trim();
    if (!nup || !firstEntry) return Utils.setMsg('procMsg', 'Preencha NUP e Data 1ª entrada.', true);
    Utils.setMsg('procMsg', currentProcId ? 'Atualizando...' : 'Cadastrando...');
    const u = await getUser();
    if (!u) return Utils.setMsg('procMsg', 'Sessão expirada.', true);

    try {
      if (!currentProcId) {
        // Novo
        const payload = {
          nup, type, status,
          obra_termino_date: obraTerm,
          obra_concluida: obraConcl,
          first_entry_date: firstEntry,
          created_by: u.id
        };
        if (statusSinceInput) payload.status_since = new Date(statusSinceInput).toISOString();
        const { data, error } = await sb.from('processes').insert(payload).select('*').single();
        if (error) throw error;
        currentProcId = data.id;
      } else {
        const payload = {
          nup, type, status,
          obra_termino_date: obraTerm,
          obra_concluida: obraConcl,
          first_entry_date: firstEntry
        };
        if (statusSinceInput) payload.status_since = new Date(statusSinceInput).toISOString();
        const { error } = await sb.from('processes').update(payload).eq('id', currentProcId);
        if (error) throw error;
      }
       if (note) {
        await sb.from('audit_log').insert({
          user_id: u.id,
          user_email: u.email,
          action: 'NOTE',
          entity_type: 'process_notes',
          entity_id: currentProcId,
          details: { process_id: currentProcId, note }
        });
        el('procObs').value = '';
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

  async function fetchProcessByNUP(nup) {
    const { data, error } = await sb.from('processes')
      .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida')
      .eq('nup', nup)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

    function clearProcessForm() {
    el('procNUP').value = '';
    el('procTipo').value = '';
    el('procStatus').value = '';
    el('procStatusDate').value = '';
      el('procEntrada').value = '';
    el('procObraTermino').value = '';
    el('procObs').value = '';
      el('btnObraConcluida').classList.remove('active');
    currentProcId = null;
    currentNUP = '';
    syncNUP();
    el('btnSalvarProc').disabled = true;
    Utils.setMsg('procMsg', '');
    el('histProcesso').innerHTML = '<div class="msg">Selecione um processo para ver o histórico.</div>';
    el('opLista').innerHTML = '<div class="msg">Selecione um processo para ver os pareceres.</div>';
    el('ntLista').innerHTML = '<div class="msg">Selecione um processo para ver as notificações.</div>';
    el('sgLista').innerHTML = '<div class="msg">Selecione um processo para ver os SIGADAER.</div>';
    Utils.hide('opRecForm');
    Utils.show('opLista');
    Utils.hide('ntLidaForm');
    Utils.show('ntLista');
    Utils.hide('sgExpForm');
    Utils.hide('sgRecForm');
    Utils.show('sgLista');
      currentOpiniaoRecId = null;
    currentNotifLidaId = null;
    currentSigExpId = null;
    currentSigRecId = null;
    }

  async function deleteProcess() {
    if (!currentProcId) return Utils.setMsg('procMsg', 'Nenhum processo carregado para exclusão.', true);
    if (!confirm('Excluir processo e registros relacionados?')) return;
    Utils.setMsg('procMsg', 'Excluindo processo…');
    try {
      await sb.from('internal_opinions').delete().eq('process_id', currentProcId);
      await sb.from('notifications').delete().eq('process_id', currentProcId);
      await sb.from('sigadaer').delete().eq('process_id', currentProcId);
      const { error } = await sb.from('processes').delete().eq('id', currentProcId);
      if (error) throw error;
      clearProcessForm();
      await reloadLists();
      Utils.setMsg('procMsg', 'Processo excluído.');
    } catch (e) {
      Utils.setMsg('procMsg', e.message || String(e), true);
    }
  }

  function syncNUP() {
    ['opNUP', 'ntNUP', 'sgNUP'].forEach(id => {
      const input = el(id);
      if (input) input.value = currentNUP;
    });
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

  function showRecOpiniaoForm(id) {
    currentOpiniaoRecId = id;
    el('opRecInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('opLista');
    Utils.show('opRecForm');
  }

  function cancelarRecOpiniao() {
    currentOpiniaoRecId = null;
    el('opRecInput').value = '';
    Utils.hide('opRecForm');
    Utils.show('opLista');
  }

  async function receberOpiniao() {
    const id = currentOpiniaoRecId;
    const t = el('opRecInput').value;
    if (!id || !t) return Utils.setMsg('opMsg', 'Informe data/hora de recebimento.', true);
    Utils.setMsg('opMsg', 'Registrando recebimento…');
    try {
      const { error } = await sb.from('internal_opinions').update({
        status: 'RECEBIDO',
        received_at: new Date(t).toISOString()
      }).eq('id', id);
      if (error) throw error;
      Utils.setMsg('opMsg', 'Parecer marcado como RECEBIDO.');
      cancelarRecOpiniao();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('opMsg', e.message || String(e), true);
    }
  }

  async function loadOpiniaoList(processId) {
    const box = el('opLista');
    if (!box) return;
    if (!processId) {
      box.innerHTML = '<div class="msg">Selecione um processo para ver os pareceres.</div>';
      return;
    }
    const { data: ops, error } = await sb.from('internal_opinions')
      .select('id,type,requested_at')
      .eq('process_id', processId)
      .eq('status', 'SOLICITADO')
      .order('requested_at', { ascending: false });
    if (error) { box.innerHTML = '<div class="msg error">' + error.message + '</div>'; return; }
    const { tbody } = Utils.renderTable(box, [
      { key: 'type', label: 'Tipo' },
      { key: 'requested_at', label: 'Solicitado em', value: r => Utils.fmtDateTime(r.requested_at) },
      { key: 'btn', label: '' }
    ], ops);
    tbody?.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      const row = JSON.parse(tr.dataset.row);
      const td = tr.lastElementChild;
      td.textContent = '';
      const btn = document.createElement('button');
      btn.textContent = 'Registrar Recebimento';
      btn.addEventListener('click', () => showRecOpiniaoForm(row.id));
      td.appendChild(btn);
    });
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

  function showNotifLidaForm(id) {
    currentNotifLidaId = id;
    el('ntLidaInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('ntLista');
    Utils.show('ntLidaForm');
  }

  function cancelarNotifLida() {
    currentNotifLidaId = null;
    el('ntLidaInput').value = '';
    Utils.hide('ntLidaForm');
    Utils.show('ntLista');
  }

  async function marcarNotifLida() {
    const id = currentNotifLidaId;
    const t = el('ntLidaInput').value;
    if (!id || !t) return Utils.setMsg('ntMsg', 'Informe data/hora de leitura.', true);
    Utils.setMsg('ntMsg', 'Registrando leitura…');
    try {
      const { error } = await sb.from('notifications').update({
        status: 'LIDA',
        read_at: new Date(t).toISOString()
      }).eq('id', id);
      if (error) throw error; // trigger do banco pode mudar processo para SOB-DOC/SOB-TEC
      Utils.setMsg('ntMsg', 'Notificação marcada como LIDA.');
      cancelarNotifLida();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('ntMsg', e.message || String(e), true);
    }
  }

  async function loadNotifList(processId) {
    const box = el('ntLista');
    if (!box) return;
    if (!processId) {
      box.innerHTML = '<div class="msg">Selecione um processo para ver as notificações.</div>';
      return;
    }
    const { data: nts, error } = await sb.from('notifications')
      .select('id,type,requested_at')
      .eq('process_id', processId)
      .eq('status', 'SOLICITADA')
      .order('requested_at', { ascending: false });
    if (error) { box.innerHTML = '<div class="msg error">' + error.message + '</div>'; return; }
    const { tbody } = Utils.renderTable(box, [
      { key: 'type', label: 'Tipo' },
      { key: 'requested_at', label: 'Solicitada em', value: r => Utils.fmtDateTime(r.requested_at) },
      { key: 'btn', label: '' }
    ], nts);
    tbody?.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      const row = JSON.parse(tr.dataset.row);
      const td = tr.lastElementChild;
      td.textContent = '';
      const btn = document.createElement('button');
      btn.textContent = 'Registrar Leitura';
      btn.addEventListener('click', () => showNotifLidaForm(row.id));
      td.appendChild(btn);
    });
  }

  // —— SIGADAER ——
  function parseSigNumber(s) {
    if (!s) return null;
    const v = s.trim();
    if (!/^\d{6}$/.test(v)) throw new Error('Informe um número de 6 dígitos.');
    return Number(v);
  }

  async function cadastrarSig() {
    const nup = el('sgNUP').value.trim();
    const type = el('sgTipo').value;
    const t = el('sgSolic').value;
    const requested_at = t ? new Date(t).toISOString() : new Date().toISOString();
    const numberInput = el('sgNum').value;
    Utils.setMsg('sgMsg', 'Cadastrando SIGADAER…');
    try {
      const pid = await findProcessByNUP(nup);
      if (!pid) throw new Error('Processo não encontrado para o NUP informado.');
      const u = await getUser();
      const num = parseSigNumber(numberInput);
      if (num !== null) {
        const { data: exists, error: errChk } = await sb.from('sigadaer')
          .select('id').contains('numbers', [num]).maybeSingle();
        if (errChk) throw errChk;
        if (exists) throw new Error('Nº SIGADAER já cadastrado.');
      }
      const payload = {
        process_id: pid, type, requested_at, created_by: u.id,
        numbers: num !== null ? [num] : null
      };
      const { error } = await sb.from('sigadaer').insert(payload);
      if (error) throw error;
      Utils.setMsg('sgMsg', 'SIGADAER cadastrado (status SOLICITADO).');
      await reloadLists();
    } catch (e) {
      Utils.setMsg('sgMsg', e.message || String(e), true);
    }
  }
  function showSigExpForm(id) {
    currentSigExpId = id;
    el('sgExpInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('sgLista');
    Utils.hide('sgRecForm');
    Utils.show('sgExpForm');
  }

  function cancelarSigExp() {
    currentSigExpId = null;
    el('sgExpInput').value = '';
    Utils.hide('sgExpForm');
    Utils.show('sgLista');
  }
  async function expedirSig() {
    const id = currentSigExpId;
    const t = el('sgExpInput').value;
    if (!id || !t) return Utils.setMsg('sgMsg', 'Informe data/hora de expedição.', true);
    Utils.setMsg('sgMsg', 'Registrando expedição…');
    try {
      const { error } = await sb.from('sigadaer').update({
        status: 'EXPEDIDO',
        expedit_at: new Date(t).toISOString()
      }).eq('id', id);
      if (error) throw error;
      Utils.setMsg('sgMsg', 'SIGADAER marcado como EXPEDIDO.');
      cancelarSigExp();
      await reloadLists();
    } catch (e) { Utils.setMsg('sgMsg', e.message || String(e), true); }
  }

  function showSigRecForm(id) {
    currentSigRecId = id;
    el('sgRecInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('sgLista');
    Utils.hide('sgExpForm');
    Utils.show('sgRecForm');
  }

  function cancelarSigRec() {
    currentSigRecId = null;
    el('sgRecInput').value = '';
    Utils.hide('sgRecForm');
    Utils.show('sgLista');
  }

  async function receberSig() {
    const id = currentSigRecId;
    const t = el('sgRecInput').value;
    if (!id || !t) return Utils.setMsg('sgMsg', 'Informe data/hora de recebimento.', true);
    Utils.setMsg('sgMsg', 'Registrando recebimento…');
    try {
      const { error } = await sb.from('sigadaer').update({
        status: 'RECEBIDO',
        received_at: new Date(t).toISOString()
      }).eq('id', id);
      if (error) throw error; // trigger impede RECEBIDO se não EXPEDIDO
      Utils.setMsg('sgMsg', 'SIGADAER marcado como RECEBIDO.');
      cancelarSigRec();
      await reloadLists();
    } catch (e) { Utils.setMsg('sgMsg', e.message || String(e), true); }
  }

  async function loadSigList(processId) {
    const box = el('sgLista');
    if (!box) return;
    if (!processId) {
      box.innerHTML = '<div class="msg">Selecione um processo para ver os SIGADAER.</div>';
      return;
    }
    const { data: sigs, error } = await sb.from('sigadaer')
      .select('id,type,requested_at,status')
      .eq('process_id', processId)
      .neq('status', 'RECEBIDO')
      .order('requested_at', { ascending: false });
    if (error) { box.innerHTML = '<div class="msg error">' + error.message + '</div>'; return; }
    const { tbody } = Utils.renderTable(box, [
      { key: 'type', label: 'Tipo' },
      { key: 'requested_at', label: 'Solicitado em', value: r => Utils.fmtDateTime(r.requested_at) },
      { key: 'status', label: 'Status' },
      { key: 'btns', label: '' }
    ], sigs);
    tbody?.querySelectorAll('tr').forEach(tr => {
      if (!tr.dataset.row) return;
      const row = JSON.parse(tr.dataset.row);
      const td = tr.lastElementChild;
      td.textContent = '';
      const btnExp = document.createElement('button');
      btnExp.textContent = 'Registrar Expedição';
      btnExp.disabled = row.status !== 'SOLICITADO';
      btnExp.addEventListener('click', () => showSigExpForm(row.id));
      td.appendChild(btnExp);
      const btnRec = document.createElement('button');
      btnRec.textContent = 'Registrar Recebimento';
      btnRec.disabled = row.status !== 'EXPEDIDO';
      btnRec.addEventListener('click', () => showSigRecForm(row.id));
      td.appendChild(btnRec);
    });
  }

  // —— Listas e histórico ——
  async function loadProcessList() {
    const { data: procs, error } = await sb.from('processes')
      .select('id,nup,type,status,status_since,first_entry_date')
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
      const tr = ev.target.closest('tr'); if (!tr || !tr.dataset.row) return;
      const row = JSON.parse(tr.dataset.row);
      fillProcessForm(row);
      loadHistory(row.id);
      loadOpiniaoList(row.id);
      loadNotifList(row.id);
      loadSigList(row.id);
    });
  }

  function fillProcessForm(p) {
    currentProcId = p.id;
    el('procNUP').value = p.nup;
    el('procTipo').value = p.type;
    el('procStatus').value = p.status;
    el('procStatusDate').value = Utils.toDateTimeLocalValue(p.status_since);
    el('procEntrada').value = toDateInputValue(p.first_entry_date);
    if ('obra_termino_date' in p) el('procObraTermino').value = toDateInputValue(p.obra_termino_date);
    if ('obra_concluida' in p) el('btnObraConcluida').classList.toggle('active', !!p.obra_concluida);
    el('procObs').value = '';
    el('btnSalvarProc').disabled = true;
    currentNUP = p.nup;
    syncNUP();
    Utils.setMsg('procMsg', `Carregado processo ${p.nup}.`);
  }


  function describeHistoryAction(r, prev) {
    const d = r.details || {};
    switch (r.entity_type) {
      case 'processes': {
        if (r.action === 'INSERT') return 'Processo criado';
        const changes = [];
        if (prev && d.status !== prev.status) {
          const dt = d.status_since ? ` em ${Utils.fmtDateTime(d.status_since)}` : '';
          changes.push(`status ${prev.status || ''}→${d.status}${dt}`);
        }
        if (prev && d.type !== prev.type) changes.push(`tipo ${prev.type || ''}→${d.type}`);
        if (prev && d.nup !== prev.nup) changes.push(`NUP ${prev.nup || ''}→${d.nup}`);
        if (prev && d.obra_concluida !== prev.obra_concluida)
          changes.push(`obra concluída ${prev.obra_concluida ? 'sim' : 'não'}→${d.obra_concluida ? 'sim' : 'não'}`);
        if (prev && d.obra_termino_date !== prev.obra_termino_date)
          changes.push(`término da obra ${Utils.fmtDate(prev.obra_termino_date)}→${Utils.fmtDate(d.obra_termino_date)}`);
        return changes.length ? 'Processo ' + changes.join(', ') : 'Processo atualizado';
      }
      case 'internal_opinions': {
        const t = d.type || '';
        if (r.action === 'INSERT') {
          const dt = d.requested_at ? ` em ${Utils.fmtDateTime(d.requested_at)}` : '';
          return `${t} solicitado${dt}`;
        }
        if (prev && d.status !== prev.status && d.status === 'RECEBIDO') {
          const dt = d.received_at ? ` em ${Utils.fmtDateTime(d.received_at)}` : '';
          return `${t} recebido${dt}`;
        }
        return `${t} atualizado`;
      }
      case 'notifications': {
        const t = d.type || '';
        if (r.action === 'INSERT') {
          const dt = d.requested_at ? ` em ${Utils.fmtDateTime(d.requested_at)}` : '';
          return `${t} solicitada${dt}`;
        }
        if (prev && d.status !== prev.status && d.status === 'LIDA') {
          const dt = d.read_at ? ` em ${Utils.fmtDateTime(d.read_at)}` : '';
          return `${t} lida${dt}`;
        }
        return `${t} atualizada`;
      }
      case 'sigadaer': {
        const nums = Array.isArray(d.numbers) ? d.numbers.join(',') : '';
        const label = nums ? `SIGADAER ${nums}` : 'SIGADAER';
        const type = d.type ? ` (${d.type})` : '';
        if (r.action === 'INSERT') {
          const dt = d.requested_at ? ` em ${Utils.fmtDateTime(d.requested_at)}` : '';
          return `${label}${type} solicitado${dt}`;
        }
        if (prev && d.status !== prev.status) {
          if (d.status === 'EXPEDIDO') {
            const dt = d.expedit_at ? ` em ${Utils.fmtDateTime(d.expedit_at)}` : '';
           return `${label}${type} expedido${dt}`;
          }
          if (d.status === 'RECEBIDO') {
            const dt = d.received_at ? ` em ${Utils.fmtDateTime(d.received_at)}` : '';
            return `${label}${type} recebido${dt}`;
          }
        }
        return `${label}${type} atualizado`;
      }
      case 'process_notes': {
        return d.note ? `Observação: ${d.note}` : 'Observação';
      }
      default:
        return `${r.entity_type} ${r.action}`;
    }
  }

  async function loadHistory(processId) {
    // Junta auditorias de diferentes entidades relacionadas ao processo
    const list = [];

    const push = (arr) => arr?.forEach(x => list.push(x));
    const cols = 'occurred_at,user_id,user_email,action,entity_type,entity_id,details';
    const { data: a1 } = await sb.from('audit_log')
      .select(cols)
      .eq('entity_type','processes').eq('entity_id', processId);
    push(a1);

    const { data: a2 } = await sb.from('audit_log')
      .select(cols)
      .eq('entity_type','internal_opinions')
      .filter('details->>process_id','eq', processId);
    push(a2);

    const { data: a3 } = await sb.from('audit_log')
      .select(cols)
      .eq('entity_type','notifications')
      .filter('details->>process_id','eq', processId);
    push(a3);

    const { data: a4 } = await sb.from('audit_log')
      .select(cols)
      .eq('entity_type','sigadaer')
      .filter('details->>process_id','eq', processId);
    push(a4);

    const { data: a5 } = await sb.from('audit_log')
      .select(cols)
      .eq('entity_type','process_notes')
      .filter('details->>process_id','eq', processId);
    push(a5);

    // Descrição das ações e nomes dos usuários
    list.sort((a,b) => new Date(a.occurred_at) - new Date(b.occurred_at));
    const prevMap = {};
    list.forEach(r => {
      const key = `${r.entity_type}:${r.entity_id || ''}`;
      r.description = describeHistoryAction(r, prevMap[key]);
      prevMap[key] = r.details;
    });

    const userIds = Array.from(new Set(list.map(r => r.user_id).filter(Boolean)));
    const nameMap = {};
    if (userIds.length) {
      const { data: names } = await sb.from('profiles').select('id,name').in('id', userIds);
      names?.forEach(n => { nameMap[n.id] = n.name; });
    }
    list.forEach(r => { r.user_name = nameMap[r.user_id] || r.user_email || r.user_id || ''; });

    list.sort((a,b) => new Date(b.occurred_at) - new Date(a.occurred_at));

    Utils.renderTable('histProcesso', [
      { key: 'occurred_at', label: 'Data/Hora', value: r => Utils.fmtDateTime(r.occurred_at) },
      { key: 'user_name', label: 'Usuário' },
      { key: 'description', label: 'Ação' }
    ], list);
  }

  async function reloadLists() {
    await loadProcessList();
    await loadHistory(currentProcId || '');
    await loadOpiniaoList(currentProcId || '');
    await loadNotifList(currentProcId || '');
    await loadSigList(currentProcId || '');
  }

  function bindForms() {
    el('btnObraConcluida').addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.target.classList.toggle('active');
      el('btnSalvarProc').disabled = false;
    });
    el('btnSalvarProc').addEventListener('click', (ev) => { ev.preventDefault(); upsertProcess(); });
    el('btnExcluirProc').addEventListener('click', (ev) => { ev.preventDefault(); deleteProcess(); });
    el('btnLimparProc').addEventListener('click', (ev) => { ev.preventDefault(); clearProcessForm(); });
    // Opiniao
    el('btnCadOpiniao').addEventListener('click', (ev) => { ev.preventDefault(); cadastrarOpiniao(); });
    el('btnSalvarOpRec').addEventListener('click', (ev) => { ev.preventDefault(); receberOpiniao(); });
    el('btnVoltarOpRec').addEventListener('click', (ev) => { ev.preventDefault(); cancelarRecOpiniao(); });
    // Notificação
    el('btnCadNotif').addEventListener('click', (ev) => { ev.preventDefault(); cadastrarNotif(); });
    el('btnSalvarNtLida').addEventListener('click', (ev) => { ev.preventDefault(); marcarNotifLida(); });
    el('btnVoltarNtLida').addEventListener('click', (ev) => { ev.preventDefault(); cancelarNotifLida(); });
    // SIGADAER
    el('btnCadSig').addEventListener('click', (ev) => { ev.preventDefault(); cadastrarSig(); });
    el('btnSalvarSgExp').addEventListener('click', (ev) => { ev.preventDefault(); expedirSig(); });
    el('btnVoltarSgExp').addEventListener('click', (ev) => { ev.preventDefault(); cancelarSigExp(); });
    el('btnSalvarSgRec').addEventListener('click', (ev) => { ev.preventDefault(); receberSig(); });
    el('btnVoltarSgRec').addEventListener('click', (ev) => { ev.preventDefault(); cancelarSigRec(); });

    const procNUP = el('procNUP');
    const handleNUP = async () => {
      currentNUP = procNUP.value.trim();
      syncNUP();
      if (!currentNUP) return;
      try {
        const data = await fetchProcessByNUP(currentNUP);
        if (data) {
          fillProcessForm(data);
          await loadHistory(data.id);
          await loadOpiniaoList(data.id);
          await loadNotifList(data.id);
          await loadSigList(data.id);
        } else {
          currentProcId = null;
          el('procTipo').value = '';
          el('procStatus').value = '';
          el('procStatusDate').value = '';
          el('procEntrada').value = '';
          el('procObraTermino').value = '';
          el('btnObraConcluida').classList.remove('active');
          Utils.setMsg('procMsg', 'Processo não encontrado.');
        }
      } catch (e) {
        Utils.setMsg('procMsg', e.message || String(e), true);
      }
    };
    procNUP.addEventListener('input', () => {
      currentNUP = procNUP.value.trim();
      syncNUP();
      if (currentNUP.length === 20) handleNUP();
    });
    procNUP.addEventListener('blur', handleNUP);
  }

  function init() {
    bindTabs();
    bindForms();
    enableDirtyTracking();
      currentNUP = el('procNUP').value.trim();
    syncNUP();
  }

  async function load() {
    await loadProcessList();
    el('histProcesso').innerHTML = '<div class="msg">Selecione um processo para ver o histórico.</div>';
    el('opLista').innerHTML = '<div class="msg">Selecione um processo para ver os pareceres.</div>';
    el('ntLista').innerHTML = '<div class="msg">Selecione um processo para ver as notificações.</div>';
    el('sgLista').innerHTML = '<div class="msg">Selecione um processo para ver os SIGADAER.</div>';
  }

  return { init, load };
})();
