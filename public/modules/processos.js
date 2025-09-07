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
        const targetId = ({proc:'tabProc',opiniao:'tabOpiniao',notif:'tabNotif',sig:'tabSig'})[tab] || tab;
        Utils.show(targetId);
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    const first = buttons[0];
    if (first) first.click();
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
      if (!window.getUser) throw new Error('Cliente Supabase indisponível.');
      const u = await getUser();
      if (!u) throw new Error('Sessão expirada.');

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
        const { data, error } = await sb.from('processes').insert(payload).select('id').maybeSingle();
        if (error) throw error;
        currentProcId = data?.id || null;
        currentNUP = nup;
        syncNUP();
        Utils.setMsg('procMsg', 'Processo cadastrado.');
      } else {
        // Atualização
        const payload = {
          type, status,
          obra_termino_date: obraTerm,
          obra_concluida: obraConcl,
          first_entry_date: firstEntry
        };
        if (statusSinceInput) payload.status_since = new Date(statusSinceInput).toISOString();
        const { error } = await sb.from('processes').update(payload).eq('id', currentProcId);
        if (error) throw error;
        Utils.setMsg('procMsg', 'Processo atualizado.');
      }
      el('btnSalvarProc').disabled = true;
      await reloadLists();
      await loadHistory(currentProcId);
    } catch (e) {
      Utils.setMsg('procMsg', e.message || String(e), true);
    }
  }

  async function deleteProcess() {
    if (!currentProcId) return Utils.setMsg('procMsg', 'Nenhum processo selecionado.', true);
    if (!confirm('Excluir este processo?')) return;
    try {
      const { error } = await sb.from('processes').delete().eq('id', currentProcId);
      if (error) throw error;
      Utils.setMsg('procMsg', 'Processo excluído.');
      clearProcessForm();
      await reloadLists();
      el('histProcesso').innerHTML = '<div class="msg">Nenhum evento de histórico.</div>';
    } catch (e) {
      Utils.setMsg('procMsg', e.message || String(e), true);
    }
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
  }

  function toggleObraConcluida() {
    el('btnObraConcluida').classList.toggle('active');
  }

  function syncNUP() {
    setText('opNUP', currentNUP);
    const _nt = el('ntNUP'); if (_nt) _nt.value = currentNUP;
    const _sg = el('sgNUP'); if (_sg) _sg.textContent = currentNUP;
  }

  async function getProcessIdByNUP(nup) {
    const { data, error } = await sb
      .from('processes')
      .select('id')
      .eq('nup', nup)
      .maybeSingle();
    if (error) throw error;
    return data?.id || null;
  }

  async function fetchProcessByNUP(nup) {
    const { data, error } = await sb
      .from('processes')
      .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida')
      .eq('nup', nup)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  // ======== HISTÓRICO (formatação legível) ========
  function describeHistoryItem(item) {
    const ts = item.created_at ? Utils.fmtDateTime(new Date(item.created_at)) : '';
    const who = item.user_email || item.user_id || '';
    const act = (item.action || '').toUpperCase();

    // details pode vir como string ou objeto
    let d = item.details;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch { /* deixa como está */ }
    }
    d = d || {};

    // Heurísticas para identificar a origem do registro
    const isProcess   = 'nup' in d && 'type' in d && 'status' in d;
    const isOpinion   = 'requested_at' in d && 'type' in d && ('received_at' in d || 'finalized_at' in d || (d.status && !('read_at' in d)));
    const isNotif     = 'requested_at' in d && 'type' in d && ('read_at' in d) && !('numbers' in d);
    const isSIG       = ('numbers' in d) || ('expedit_at' in d) || (d.status && d.status === 'EXPEDIDA');

    function bit(v, label, fmt='auto') {
      if (v === null || v === undefined || v === '') return null;
      if (fmt === 'date') return `${label}: ${Utils.fmtDate(v)}`;
      if (fmt === 'datetime') return `${label}: ${Utils.fmtDateTime(v)}`;
      if (fmt === 'yesno') return `${label}: ${Utils.yesNo(v)}`;
      return `${label}: ${v}`;
    }

    let resumo = '';
    if (isProcess) {
      const partes = [];
      if (d.nup) partes.push(`NUP ${d.nup}`);
      if (d.type) partes.push(String(d.type));
      if (d.status) {
        const ss = d.status_since ? ` (desde ${Utils.fmtDateTime(d.status_since)})` : '';
        partes.push(`status ${d.status}${ss}`);
      }
      partes.push(...[
        bit(d.first_entry_date, '1ª entrada', 'date'),
        bit(d.obra_termino_date, 'Término da obra', 'date'),
        (typeof d.obra_concluida === 'boolean') ? bit(d.obra_concluida, 'Obra concluída', 'yesno') : null
      ].filter(Boolean));
      resumo = partes.join(' · ');
    } else if (isOpinion) {
      const estado = d.finalized_at ? 'FINALIZADO'
                   : d.received_at  ? 'RECEBIDO'
                   : d.status       ? String(d.status)
                   : 'SOLICITADO';
      const quando = d.finalized_at || d.received_at || d.requested_at;
      const partes = [];
      if (d.type) partes.push(`Parecer ${d.type}`);
      partes.push(estado + (quando ? ` em ${Utils.fmtDateTime(quando)}` : ''));
      resumo = partes.join(' — ');
    } else if (isNotif) {
      const estado = d.read_at ? 'LIDA' : (d.status || 'SOLICITADA');
      const quando = d.read_at || d.requested_at;
      const partes = [];
      if (d.type) partes.push(`Notificação ${d.type}`);
      partes.push(estado + (quando ? ` em ${Utils.fmtDateTime(quando)}` : ''));
      resumo = partes.join(' — ');
    } else if (isSIG) {
      const estado = d.received_at ? 'RECEBIDA' : (d.expedit_at ? 'EXPEDIDA' : (d.status || 'SOLICITADA'));
      const quando = d.received_at || d.expedit_at || d.requested_at;
      const nums = Array.isArray(d.numbers) && d.numbers.length ? ` Nº ${d.numbers.join(', ')}` : '';
      const tipo = d.type ? ` ${d.type}` : '';
      resumo = `SIGADAER${tipo}${nums} — ${estado}${quando ? ` em ${Utils.fmtDateTime(quando)}` : ''}`;
    } else {
      // Fallback: mostra o JSON de forma compacta para não poluir
      try {
        resumo = JSON.stringify(d);
      } catch {
        resumo = String(d);
      }
    }

    return `${ts} — ${who} — ${act} — ${resumo}`;
  }

  async function loadHistory(processId) {
    const box = el('histProcesso');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando histórico…</div>';
    try {
      const { data, error } = await sb.from('history')
        .select('*')
        .eq('process_id', processId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!data || !data.length) {
        box.innerHTML = '<div class="msg">Nenhum evento de histórico.</div>';
        return;
      }
      const ul = document.createElement('ul');
      data.forEach(item => {
        const li = document.createElement('li');
        li.textContent = describeHistoryItem(item);
        ul.appendChild(li);
      });
      box.innerHTML = '';
      box.appendChild(ul);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  // —— Parecer Interno ——
  async function cadastrarOpiniao() {
    const nup = el('opNUP').value.trim();
    const type = el('opTipo').value;
    const requested_at_input = el('opSolic').value;
    const requested_at = requested_at_input ? new Date(requested_at_input).toISOString() : new Date().toISOString();
    if (!nup) return Utils.setMsg('opMsg', 'Informe o NUP.', true);
    try {
      const pid = currentProcId || await getProcessIdByNUP(nup);
      if (!pid) throw new Error('Processo não encontrado.');
      const u = await getUser();
      const { error } = await sb.from('internal_opinions').insert({
        process_id: pid, type, requested_at, created_by: u.id
      });
      if (error) throw error;
      Utils.setMsg('opMsg', 'Parecer cadastrado (status SOLICITADO).');
      await reloadLists();
    } catch (e) {
      Utils.setMsg('opMsg', e.message || String(e), true);
    }
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
    Utils.setMsg('opMsg', 'Finalizando parecer…');
    try {
      const { error } = await sb.from('internal_opinions').update({ finalized_at }).eq('id', currentOpiniaoRecId);
      if (error) throw error;
      Utils.setMsg('opMsg', 'Parecer finalizado.');
      cancelarFinOpiniao();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('opMsg', e.message || String(e), true);
    }
  }

  function showOpiniaoRecForm(id) {
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

  function showOpiniaoFinForm(id) {
    currentOpiniaoRecId = id;
    el('opFinInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('opLista');
    Utils.show('opFinForm');
  }

  function cancelarFinOpiniao() {
    currentOpiniaoRecId = null;
    el('opFinInput').value = '';
    Utils.hide('opFinForm');
    Utils.show('opLista');
  }

  // —— Notificação ——
  async function cadastrarNotif() {
    const nup = el('ntNUP').value.trim();
    const type = el('ntTipo').value;
    const requested_at_input = el('ntSolic').value;
    const requested_at = requested_at_input ? new Date(requested_at_input).toISOString() : new Date().toISOString();
    if (!nup) return Utils.setMsg('ntMsg', 'Informe o NUP.', true);
    try {
      const pid = currentProcId || await getProcessIdByNUP(nup);
      if (!pid) throw new Error('Processo não encontrado.');
      const u = await getUser();
      const { error } = await sb.from('notifications').insert({ process_id: pid, type, requested_at, created_by: u.id });
      if (error) throw error;
      Utils.setMsg('ntMsg', 'Notificação cadastrada (status SOLICITADA).');
      await reloadLists();
    } catch (e) {
      Utils.setMsg('ntMsg', e.message || String(e), true);
    }
  }

  async function marcarNotifLida() {
    const t = el('ntLidaInput').value;
    const read_at = t ? new Date(t).toISOString() : new Date().toISOString();
    if (!currentNotifLidaId) return Utils.setMsg('ntMsg', 'Nenhuma notificação selecionada.', true);
    Utils.setMsg('ntMsg', 'Marcando como lida…');
    try {
      const { error } = await sb.from('notifications').update({ read_at }).eq('id', currentNotifLidaId);
      if (error) throw error;
      Utils.setMsg('ntMsg', 'Notificação marcada como lida.');
      cancelarNotifLida();
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

  // —— SIGADAER ——
  function parseSigNumber(str) {
    const s = (str || '').trim().toUpperCase();
    if (!s) return null;
    const m = s.match(/^SIG-?(\d{4})-?(\d{1,4})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const num = Number(m[2]);
    if (year < 2000 || year > 3000) return null;
    if (num < 1 || num > 9999) return null;
    return `${year}-${String(num).padStart(4, '0')}`;
  }

  async function cadastrarSIG() {
    const _sgNupEl = el('sgNUP'); const nup = _sgNupEl ? String((_sgNupEl.value ?? _sgNupEl.textContent)).trim() : '';
    const type = el('sgTipo').value;
    const numberInputEl = el('sgNumero') || el('sgNum');
    const numberInput = numberInputEl ? numberInputEl.value : '';
    const whenInput = el('sgSolic').value;
    const requested_at = whenInput ? new Date(whenInput).toISOString() : new Date().toISOString();

    const parsed = parseSigNumber(numberInput);
    const numbers = parsed ? [Number(parsed.split('-')[1])] : [];

    if (!nup) return Utils.setMsg('sgMsg', 'Informe o NUP.', true);
    try {
      const pid = currentProcId || await getProcessIdByNUP(nup);
      if (!pid) throw new Error('Processo não encontrado.');
      const u = await getUser();
      const { error } = await sb.from('sigadaer').insert({
        process_id: pid, type, requested_at, numbers, created_by: u.id
      });
      if (error) throw error;
      Utils.setMsg('sgMsg', 'SIGADAER cadastrada (status SOLICITADO).');
      await reloadLists();
    } catch (e) {
      Utils.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  async function registrarSIGExpedido() {
    const t = el('sgExpInput').value;
    const expedit_at = t ? new Date(t).toISOString() : new Date().toISOString();
    if (!currentSigExpId) return Utils.setMsg('sgMsg', 'Nenhuma solicitação selecionada.', true);
    Utils.setMsg('sgMsg', 'Registrando expedição…');
    try {
      const { error } = await sb.from('sigadaer').update({ expedit_at }).eq('id', currentSigExpId);
      if (error) throw error;
      Utils.setMsg('sgMsg', 'Expedição registrada.');
      cancelarSIGExpedido();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  async function registrarSIGRecebido() {
    const t = el('sgRecInput').value;
    const received_at = t ? new Date(t).toISOString() : new Date().toISOString();
    if (!currentSigRecId) return Utils.setMsg('sgMsg', 'Nenhuma solicitação selecionada.', true);
    Utils.setMsg('sgMsg', 'Registrando recebimento…');
    try {
      const { error } = await sb.from('sigadaer').update({ received_at }).eq('id', currentSigRecId);
      if (error) throw error;
      Utils.setMsg('sgMsg', 'Recebimento registrado.');
      cancelarSIGRec();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  function showSIGExpedidoForm(id) {
    currentSigExpId = id;
    el('sgExpInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('sgLista');
    Utils.show('sgExpForm');
  }

  function cancelarSIGExpedido() {
    currentSigExpId = null;
    el('sgExpInput').value = '';
    Utils.hide('sgExpForm');
    Utils.show('sgLista');
  }

  function showSIGRecForm(id) {
    currentSigRecId = id;
    el('sgRecInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('sgLista');
    Utils.show('sgRecForm');
  }

  function cancelarSIGRec() {
    currentSigRecId = null;
    el('sgRecInput').value = '';
    Utils.hide('sgRecForm');
    Utils.show('sgLista');
  }

  // ======== LISTAS ========
  async function loadOpiniaoList(processId) {
    const box = el('opLista');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb.from('internal_opinions')
        .select('id,type,requested_at,received_at,finalized_at')
        .eq('process_id', processId)
        .order('requested_at', { ascending: false });
      if (error) throw error;

      if (!data || !data.length) {
        box.innerHTML = '<div class="msg">Nenhum parecer cadastrado.</div>';
        return;
      }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Tipo</th><th>Solicitado</th><th>Recebido</th><th>Finalizado</th><th>Ações</th></tr>';
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.type || ''}</td>
          <td>${row.requested_at ? Utils.fmtDateTime(row.requested_at) : ''}</td>
          <td>${row.received_at ? Utils.fmtDateTime(row.received_at) : ''}</td>
          <td>${row.finalized_at ? Utils.fmtDateTime(row.finalized_at) : ''}</td>
          <td></td>
        `;
        const td = tr.querySelector('td:last-child');
        if (!row.received_at) {
          const btnR = document.createElement('button');
          btnR.textContent = 'Marcar Recebido';
          btnR.addEventListener('click', () => showOpiniaoRecForm(row.id));
          td.appendChild(btnR);
        }
        if (!row.finalized_at) {
          const btnF = document.createElement('button');
          btnF.textContent = 'Finalizar';
          btnF.addEventListener('click', () => showOpiniaoFinForm(row.id));
          td.appendChild(btnF);
        }
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.innerHTML = '';
      box.appendChild(table);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
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
        box.innerHTML = '<div class="msg">Nenhuma notificação cadastrada.</div>';
        return;
      }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Tipo</th><th>Solicitada</th><th>Lida</th><th>Ações</th></tr>';
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      data.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.type || ''}</td>
          <td>${row.requested_at ? Utils.fmtDateTime(row.requested_at) : ''}</td>
          <td>${row.read_at ? Utils.fmtDateTime(row.read_at) : ''}</td>
          <td></td>
        `;
        const td = tr.querySelector('td:last-child');
        if (!row.read_at) {
          const btn = document.createElement('button');
          btn.textContent = 'Marcar Lida';
          btn.addEventListener('click', () => showNotifLidaForm(row.id));
          td.appendChild(btn);
        }
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.innerHTML = '';
      box.appendChild(table);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  async function loadSIGList(processId) {
    const box = el('sgLista');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb.from('sigadaer')
        .select('id,type,numbers,requested_at,expedit_at,received_at')
        .eq('process_id', processId)
        .order('requested_at', { ascending: false });
      if (error) throw error;

      if (!data || !data.length) {
        box.innerHTML = '<div class="msg">Nenhuma solicitação SIGADAER encontrada.</div>';
        return;
      }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Tipo</th><th>Números</th><th>Solicitada</th><th>Recebida</th><th>Ações</th></tr>';
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      data.forEach(row => {
        const tr = document.createElement('tr');
        const nums = Array.isArray(row.numbers) ? row.numbers.join(', ') : '';
        tr.innerHTML = `
          <td>${row.type || ''}</td>
          <td>${nums}</td>
          <td>${row.requested_at ? Utils.fmtDateTime(row.requested_at) : ''}</td>
          <td>${row.received_at ? Utils.fmtDateTime(row.received_at) : ''}</td>
          <td></td>
        `;
        const td = tr.querySelector('td:last-child');
        if (!row.received_at) {
          const btn = document.createElement('button');
          btn.textContent = 'Marcar Recebido';
          btn.addEventListener('click', () => showSIGRecForm(row.id));
          td.appendChild(btn);
        }
        if (!row.expedit_at) {
          const btn2 = document.createElement('button');
          btn2.textContent = 'Marcar Expedido';
          btn2.addEventListener('click', () => showSIGExpedidoForm(row.id));
          td.appendChild(btn2);
        }
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.innerHTML = '';
      box.appendChild(table);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  // ======== LISTA DE PROCESSOS ========
  async function loadProcessList() {
    const box = el('listaProcessos');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb.from('processes')
        .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      if (!data || !data.length) {
        box.innerHTML = '<div class="msg">Nenhum processo encontrado.</div>';
        return;
      }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>NUP</th><th>Tipo</th><th>Status</th><th>Desde</th><th>1ª entrada</th><th>Obra término</th><th>Concluída</th><th>Ações</th></tr>';
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      data.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.nup || ''}</td>
          <td>${p.type || ''}</td>
          <td>${p.status || ''}</td>
          <td>${p.status_since ? Utils.fmtDateTime(p.status_since) : ''}</td>
          <td>${p.first_entry_date ? Utils.fmtDate(p.first_entry_date) : ''}</td>
          <td>${p.obra_termino_date ? Utils.fmtDate(p.obra_termino_date) : ''}</td>
          <td>${typeof p.obra_concluida === 'boolean' ? Utils.yesNo(p.obra_concluida) : ''}</td>
          <td><button type="button">Selecionar</button></td>
        `;
        tr.querySelector('button').addEventListener('click', async () => {
          currentProcId = p.id;
          currentNUP = p.nup || '';
          syncNUP();
          el('procNUP').value = p.nup || '';
          el('procTipo').value = p.type || '';
          el('procStatus').value = p.status || '';
          el('procStatusDate').value = Utils.toDateTimeLocalValue(p.status_since);
          el('procEntrada').value = Utils.toDateInputValue(p.first_entry_date);
          el('procObraTermino').value = Utils.toDateInputValue(p.obra_termino_date);
          if (p.obra_concluida) el('btnObraConcluida').classList.add('active');
          await reloadLists();
          await loadHistory(p.id);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.innerHTML = '';
      box.appendChild(table);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  async function loadNotifAndSig(processId) {
    await loadOpiniaoList(processId);
    await loadNotifList(processId);
    await loadSIGList(processId);
  }

  async function reloadLists() {
    const ids = ['procLista','opLista','ntLista','sgLista'];
    const procs = ids.map(id => el(id)).filter(Boolean);
    procs.forEach(box => box.innerHTML = '<div class="msg">Carregando…</div>');
    await Promise.all([
      loadProcessList(),
      currentProcId ? loadOpiniaoList(currentProcId) : Promise.resolve(),
      currentProcId ? loadNotifList(currentProcId) : Promise.resolve(),
      currentProcId ? loadSIGList(currentProcId) : Promise.resolve()
    ]);
  }

  function bindActions() {
    if (el('btnSalvarProc')) el('btnSalvarProc').addEventListener('click', (ev) => { ev.preventDefault(); upsertProcess(); });
    if (el('btnExcluirProc')) el('btnExcluirProc').addEventListener('click', (ev) => { ev.preventDefault(); deleteProcess(); });
    if (el('btnLimparProc')) el('btnLimparProc').addEventListener('click', (ev) => { ev.preventDefault(); clearProcessForm(); });
    if (el('btnObraConcluida')) el('btnObraConcluida').addEventListener('click', (ev) => { ev.preventDefault(); toggleObraConcluida(); });

    if (el('btnCadOpiniao')) el('btnCadOpiniao').addEventListener('click', (ev) => { ev.preventDefault(); cadastrarOpiniao(); });
    if (el('btnSalvarOpRec')) el('btnSalvarOpRec').addEventListener('click', (ev) => { ev.preventDefault(); registrarRecebOpiniao(); });
    if (el('btnVoltarOpRec')) el('btnVoltarOpRec').addEventListener('click', (ev) => { ev.preventDefault(); cancelarRecOpiniao(); });
    if (el('btnSalvarOpFin')) el('btnSalvarOpFin').addEventListener('click', (ev) => { ev.preventDefault(); finalizarOpiniao(); });
    if (el('btnVoltarOpFin')) el('btnVoltarOpFin').addEventListener('click', (ev) => { ev.preventDefault(); cancelarFinOpiniao(); });

    if (el('btnCadNotif')) el('btnCadNotif').addEventListener('click', (ev) => { ev.preventDefault(); cadastrarNotif(); });
    if (el('btnSalvarNtLida')) el('btnSalvarNtLida').addEventListener('click', (ev) => { ev.preventDefault(); marcarNotifLida(); });
    if (el('btnVoltarNtLida')) el('btnVoltarNtLida').addEventListener('click', (ev) => { ev.preventDefault(); cancelarNotifLida(); });

    if (el('btnCadSg')) el('btnCadSg').addEventListener('click', (ev) => { ev.preventDefault(); cadastrarSIG(); });
    if (el('btnSalvarSgExp')) el('btnSalvarSgExp').addEventListener('click', (ev) => { ev.preventDefault(); registrarSIGExpedido(); });
    if (el('btnVoltarSgExp')) el('btnVoltarSgExp').addEventListener('click', (ev) => { ev.preventDefault(); cancelarSIGExpedido(); });
    if (el('btnSalvarSgRec')) el('btnSalvarSgRec').addEventListener('click', (ev) => { ev.preventDefault(); registrarSIGRecebido(); });
    if (el('btnVoltarSgRec')) el('btnVoltarSgRec').addEventListener('click', (ev) => { ev.preventDefault(); cancelarSIGRec(); });
  }

  async function loadProcessFromNUP() {
    const url = new URL(location.href);
    const nupParam = url.searchParams.get('nup');
    if (!nupParam) return;
    const p = await fetchProcessByNUP(nupParam);
    if (!p) return;
    currentProcId = p.id;
    currentNUP = p.nup || '';
    syncNUP();
    el('procNUP').value = p.nup || '';
    el('procTipo').value = p.type || '';
    el('procStatus').value = p.status || '';
    el('procStatusDate').value = Utils.toDateTimeLocalValue(p.status_since);
    el('procEntrada').value = Utils.toDateInputValue(p.first_entry_date);
    el('procObraTermino').value = Utils.toDateInputValue(p.obra_termino_date);
    if (p.obra_concluida) el('btnObraConcluida').classList.add('active');
    await reloadLists();
    await loadHistory(p.id);
  }

  function init() {
    bindTabs();
    bindProcFormTracking();
    bindActions();
    loadProcessFromNUP();
    reloadLists();
  }

  return { init, reloadLists };
})();
