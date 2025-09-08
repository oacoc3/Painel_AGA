/* public/modules/processos.js
 * Módulo Processos — busca/cadastro/edição + controle de abas.
 * Requisitos:
 *  - Ao abrir: somente NUP + Buscar habilitados
 *  - Buscar NUP:
 *      * se existe: preenche formulário, habilita demais abas, leva item ao topo da lista
 *      * se não existe: pergunta se deseja criar e habilita só a aba Processo até salvar
 *  - Selecionar linha na lista: carrega e habilita tudo
 *  - Botão Salvar só habilita quando algo muda; após salvar, volta a desabilitar
 *  - NÃO usa coluna "observations" no banco
 */

window.Modules = window.Modules || {};
window.Modules.processos = (() => {
  let currentProcId = null;
  let currentNUP = '';
  let editingOpId = null;
  let editingNtId = null;
  let editingSgId = null;

  const el = (id) => document.getElementById(id);

  const SafeUtils = {
    setMsg(id, text, isError = false) {
      const box = el(id);
      if (!box) return;
      box.textContent = text || '';
      box.classList.remove('error');
      if (isError && text) box.classList.add('error');
    },
    fmtDate(iso) {
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      } catch { return ''; }
    },
    fmtDateTime(iso) {
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        const dt = d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        const tm = d.toLocaleTimeString('pt-BR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
        return `${dt} ${tm}`;
      } catch { return ''; }
    },
    toDateInputValue(isoDate) {
      if (!isoDate) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
      const d = new Date(isoDate);
      if (Number.isNaN(d.getTime())) return '';
      return d.toISOString().slice(0, 10);
    },
    toDateTimeLocalValue(isoDateTime) {
      if (!isoDateTime) return '';
      const d = new Date(isoDateTime);
      if (Number.isNaN(d.getTime())) return '';
      return d.toISOString().slice(0, 16); // yyyy-mm-ddThh:mm
    }
  };
  const U = (window.Utils && typeof window.Utils.setMsg === 'function') ? window.Utils : SafeUtils;

  // === toggles ===
  function toggleProcFields(on) {
    const box = el('procCampos');
    if (box) box.classList.toggle('hidden', !on);
  }
  function toggleOtherTabsVisible(on) {
    ['tabBtnOpiniao','tabBtnNotif','tabBtnSig'].forEach(id => {
      const b = el(id);
      if (b) b.classList.toggle('hidden', !on);
    });
  }
  function toggleProcActions(on) {
    const box = el('procAcoes');
    if (box) box.classList.toggle('hidden', !on);
  }
  // ===============================

  function setProcFormEnabled(on) {
    ['procTipo','procStatus','procStatusDate','procEntrada','procObraTermino','procObs'].forEach(id => {
      const e = el(id); if (e) e.disabled = !on;
    });
    ['btnObraConcluida','btnSalvarProc','btnNovoProc']
      .forEach(id => { const b = el(id); if (b) b.disabled = !on; });
  }
  function setOtherTabsEnabled(on) {
    ['opiniao','notif','sig'].forEach(tab => {
      const b = document.querySelector(`[data-tab="${tab}"]`);
      if (b) b.disabled = !on;
    });
  }

  // Mantém o NUP sincronizado nas outras abas (Parecer, Notificação, SIGADAER)
  function syncNupFields() {
    ['opNUP', 'ntNUP', 'sgNUP'].forEach(id => {
      const e = el(id);
      if (e) e.value = currentNUP;
    });
  }

  function showTab(tab) {
    const ids = { proc: 'tabProc', opiniao: 'tabOpiniao', notif: 'tabNotif', sig: 'tabSig' };
    Object.entries(ids).forEach(([k, id]) => {
      const box = el(id); if (box) box.style.display = (k === tab) ? 'block' : 'none';
    });
    Array.from(document.querySelectorAll('[data-tab]'))
      .forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

    const maps = { proc: 'procLista', opiniao: 'opLista', notif: 'ntLista', sig: 'sgLista' };
    Object.values(maps).forEach(id => { const x = el(id); if (x) x.style.display = 'none'; });
    const visible = el(maps[tab]); if (visible) visible.style.display = 'block';
  }

  function clearProcessForm() {
    currentProcId = null;
    currentNUP = '';
    syncNupFields();

    if (el('procNUP')) el('procNUP').value = '';
    if (el('procTipo')) el('procTipo').value = 'PDIR';
    if (el('procStatus')) el('procStatus').value = 'ANATEC-PRE';
    if (el('procStatusDate')) el('procStatusDate').value = '';
    if (el('procEntrada')) el('procEntrada').value = '';
    if (el('procObraTermino')) el('procObraTermino').value = '';
    if (el('procObs')) el('procObs').value = '';
    const ob = el('btnObraConcluida'); if (ob) ob.classList.remove('active');

    setProcFormEnabled(false);
    setOtherTabsEnabled(false);
    toggleProcFields(false);
    toggleOtherTabsVisible(false);
    toggleProcActions(false);
    ['btnVerOpiniao','btnVerNotif','btnVerSig'].forEach(id => {
      const b = el(id);
      if (b) { b.disabled = true; b.classList.remove('active'); }
    });
    U.setMsg('procMsg', '');
  }

  function bindProcFormTracking() {
    ['procTipo','procStatus','procStatusDate','procEntrada','procObraTermino','procObs'].forEach(id => {
      const e = el(id); if (!e) return;
      ['input','change'].forEach(evt => {
        e.addEventListener(evt, () => {
          const btn = el('btnSalvarProc');
          if (btn && btn.disabled) btn.disabled = false;
        });
      });
    });
  }

  function toggleObraConcluida() {
    const b = el('btnObraConcluida'); if (!b) return;
    b.classList.toggle('active');
    const save = el('btnSalvarProc'); if (save) save.disabled = false;
  }

  async function buscarProcesso() {
    const nup = (el('procNUP')?.value || '').trim();
    if (!nup) return U.setMsg('procMsg', 'Informe o NUP (Número Único de Protocolo).', true);

    U.setMsg('procMsg', 'Buscando…');
    try {
      const { data, error } = await sb
        .from('processes')
        .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida')
        .eq('nup', nup)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        currentProcId = data.id;
        currentNUP = data.nup;
        syncNupFields();

        el('procTipo').value = data.type || 'PDIR';
        el('procStatus').value = data.status || 'ANATEC-PRE';
        el('procStatusDate').value = data.status_since ? U.toDateTimeLocalValue(data.status_since) : '';
        el('procEntrada').value = data.first_entry_date ? U.toDateInputValue(data.first_entry_date) : '';
        el('procObraTermino').value = data.obra_termino_date ? U.toDateInputValue(data.obra_termino_date) : '';
        if (el('procObs')) el('procObs').value = '';
        const ob = el('btnObraConcluida'); if (ob) ob.classList.toggle('active', !!data.obra_concluida);

        setProcFormEnabled(true);
        toggleProcFields(true);
        bindProcFormTracking();
        toggleProcActions(true);
        if (el('btnSalvarProc')) el('btnSalvarProc').disabled = true;
        if (el('btnNovoProc')) el('btnNovoProc').disabled = false;

        U.setMsg('procMsg', 'Processo encontrado.');
        await loadProcessList();
        await reloadLists();
      } else {
        const ok = window.confirm('Processo não encontrado. Criar novo?');
        if (ok) {
          await showNovoProcessoPopup(nup);
        } else {
          clearProcessForm();
          await loadProcessList();
        }
      }
    } catch (e) {
      U.setMsg('procMsg', e.message || String(e), true);
    }
  }

  // Popup de “Novo Processo” quando NUP não existe
  async function showNovoProcessoPopup(nup) {
    return new Promise(resolve => {
      const dlg = document.createElement('dialog');
      dlg.innerHTML = `
        <form method="dialog" class="proc-popup">
          <h3>Novo Processo ${nup}</h3>
          <label>Tipo
            <select id="npTipo">
              <option>PDIR</option><option>Inscrição</option><option>Alteração</option><option>Exploração</option><option>OPEA</option>
            </select>
          </label>
          <label>Status
            <select id="npStatus">
              <option>ANATEC-PRE</option><option>ANATEC</option><option>ANADOC</option><option>ANAICA</option><option>DIPEJ</option><option>ICA-PUB</option><option>OPEA</option><option>JJAER</option><option>DADOS</option><option>ARQ</option>
            </select>
          </label>
          <label>Desde <input type="datetime-local" id="npStatusDate"></label>
          <label>1ª entrada <input type="date" id="npEntrada"></label>
          <label>Término da obra <input type="date" id="npObraTermino"></label>
          <button type="button" id="npObraConcluida">Obra concluída</button>
          <menu>
            <button value="cancel">Cancelar</button>
            <button id="npSalvar" value="default">Salvar</button>
          </menu>
        </form>`;
      document.body.appendChild(dlg);
      const obraBtn = dlg.querySelector('#npObraConcluida');
      const obraTerm = dlg.querySelector('#npObraTermino');
      obraBtn?.addEventListener('click', () => {
        obraBtn.classList.toggle('active');
        if (obraTerm) obraTerm.disabled = obraBtn.classList.contains('active');
      });
      dlg.addEventListener('close', () => {
        dlg.remove();
        if (!currentProcId) clearProcessForm();
        resolve();
      });
      dlg.querySelector('#npSalvar')?.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const payload = {
          nup,
          type: dlg.querySelector('#npTipo')?.value || 'PDIR',
          status: dlg.querySelector('#npStatus')?.value || 'ANATEC-PRE',
          status_since: dlg.querySelector('#npStatusDate')?.value ? new Date(dlg.querySelector('#npStatusDate').value).toISOString() : null,
          first_entry_date: dlg.querySelector('#npEntrada')?.value ? new Date(dlg.querySelector('#npEntrada').value).toISOString().slice(0,10) : null,
          obra_termino_date: dlg.querySelector('#npObraTermino')?.value ? new Date(dlg.querySelector('#npObraTermino').value).toISOString().slice(0,10) : null,
          obra_concluida: !!obraBtn?.classList.contains('active')
        };
        try {
          const u = await getUser();
          if (!u) throw new Error('Sessão expirada.');
          const { data, error } = await sb
            .from('processes')
            .insert({ ...payload, created_by: u.id })
            .select('id')
            .single();
          if (error) throw error;
          currentProcId = data.id;
          currentNUP = nup;
          el('procNUP').value = nup;
          dlg.close();
          await buscarProcesso();
        } catch(e) {
          alert(e.message || e);
        }
      });
      dlg.showModal();
    });
  }

  async function upsertProcess() {
    const nup = (el('procNUP')?.value || '').trim();
    if (!nup) return U.setMsg('procMsg', 'Informe o NUP.', true);

    const payload = {
      nup,
      type: el('procTipo')?.value || 'PDIR',
      status: el('procStatus')?.value || 'ANATEC-PRE',
      status_since: el('procStatusDate')?.value ? new Date(el('procStatusDate').value).toISOString() : null,
      first_entry_date: el('procEntrada')?.value ? new Date(el('procEntrada').value).toISOString().slice(0,10) : null,
      obra_termino_date: el('procObraTermino')?.value ? new Date(el('procObraTermino').value).toISOString().slice(0,10) : null,
      obra_concluida: !!el('btnObraConcluida')?.classList.contains('active')
      // (Sem "observations")
    };

    try {
      if (!currentProcId) {
        const u = await getUser();
        if (!u) return U.setMsg('procMsg', 'Sessão expirada.', true);
        const { data, error } = await sb.from('processes').insert({ ...payload, created_by: u.id }).select('id').single();
        if (error) throw error;
        currentProcId = data.id;
        currentNUP = nup;
        toggleProcActions(true);
        U.setMsg('procMsg', 'Processo cadastrado.');
      } else {
        const { error } = await sb.from('processes').update(payload).eq('id', currentProcId);
        if (error) throw error;
        currentNUP = nup;
        U.setMsg('procMsg', 'Processo atualizado.');
      }

      syncNupFields();
      if (el('btnSalvarProc')) el('btnSalvarProc').disabled = true;
      await loadProcessList();
      await reloadLists();
    } catch (e) {
      U.setMsg('procMsg', e.message || String(e), true);
    }
  }

  // Popup para editar status do processo
  function showStatusEditPopup(id, curStatus, curDate) {
    if (!id) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <h3>Alterar status</h3>
        <label>Novo status
          <select id="stNovo">
            <option>ANATEC-PRE</option><option>ANATEC</option><option>ANADOC</option><option>ANAICA</option><option>DIPEJ</option><option>ICA-PUB</option><option>OPEA</option><option>JJAER</option><option>DADOS</option><option>ARQ</option>
          </select>
        </label>
        <label>Desde <input type="datetime-local" id="stDesde"></label>
        <menu>
          <button value="cancel">Cancelar</button>
          <button id="stSalvar" value="default">Salvar</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    const sel = dlg.querySelector('#stNovo');
    if (sel) sel.value = curStatus || 'ANATEC-PRE';
    const dt = dlg.querySelector('#stDesde');
    if (dt && curDate) dt.value = U.toDateTimeLocalValue(curDate);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#stSalvar')?.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const payload = {
        status: sel?.value || 'ANATEC-PRE',
        status_since: dt?.value ? new Date(dt.value).toISOString() : null
      };
      try {
        const { error } = await sb.from('processes').update(payload).eq('id', id);
        if (error) throw error;
        dlg.close();
        await loadProcessList();
      } catch (e) {
        alert(e.message || e);
      }
    });
    dlg.showModal();
  }

  // Popup para editar término de obra
  function showObraEditPopup(id, curDate, concluida) {
    if (!id) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <h3>Atualizar obra</h3>
        <label>Término <input type="date" id="obTerm"></label>
        <label><input type="checkbox" id="obConc"> Obra concluída</label>
        <menu>
          <button value="cancel">Cancelar</button>
          <button id="obSalvar" value="default">Salvar</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    const term = dlg.querySelector('#obTerm');
    if (term && curDate) term.value = U.toDateInputValue(curDate);
    const chk = dlg.querySelector('#obConc');
    if (chk) chk.checked = !!concluida;
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#obSalvar')?.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const payload = {
        obra_termino_date: term?.value ? new Date(term.value).toISOString().slice(0,10) : null,
        obra_concluida: !!chk?.checked
      };
      try {
        const { error } = await sb.from('processes').update(payload).eq('id', id);
        if (error) throw error;
        dlg.close();
        await loadProcessList();
      } catch (e) {
        alert(e.message || e);
      }
    });
    dlg.showModal();
  }

  async function loadProcessList() {
    const box = el('procLista');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';

    try {
      const { data, error } = await sb
        .from('processes')
        .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida,created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = Array.isArray(data) ? [...data] : [];
      if (currentProcId) {
        const cur = String(currentProcId);
        rows.sort((a, b) => (String(a.id) === cur ? -1 : (String(b.id) === cur ? 1 : 0)));
      }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>NUP</th><th>Tipo</th><th>Status</th><th>Desde</th>
          <th>1ª Entrada</th><th>Obra (término)</th><th>Concluída</th><th>Ações</th><th>Histórico</th>
        </tr>`;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      rows.forEach(r => {
        const tr = document.createElement('tr');
        const isCurrent = String(r.id) === String(currentProcId);
        if (isCurrent) tr.classList.add('selected');
        const stCls = isCurrent ? 'editStatus editable' : '';
        const obCls = isCurrent ? 'editObra editable' : '';
        tr.innerHTML = `
          <td>${r.nup}</td>
          <td>${r.type || ''}</td>
          <td class="${stCls}" data-id="${r.id}" data-status="${r.status || ''}" data-status-date="${r.status_since || ''}">${r.status || ''}</td>
          <td>${r.status_since ? U.fmtDateTime(r.status_since) : ''}</td>
          <td>${r.first_entry_date ? U.fmtDate(r.first_entry_date) : ''}</td>
          <td class="${obCls}" data-id="${r.id}" data-obra="${r.obra_termino_date || ''}" data-conc="${r.obra_concluida ? '1' : '0'}">${r.obra_termino_date ? U.fmtDate(r.obra_termino_date) : ''}</td>
          <td>${r.obra_concluida ? 'Sim' : 'Não'}</td>
          <td><button type="button" class="selProc" data-id="${r.id}">Selecionar</button></td>
          <td><button type="button" class="histProc" data-id="${r.id}" title="Histórico">🕒</button></td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      box.innerHTML = '';
      box.appendChild(table);

      box.querySelectorAll('.editStatus').forEach(td => {
        td.addEventListener('click', () => {
          showStatusEditPopup(td.dataset.id, td.dataset.status, td.dataset.statusDate);
        });
      });
      box.querySelectorAll('.editObra').forEach(td => {
        td.addEventListener('click', () => {
          showObraEditPopup(td.dataset.id, td.dataset.obra, td.dataset.conc === '1');
        });
      });

      box.querySelectorAll('.selProc').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const row = rows.find(r => String(r.id) === String(id));
          if (!row) return;

          currentProcId = row.id;
          currentNUP = row.nup;
          syncNupFields();

          if (el('procNUP')) el('procNUP').value = row.nup;
          if (el('procTipo')) el('procTipo').value = row.type || 'PDIR';
          if (el('procStatus')) el('procStatus').value = row.status || 'ANATEC-PRE';
          if (el('procStatusDate')) el('procStatusDate').value = row.status_since ? U.toDateTimeLocalValue(row.status_since) : '';
          if (el('procEntrada')) el('procEntrada').value = row.first_entry_date ? U.toDateInputValue(row.first_entry_date) : '';
          if (el('procObraTermino')) el('procObraTermino').value = row.obra_termino_date ? U.toDateInputValue(row.obra_termino_date) : '';
          if (el('procObs')) el('procObs').value = '';
          const ob = el('btnObraConcluida'); if (ob) ob.classList.toggle('active', !!row.obra_concluida);

          setProcFormEnabled(true);
          toggleProcFields(true);
          bindProcFormTracking();
          toggleProcActions(true);
          if (el('btnSalvarProc')) el('btnSalvarProc').disabled = true;
          if (el('btnNovoProc')) el('btnNovoProc').disabled = false;

          U.setMsg('procMsg', 'Processo selecionado.');
          await reloadLists();
          await loadProcessList();
        });
      });

      box.querySelectorAll('.histProc').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          showHistoryPopup(id);
        });
      });
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  async function loadOpiniaoList(procId, targetId = 'opLista') {
    const box = el(targetId);
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('internal_opinions')
        .select('id,type,requested_at,status,received_at')
        .eq('process_id', procId)
        .order('requested_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      Utils.renderTable(box, [
        { key: 'type', label: 'Tipo' },
        { key: 'requested_at', label: 'Solicitada em', value: r => U.fmtDateTime(r.requested_at) },
        { key: 'status', label: 'Status' },
        { key: 'received_at', label: 'Recebida em', value: r => U.fmtDateTime(r.received_at) },
        {
          label: 'Ações',
          render: r => {
            if (r.status === 'SOLICITADO') {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = 'Recebido';
              b.addEventListener('click', () => showOpRecForm(r.id));
              return b;
            }
            if (r.status === 'RECEBIDO') {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = 'Finalizado';
              b.addEventListener('click', () => showOpFinForm(r.id));
              return b;
            }
            return '';
          }
        }
      ], rows);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  async function loadNotifList(procId, targetId = 'ntLista') {
    const box = el(targetId);
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('notifications')
        .select('id,type,requested_at,status,read_at')
        .eq('process_id', procId)
        .order('requested_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      Utils.renderTable(box, [
        { key: 'type', label: 'Tipo' },
        { key: 'requested_at', label: 'Solicitada em', value: r => U.fmtDateTime(r.requested_at) },
        { key: 'status', label: 'Status' },
        { key: 'read_at', label: 'Lida em', value: r => U.fmtDateTime(r.read_at) },
        {
          label: 'Ações',
          render: r => {
            if (r.status !== 'LIDA') {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = 'Lida';
              b.addEventListener('click', () => showNtLidaForm(r.id));
              return b;
            }
            return '';
          }
        }
      ], rows);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  async function loadSIGList(procId, targetId = 'sgLista') {
    const box = el(targetId);
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('sigadaer')
        .select('id,numbers,type,requested_at,status,expedit_at,received_at')
        .eq('process_id', procId)
        .order('requested_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      Utils.renderTable(box, [
        {
          key: 'numbers',
          label: 'Números',
          value: r => Array.isArray(r.numbers) ? r.numbers.map(n => String(n).padStart(6, '0')).join('; ') : ''
        },
        { key: 'type', label: 'Tipo' },
        { key: 'requested_at', label: 'Solicitada em', value: r => U.fmtDateTime(r.requested_at) },
        { key: 'status', label: 'Status' },
        { key: 'expedit_at', label: 'Expedida em', value: r => U.fmtDateTime(r.expedit_at) },
        { key: 'received_at', label: 'Recebida em', value: r => U.fmtDateTime(r.recebido_at || r.received_at) },
        {
          label: 'Ações',
          render: r => {
            if (r.status === 'SOLICITADO') {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = 'Expedido';
              b.addEventListener('click', () => showSgExpForm(r.id));
              return b;
            }
            if (r.status === 'EXPEDIDO') {
              const b = document.createElement('button');
              b.type = 'button';
              b.textContent = 'Recebido';
              b.addEventListener('click', () => showSgRecForm(r.id));
              return b;
            }
            return '';
          }
        }
      ], rows);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  async function showOpiniaoPopup() {
    if (!currentProcId) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="opListaPop" class="table scrolly">Carregando…</div><button type="button" id="opClose">Fechar</button>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#opClose').addEventListener('click', () => dlg.close());
    dlg.showModal();
    await loadOpiniaoList(currentProcId, 'opListaPop');
  }

  async function showNotifPopup() {
    if (!currentProcId) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="ntListaPop" class="table scrolly">Carregando…</div><button type="button" id="ntClose">Fechar</button>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#ntClose').addEventListener('click', () => dlg.close());
    dlg.showModal();
    await loadNotifList(currentProcId, 'ntListaPop');
  }

  async function showSigPopup() {
    if (!currentProcId) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="sgListaPop" class="table scrolly">Carregando…</div><button type="button" id="sgClose">Fechar</button>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#sgClose').addEventListener('click', () => dlg.close());
    dlg.showModal();
    await loadSIGList(currentProcId, 'sgListaPop');
  }

  function formatHistoryDetails(det) {
    if (!det) return '';
    try {
      const obj = typeof det === 'string' ? JSON.parse(det) : det;
      return Object.entries(obj)
        .map(([k, v]) => {
          if (v == null) return null;
          return `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`;
        })
        .filter(Boolean)
        .join('; ');
    } catch {
      return typeof det === 'string' ? det : JSON.stringify(det);
    }
  }

  async function showHistoryPopup(procId) {
    if (!procId) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div class="msg">Carregando…</div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
    try {
      const { data, error } = await sb
        .from('history')
        .select('id,action,details,user_email,created_at')
        .eq('process_id', procId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data)
        ? data.map(r => ({
            ...r,
            details_text: formatHistoryDetails(r.details)
          }))
        : [];
      const content = document.createElement('div');
      content.className = 'table scrolly';
      Utils.renderTable(content, [
        { key: 'created_at', label: 'Data', value: r => U.fmtDateTime(r.created_at) },
        { key: 'action', label: 'Ação' },
        { key: 'user_email', label: 'Usuário', value: r => r.user_email || '' },
        { key: 'details_text', label: 'Detalhes' }
      ], rows);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Fechar';
      btn.addEventListener('click', () => dlg.close());
      dlg.innerHTML = '';
      dlg.appendChild(content);
      dlg.appendChild(btn);
    } catch (e) {
      dlg.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  // === Cadastro e status ===

  function parseSigNumbers(text) {
    if (!text) return [];
    return text
      .split(/[;,\s]+/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        const m = p.match(/^(\d{1,3})\/(\d{4})$/);
        if (m) {
          const num = parseInt(m[1], 10);
          const year = parseInt(m[2].slice(-2), 10);
          return year * 1000 + num;
        }
        const n = parseInt(p.replace(/\D/g, ''), 10);
        return Number.isNaN(n) ? null : n;
      })
      .filter(n => n !== null);
  }

  function showCadOpiniaoForm() {
    if (!currentProcId) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Tipo
          <select id="opTipo"><option>ATM</option><option>DT</option><option>CGNA</option></select>
        </label>
        <label>Solicitada em <input type="datetime-local" id="opSolic"></label>
        <menu>
          <button id="btnSalvarOp" type="button">Salvar</button>
          <button type="button" id="btnCancelarOp">Cancelar</button>
        </menu>
        <div id="opMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#btnSalvarOp').addEventListener('click', async ev => { ev.preventDefault(); await cadOpiniao(dlg); });
    dlg.querySelector('#btnCancelarOp').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function cadOpiniao(dlg) {
    if (!currentProcId) return U.setMsg('opMsg', 'Selecione um processo.', true);
    const payload = {
      process_id: currentProcId,
      type: dlg.querySelector('#opTipo')?.value || 'ATM',
      requested_at: dlg.querySelector('#opSolic')?.value ? new Date(dlg.querySelector('#opSolic').value).toISOString() : new Date().toISOString(),
      status: 'SOLICITADO'
    };
    try {
      const u = await getUser();
      if (!u) return U.setMsg('opMsg', 'Sessão expirada.', true);
      const { error } = await sb.from('internal_opinions').insert({ ...payload, created_by: u.id });
      if (error) throw error;
      dlg.close();
      await reloadLists();
    } catch (e) {
      U.setMsg('opMsg', e.message || String(e), true);
    }
  }

  function showCadNotifForm() {
    if (!currentProcId) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Tipo
          <select id="ntTipo">
            <option>FAV</option><option>FAV-TERM</option><option>TERM-ATRA</option><option>DESF-NAO_INI</option><option>DESF_JJAER</option><option>DESF-REM_REB</option><option>NCD</option><option>NCT</option>
          </select>
        </label>
        <label>Solicitada em <input type="datetime-local" id="ntSolic"></label>
        <menu>
          <button id="btnSalvarNt" type="button">Salvar</button>
          <button type="button" id="btnCancelarNt">Cancelar</button>
        </menu>
        <div id="ntMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#btnSalvarNt').addEventListener('click', async ev => { ev.preventDefault(); await cadNotif(dlg); });
    dlg.querySelector('#btnCancelarNt').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function cadNotif(dlg) {
    if (!currentProcId) return U.setMsg('ntMsg', 'Selecione um processo.', true);
    const payload = {
      process_id: currentProcId,
      type: dlg.querySelector('#ntTipo')?.value || 'FAV',
      requested_at: dlg.querySelector('#ntSolic')?.value ? new Date(dlg.querySelector('#ntSolic').value).toISOString() : new Date().toISOString(),
      status: 'SOLICITADA'
    };
    try {
      const u = await getUser();
      if (!u) return U.setMsg('ntMsg', 'Sessão expirada.', true);
      const { error } = await sb.from('notifications').insert({ ...payload, created_by: u.id });
      if (error) throw error;
      dlg.close();
      await reloadLists();
    } catch (e) {
      U.setMsg('ntMsg', e.message || String(e), true);
    }
  }

  function showCadSigForm() {
    if (!currentProcId) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Números <input id="sgNums" placeholder="Ex.: 123/2024; 456/2024"></label>
        <label>Tipo
          <select id="sgTipo">
            <option>COMAE</option><option>COMPREP</option><option>COMGAP</option><option>GABAER</option><option>SAC</option><option>ANAC</option><option>OPR_AD</option><option>PREF</option><option>GOV</option><option>OUTRO</option>
          </select>
        </label>
        <label>Solicitada em <input type="datetime-local" id="sgSolic"></label>
        <menu>
          <button id="btnSalvarSg" type="button">Salvar</button>
          <button type="button" id="btnCancelarSg">Cancelar</button>
        </menu>
        <div id="sgMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#btnSalvarSg').addEventListener('click', async ev => { ev.preventDefault(); await cadSig(dlg); });
    dlg.querySelector('#btnCancelarSg').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function cadSig(dlg) {
    if (!currentProcId) return U.setMsg('sgMsg', 'Selecione um processo.', true);
    const numbers = parseSigNumbers(dlg.querySelector('#sgNums')?.value || '');
    const payload = {
      process_id: currentProcId,
      type: dlg.querySelector('#sgTipo')?.value || 'COMAE',
      requested_at: dlg.querySelector('#sgSolic')?.value ? new Date(dlg.querySelector('#sgSolic').value).toISOString() : new Date().toISOString(),
      numbers,
      status: 'SOLICITADO'
    };
    try {
      const u = await getUser();
      if (!u) return U.setMsg('sgMsg', 'Sessão expirada.', true);
      const { error } = await sb.from('sigadaer').insert({ ...payload, created_by: u.id });
      if (error) throw error;
      dlg.close();
      await reloadLists();
    } catch (e) {
      U.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  // === Ações de atualização de status (dialogs) ===

  function showOpRecForm(id) {
    editingOpId = id;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Recebida em <input type="datetime-local" id="opRecInput"></label>
        <menu>
          <button id="btnSalvarOpRec" type="button">Salvar</button>
          <button type="button" id="btnCancelarOpRec">Cancelar</button>
        </menu>
        <div id="opMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); editingOpId = null; });
    dlg.querySelector('#btnSalvarOpRec').addEventListener('click', async ev => { ev.preventDefault(); await salvarOpRec(dlg); });
    dlg.querySelector('#btnCancelarOpRec').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  function showOpFinForm(id) {
    editingOpId = id;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Finalizada em <input type="datetime-local" id="opFinInput"></label>
        <menu>
          <button id="btnSalvarOpFin" type="button">Salvar</button>
          <button type="button" id="btnCancelarOpFin">Cancelar</button>
        </menu>
        <div id="opMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); editingOpId = null; });
    dlg.querySelector('#btnSalvarOpFin').addEventListener('click', async ev => { ev.preventDefault(); await salvarOpFin(dlg); });
    dlg.querySelector('#btnCancelarOpFin').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function salvarOpRec(dlg) {
    if (!editingOpId) return;
    const input = dlg.querySelector('#opRecInput');
    const dt = input && input.value ? new Date(input.value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('internal_opinions')
        .update({ status: 'RECEBIDO', received_at: dt })
        .eq('id', editingOpId);
      if (error) throw error;
      dlg.close();
      await reloadLists();
    } catch (e) {
      U.setMsg('opMsg', e.message || String(e), true);
    }
  }

  async function salvarOpFin(dlg) {
    if (!editingOpId) return;
    const input = dlg.querySelector('#opFinInput');
    const dt = input && input.value ? new Date(input.value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('internal_opinions')
        .update({ status: 'FINALIZADO', finalized_at: dt })
        .eq('id', editingOpId);
      if (error) throw error;
      dlg.close();
      await reloadLists();
    } catch (e) {
      U.setMsg('opMsg', e.message || String(e), true);
    }
  }

  function showNtLidaForm(id) {
    editingNtId = id;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Lida em <input type="datetime-local" id="ntLidaInput"></label>
        <menu>
          <button id="btnSalvarNtLida" type="button">Salvar</button>
          <button type="button" id="btnCancelarNtLida">Cancelar</button>
        </menu>
        <div id="ntMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); editingNtId = null; });
    dlg.querySelector('#btnSalvarNtLida').addEventListener('click', async ev => { ev.preventDefault(); await salvarNtLida(dlg); });
    dlg.querySelector('#btnCancelarNtLida').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function salvarNtLida(dlg) {
    if (!editingNtId) return;
    const input = dlg.querySelector('#ntLidaInput');
    const dt = input && input.value ? new Date(input.value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('notifications')
        .update({ status: 'LIDA', read_at: dt })
        .eq('id', editingNtId);
      if (error) throw error;
      dlg.close();
      await reloadLists();
    } catch (e) {
      U.setMsg('ntMsg', e.message || String(e), true);
    }
  }

  function showSgExpForm(id) {
    editingSgId = id;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Expedida em <input type="datetime-local" id="sgExpInput"></label>
        <menu>
          <button id="btnSalvarSgExp" type="button">Salvar</button>
          <button type="button" id="btnCancelarSgExp">Cancelar</button>
        </menu>
        <div id="sgMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); editingSgId = null; });
    dlg.querySelector('#btnSalvarSgExp').addEventListener('click', async ev => { ev.preventDefault(); await salvarSgExp(dlg); });
    dlg.querySelector('#btnCancelarSgExp').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  function showSgRecForm(id) {
    editingSgId = id;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <label>Recebida em <input type="datetime-local" id="sgRecInput"></label>
        <menu>
          <button id="btnSalvarSgRec" type="button">Salvar</button>
          <button type="button" id="btnCancelarSgRec">Cancelar</button>
        </menu>
        <div id="sgMsg" class="msg"></div>
      </form>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); editingSgId = null; });
    dlg.querySelector('#btnSalvarSgRec').addEventListener('click', async ev => { ev.preventDefault(); await salvarSgRec(dlg); });
    dlg.querySelector('#btnCancelarSgRec').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function salvarSgExp(dlg) {
    if (!editingSgId) return;
    const input = dlg.querySelector('#sgExpInput');
    const dt = input && input.value ? new Date(input.value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('sigadaer')
        .update({ status: 'EXPEDIDO', expedit_at: dt })
        .eq('id', editingSgId);
      if (error) throw error;
      dlg.close();
      await reloadLists();
    } catch (e) {
      U.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  async function salvarSgRec(dlg) {
    if (!editingSgId) return;
    const input = dlg.querySelector('#sgRecInput');
    const dt = input && input.value ? new Date(input.value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('sigadaer')
        .update({ status: 'RECEBIDO', received_at: dt })
        .eq('id', editingSgId);
      if (error) throw error;
      dlg.close();
      await reloadLists();
    } catch (e) {
      U.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  // === Atualização de botões extras / listas ===

  async function reloadLists() {
    try {
      if (currentProcId) await updateExtraButtons();
    } catch {
      // ignore
    }
  }

  async function updateExtraButtons() {
    if (!currentProcId) {
      ['btnVerOpiniao','btnVerNotif','btnVerSig'].forEach(id => {
        const b = el(id); if (b) { b.disabled = true; b.classList.remove('active'); }
      });
      return;
    }
    try {
      const [op, nt, sg] = await Promise.all([
        sb.from('internal_opinions').select('*', { count: 'exact', head: true }).eq('process_id', currentProcId),
        sb.from('notifications').select('*', { count: 'exact', head: true }).eq('process_id', currentProcId),
        sb.from('sigadaer').select('*', { count: 'exact', head: true }).eq('process_id', currentProcId)
      ]);
      const pairs = [
        ['btnVerOpiniao', op.count || 0],
        ['btnVerNotif', nt.count || 0],
        ['btnVerSig', sg.count || 0]
      ];
      pairs.forEach(([id, c]) => {
        const b = el(id);
        if (b) {
          b.disabled = c === 0;
          b.classList.toggle('active', c > 0);
        }
      });
    } catch {
      // ignore
    }
  }

  function bindEvents() {
    Array.from(document.querySelectorAll('[data-tab]')).forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });
    showTab('proc');

    if (el('btnObraConcluida')) el('btnObraConcluida').addEventListener('click', toggleObraConcluida);
    if (el('btnSalvarProc')) el('btnSalvarProc').addEventListener('click', (ev) => { ev.preventDefault(); upsertProcess(); });
    if (el('btnNovoProc')) el('btnNovoProc').addEventListener('click', (ev) => { ev.preventDefault(); clearProcessForm(); });
    if (el('btnBuscarProc')) el('btnBuscarProc').addEventListener('click', (ev) => { ev.preventDefault(); buscarProcesso(); });
    if (el('btnLimparProc')) el('btnLimparProc').addEventListener('click', (ev) => { ev.preventDefault(); clearProcessForm(); loadProcessList(); });
    if (el('procNUP')) el('procNUP').addEventListener('input', () => { currentNUP = el('procNUP').value.trim(); syncNupFields(); });

    // Novos botões de cadastro (dialogs)
    if (el('btnNovoOpiniao')) el('btnNovoOpiniao').addEventListener('click', (ev) => { ev.preventDefault(); showCadOpiniaoForm(); });
    if (el('btnNovaNotif')) el('btnNovaNotif').addEventListener('click', (ev) => { ev.preventDefault(); showCadNotifForm(); });
    if (el('btnNovoSig')) el('btnNovoSig').addEventListener('click', (ev) => { ev.preventDefault(); showCadSigForm(); });

    // Botões para visualizar listas em popup
    if (el('btnVerOpiniao')) el('btnVerOpiniao').addEventListener('click', (ev) => { ev.preventDefault(); showOpiniaoPopup(); });
    if (el('btnVerNotif')) el('btnVerNotif').addEventListener('click', (ev) => { ev.preventDefault(); showNotifPopup(); });
    if (el('btnVerSig')) el('btnVerSig').addEventListener('click', (ev) => { ev.preventDefault(); showSigPopup(); });

    // formulário principal permanece oculto por padrão
  }

  async function init() {
    bindEvents();
    clearProcessForm();     // apenas NUP + Buscar habilitados
    await loadProcessList();
  }

  return { init, reloadLists };
})();
