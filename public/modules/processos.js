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
    const showTab = (tab) => {
      ['tabProc','tabOpiniao','tabNotif','tabSig'].forEach(id => Utils.hide(id));
      Utils.show(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
      // destaca botão ativo
      buttons.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    };
    buttons.forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });
    // Abre 'Processo' por padrão já com destaque
    showTab('proc');
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
          observations: crea
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
    if (!confirm('Tem certeza que deseja excluir este processo?')) return;
    try {
      const { error } = await sb.from('processes').delete().eq('id', currentProcId);
      if (error) throw error;
      Utils.setMsg('procMsg', 'Processo excluído.');
      clearProcessForm();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('procMsg', e.message || String(e), true);
    }
  }

  function describeHistoryItem(item) {
    const ts = Utils.fmtDateTime(item.created_at);
    const who = item.by_name || item.by_email || (item.by_user_id ? item.by_user_id.slice(0,8) : '—');
    const act = item.action || '—';
    const d = item.data || {};

    // Heurísticas para identificar a origem do registro
    const isProcess   = 'nup' in d && 'type' in d && 'status' in d;
    const isOpinion   = 'requested_at' in d && 'type' in d && ('finalized_at' in d || (d.status && !('read_at' in d)));
    const isNotif     = 'requested_at' in d && 'type' in d && ('read_at' in d) && !('numbers' in d);
    const isSIG       = ('numbers' in d) || ('expedit_at' in d) || (d.status && d.status === 'EXPEDIDA');

    function bit(v, label) {
      if (!v) return '';
      return `${label}: ${Utils.fmtDateTime(v)}`;
    }

    let resumo = '';
    if (isProcess) {
      const partes = [];
      if (d.type) partes.push(`Processo ${d.type}`);
      if (d.status) partes.push(`Status: ${d.status}`);
      const ss = d.status_since ? ` em ${Utils.fmtDateTime(d.status_since)}` : '';
      if (d.status) partes[partes.length - 1] = partes[partes.length - 1] + ss;
      partes.push(...[
        bit(d.first_entry_date, '1ª entrada'),
        bit(d.obra_termino_date, 'Término obra'),
        (typeof d.obra_concluida === 'boolean') ? `Obra concluída: ${Utils.yesNo(d.obra_concluida)}` : ''
      ].filter(Boolean));
      resumo = partes.join(' — ');
    } else if (isOpinion) {
      const estado = d.finalized_at ? 'FINALIZADO' : (d.received_at ? 'RECEBIDO' : (d.status || 'SOLICITADO'));
      const quando = d.finalized_at || d.received_at || d.requested_at;
      const partes = [];
      if (d.type) partes.push(`Parecer ${d.type}`);
      partes.push(estado + (quando ? ` em ${Utils.fmtDateTime(quando)}` : ''));
      resumo = partes.join(' — ');
    } else if (isNotif) {
      const quando = d.read_at || d.requested_at;
      const partes = [];
      if (d.type) partes.push(`Notificação ${d.type}`);
      partes.push((d.read_at ? 'LIDA' : 'SOLICITADA') + (quando ? ` em ${Utils.fmtDateTime(quando)}` : ''));
      resumo = partes.join(' — ');
    } else if (isSIG) {
      const partes = [];
      if (d.numbers) partes.push(`SIGADAER (${d.numbers})`);
      if (d.status === 'EXPEDIDA' || d.expedit_at) partes.push(`EXPEDIDA em ${Utils.fmtDateTime(d.expedit_at || d.requested_at)}`);
      if (d.received_at) partes.push(`RECEBIDA em ${Utils.fmtDateTime(d.received_at)}`);
      resumo = partes.join(' — ');
    } else {
      try {
        resumo = JSON.stringify(d);
      } catch {
        resumo = String(d);
      }
    }

    return `${ts} — ${who} — ${act} — ${resumo}`;
  }

  async function loadHistory(processId) {
    const box = el('procHistory');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb.from('history')
        .select('*')
        .eq('process_id', processId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!data || !data.length) {
        box.innerHTML = '<div class="msg">Sem histórico.</div>';
        return;
      }
      const ul = document.createElement('ul');
      ul.className = 'history';
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

  // ======== OPINIÕES INTERNAS ========
  async function cadastrarOpiniao() {
    const type = el('opTipo')?.value;
    const t = el('opSolic')?.value;
    const requested_at = t ? new Date(t).toISOString() : new Date().toISOString();
    if (!currentProcId) return Utils.setMsg('opMsg', 'Nenhum processo selecionado.', true);
    Utils.setMsg('opMsg', 'Cadastrando…');
    try {
      const payload = { process_id: currentProcId, type, requested_at };
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

  async function finalizarOpiniao() {
    const t = el('opFinInput').value;
    const finalized_at = t ? new Date(t).toISOString() : new Date().toISOString();
    if (!currentOpiniaoRecId) return Utils.setMsg('opMsg', 'Nenhuma solicitação selecionada.', true);
    Utils.setMsg('opMsg', 'Registrando finalização…');
    try {
      const { error } = await sb.from('internal_opinions').update({ finalized_at }).eq('id', currentOpiniaoRecId);
      if (error) throw error;
      Utils.setMsg('opMsg', 'Finalização registrada.');
      cancelarFinOpiniao();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('opMsg', e.message || String(e), true);
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
      const payload = { process_id: currentProcId, type, requested_at };
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
      const { error } = await sb.from('notifications').update({ read_at }).eq('id', currentNotifLidaId);
      if (error) throw error;
      Utils.setMsg('ntMsg', 'Notificação marcada como lida.');
      cancelarNotifLida();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('ntMsg', e.message || String(e), true);
    }
  }

  // ======== SIGADAER ========
  function showSIGExpedidoForm(id) {
    currentSigExpId = id;
    el('sgExpInput').value = Utils.toDateTimeLocalValue(new Date());
    Utils.hide('sgLista');
    Utils.show('sgExpForm');
  }
  function cancelarSIGExpedido() {
    currentSigExpId = null;
    Utils.hide('sgExpForm');
    Utils.show('sgLista');
  }

  async function registrarSIGExpedido() {
    const t = el('sgExpInput').value;
    const expedit_at = t ? new Date(t).toISOString() : new Date().toISOString();
    if (!currentSigExpId) return Utils.setMsg('sgMsg', 'Nenhuma solicitação selecionada.', true);
    Utils.setMsg('sgMsg', 'Registrando expedição…');
    try {
      const { error } = await sb.from('sigadaer').update({ expedit_at, status: 'EXPEDIDA' }).eq('id', currentSigExpId);
      if (error) throw error;
      Utils.setMsg('sgMsg', 'Expedição registrada.');
      cancelarSIGExpedido();
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
      const { error } = await sb.from('sigadaer').update({ received_at }).eq('id', currentSigRecId);
      if (error) throw error;
      Utils.setMsg('sgMsg', 'Recebimento registrado.');
      cancelarSIGRec();
      await reloadLists();
    } catch (e) {
      Utils.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  // ======== LISTAGENS ========
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
        box.innerHTML = '<div class="msg">Nenhum parecer encontrado.</div>';
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
          const btn = document.createElement('button');
          btn.textContent = 'Marcar Recebido';
          btn.addEventListener('click', () => showRecebOpiniaoForm(row.id));
          td.appendChild(btn);
        }
        if (!row.finalized_at) {
          const btnF = document.createElement('button');
          btnF.textContent = 'Finalizar';
          btnF.addEventListener('click', () => showFinOpiniaoForm(row.id));
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
        box.innerHTML = '<div class="msg">Nenhuma notificação encontrada.</div>';
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
          btn.textContent = 'Marcar como lida';
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
          <td>${row.status || ''}</td>
          <td></td>
        `;
        const td = tr.querySelector('td:last-child');
        if (!row.expedit_at) {
          const btnE = document.createElement('button');
          btnE.textContent = 'Marcar Expedida';
          btnE.addEventListener('click', () => showSIGExpedidoForm(row.id));
          td.appendChild(btnE);
        }
        if (!row.received_at) {
          const btnR = document.createElement('button');
          btnR.textContent = 'Marcar Recebido';
          btnR.addEventListener('click', () => showSIGRecForm(row.id));
          td.appendChild(btnR);
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

  // ======== NUP nos formulários das abas ========
  function syncNUP() {
    const _op = el('opNUP'); if (_op) _op.value = currentNUP;
    const _nt = el('ntNUP'); if (_nt) _nt.value = currentNUP;
    const _sg = el('sgNUP'); if (_sg) _sg.value = currentNUP;
  }

  async function loadProcessList() {
    const box = el('procLista');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('processes')
        .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      if (!data || !data.length) {
        box.innerHTML = '<div class="msg">Nenhum processo encontrado.</div>';
        return;
      }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>NUP</th><th>Tipo</th><th>Status</th><th>Desde</th><th>1ª entrada</th><th>Término obra</th><th>Obra concl.</th><th>Ações</th></tr>';
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
          el('btnObraConcluida').classList.toggle('active', !!p.obra_concluida);
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

  async function reloadLists() {
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

    if (el('btnCadSIG')) el('btnCadSIG').addEventListener('click', async (ev) => {
      ev.preventDefault();
      const numbers = el('sgNums')?.value?.trim() || null;
      const t = el('sgSolic')?.value;
      const requested_at = t ? new Date(t).toISOString() : new Date().toISOString();
      if (!currentProcId) return Utils.setMsg('sgMsg', 'Nenhum processo selecionado.', true);
      Utils.setMsg('sgMsg', 'Cadastrando…');
      try {
        const payload = { process_id: currentProcId, numbers, requested_at, status: 'SOLICITADA' };
        const { error } = await sb.from('sigadaer').insert(payload);
        if (error) throw error;
        Utils.setMsg('sgMsg', 'Solicitação cadastrada.');
        await reloadLists();
      } catch (e) {
        Utils.setMsg('sgMsg', e.message || String(e), true);
      }
    });
    if (el('btnSalvarSgExp')) el('btnSalvarSgExp').addEventListener('click', (ev) => { ev.preventDefault(); registrarSIGExpedido(); });
    if (el('btnVoltarSgExp')) el('btnVoltarSgExp').addEventListener('click', (ev) => { ev.preventDefault(); cancelarSIGExpedido(); });
    if (el('btnSalvarSgRec')) el('btnSalvarSgRec').addEventListener('click', (ev) => { ev.preventDefault(); registrarSIGRecebido(); });
    if (el('btnVoltarSgRec')) el('btnVoltarSgRec').addEventListener('click', (ev) => { ev.preventDefault(); cancelarSIGRec(); });
  }

  async function load() {
    bindTabs();
    bindProcFormTracking();
    bindActions();
    clearProcessForm();
    await reloadLists();
  }

  return { load };
})();
