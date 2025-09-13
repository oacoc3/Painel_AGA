/* public/modules/processos.js
 * Módulo Processos — busca/cadastro/edição + controle de abas.
 * Requisitos:
 *  - Ao abrir: somente NUP + Buscar habilitados
 *  - Buscar NUP:
 *      * se existe: preenche formulário, habilita demais abas, leva item ao topo da lista
 *      * se não existe: pergunta se deseja criar e habilita só a aba Processo até salvar
 *  - Selecionar linha na lista: carrega e habilita tudo
 *  - Botão Salvar só habilita quando algo muda; após salvar, volta a desabilitar
 *  - Observações armazenadas em tabela separada (process_observations)
*/

window.Modules = window.Modules || {};
window.Modules.processos = (() => {
  let currentProcId = null;
  let currentNUP = '';
  let editingOpId = null;
  let editingNtId = null;
  let editingSgId = null;
  let popupProcId = null;
  // Paginação da lista de processos (HTML-first + Supabase range)
  let PROC_PAGE = 1;
  const PROC_PAGE_SIZE = 50; // ajuste se necessário

  function renderProcPagination({ page, pagesTotal, count }) {
    const box = el('procLista');
    if (!box) return;
    let pager = box.querySelector('.pager');
    if (!pager) {
      pager = document.createElement('div');
      pager.className = 'pager';
      box.appendChild(pager);
    }
    const disablePrev = page <= 1;
    const disableNext = page >= pagesTotal;
    pager.innerHTML = `
      <div class="row" style="display:flex;gap:.5rem;align-items:center;justify-content:flex-end;margin-top:.5rem;">
        <button type="button" id="procFirstPage" ${disablePrev ? 'disabled' : ''}>&laquo;</button>
        <button type="button" id="procPrevPage" ${disablePrev ? 'disabled' : ''}>&lsaquo;</button>
        <span id="procPagerInfo">${page} / ${pagesTotal} (${count} itens)</span>
        <button type="button" id="procNextPage" ${disableNext ? 'disabled' : ''}>&rsaquo;</button>
        <button type="button" id="procLastPage" ${disableNext ? 'disabled' : ''}>&raquo;</button>
      </div>`;
    pager.querySelector('#procFirstPage')?.addEventListener('click', () => loadProcessList({ page: 1 }));
    pager.querySelector('#procPrevPage')?.addEventListener('click', () => loadProcessList({ page: Math.max(1, (PROC_PAGE - 1)) }));
    pager.querySelector('#procNextPage')?.addEventListener('click', () => loadProcessList({ page: PROC_PAGE + 1 }));
    pager.querySelector('#procLastPage')?.addEventListener('click', () => loadProcessList({ page: pagesTotal }));
  }


  const PROCESS_STATUSES = ['CONFEC','REV-OACO','APROV','ICA-PUB','EDICAO','AGD-LEIT','ANADOC','ANATEC-PRE','ANATEC','ANAICA','SOB-DOC','SOB-TEC','SOB-PDIR','SOB-EXPL','ARQ'];
  const STATUS_OPTIONS = PROCESS_STATUSES.map(s => `<option>${s}</option>`).join('');

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
        return new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(d);
      } catch { return ''; }
    },
    fmtDateTime(iso) {
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        const dt = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).format(d);
        const tm = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit'
        }).format(d);
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
    ['btnSalvarProc','btnNovoProc']
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

    setProcFormEnabled(false);
    setOtherTabsEnabled(false);
    toggleProcFields(false);
    toggleOtherTabsVisible(false);
    toggleProcActions(false);
    U.setMsg('procMsg', '');
  }

  function bindProcFormTracking() {
    // campos de observação removidos
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

        setProcFormEnabled(true);
        toggleProcFields(true);
        bindProcFormTracking();
        toggleProcActions(true);
        if (el('btnSalvarProc')) el('btnSalvarProc').disabled = true;
        if (el('btnNovoProc')) el('btnNovoProc').disabled = false;

        U.setMsg('procMsg', 'Processo encontrado.');
        await loadProcessList();
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
              ${STATUS_OPTIONS}
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

    const payload = { nup };

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
          <select id="stNovo">${STATUS_OPTIONS}</select>
        </label>
        <label>Desde <input type="datetime-local" id="stDesde"></label>
        <menu>
          <button value="cancel">Cancelar</button>
          <button id="stSalvar" value="default">Salvar</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    const sel = dlg.querySelector('#stNovo');
    if (sel) sel.value = PROCESS_STATUSES.includes(curStatus) ? curStatus : 'ANATEC-PRE';
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

  async function deleteProcess(procId) {
    if (!procId) return;
    // remove dependências que referenciam o processo antes de apagar o registro principal
    const tables = ['internal_opinions', 'notifications', 'sigadaer',
      'process_observations', 'checklist_responses', 'history'];
    await Promise.all(tables.map(t => sb.from(t).delete().eq('process_id', procId)));

    try {
      const { error } = await sb.from('processes').delete().eq('id', procId);
      if (error) throw error;
      if (String(currentProcId) === String(procId)) clearProcessForm();
      await loadProcessList();
    } catch (e) {
      alert(e.message || e);
    }
  }

  // === novo helper para seleção da linha ===
  async function selectProcess(row) {
    if (!row) return;
    currentProcId = row.id;
    currentNUP = row.nup;
    syncNupFields();

    if (el('procNUP')) el('procNUP').value = row.nup;

    setProcFormEnabled(true);
    toggleProcFields(true);
    bindProcFormTracking();
    toggleProcActions(true);
    if (el('btnSalvarProc')) el('btnSalvarProc').disabled = true;
    if (el('btnNovoProc')) el('btnNovoProc').disabled = false;

    U.setMsg('procMsg', 'Processo selecionado.');
    await loadProcessList();
  }

  
  async function loadProcessList({ page = PROC_PAGE, pageSize = PROC_PAGE_SIZE } = {}) {
    const box = el('procLista');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';

    try {
      // paginação via Supabase range
      const p = Math.max(1, Number(page) || 1);
      const size = Math.max(1, Number(pageSize) || PROC_PAGE_SIZE);
      const from = (p - 1) * size;
      const to = from + size - 1;

      const { data, count, error } = await sb
        .from('processes')
        .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida,created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const rows = Array.isArray(data) ? [...data] : [];
      const ids = rows.map(r => r.id);

      // Busca presença nas tabelas relacionadas apenas para os IDs da página atual
      const [op, nt, sg, ob] = await Promise.all([
        sb.from('internal_opinions').select('process_id').in('process_id', ids),
        sb.from('notifications').select('process_id').in('process_id', ids),
        sb.from('sigadaer').select('process_id').in('process_id', ids),
        sb.from('process_observations').select('process_id').in('process_id', ids)
      ]);
      const opSet = new Set((op.data || []).map(o => o.process_id));
      const ntSet = new Set((nt.data || []).map(o => o.process_id));
      const sgSet = new Set((sg.data || []).map(o => o.process_id));
      const obSet = new Set((ob.data || []).map(o => o.process_id));

      if (currentProcId) {
        const cur = String(currentProcId);
        rows.sort((a, b) => (String(a.id) === cur ? -1 : (String(b.id) === cur ? 1 : 0)));
      }

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Histórico</th><th>NUP</th><th>Tipo</th><th>1ª Entrada DO-AGA</th>
          <th>Status</th><th>Término de Obra</th><th>Obs.</th><th></th><th></th><th></th><th></th>
        </tr>`;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      rows.forEach(r => {
        const tr = document.createElement('tr');
        const isCurrent = String(r.id) === String(currentProcId);
        if (isCurrent) tr.classList.add('selected');
        const hasOp = opSet.has(r.id);
        const hasNt = ntSet.has(r.id);
        const hasSg = sgSet.has(r.id);
        const hasOb = obSet.has(r.id);
        const stTxt = `${r.status || ''}${r.status_since ? '<br><small>' + U.fmtDateTime(r.status_since) + '</small>' : ''}`;
        const stBtn = isCurrent ? `<button type="button" class="editBtn editStatus">Editar</button>` : '';
        const obTxt = r.obra_concluida ? 'Concluída' : (r.obra_termino_date ? U.fmtDate(r.obra_termino_date) : '');
        const obBtn = isCurrent ? `<button type="button" class="editBtn toggleObra">${r.obra_concluida ? 'Desmarcar' : 'Marcar'}</button>` : '';
        const opBtn = hasOp ? '<button type="button" class="dot opBtn">P</button>' : '';
        const ntBtn = hasNt ? '<button type="button" class="dot ntBtn">N</button>' : '';
        const sgBtn = hasSg ? '<button type="button" class="dot sgBtn">S</button>' : '';
        tr.innerHTML = `
          <td class="align-center"><button type="button" class="historyBtn">Ver</button></td>
          <td>${r.nup || ''}</td>
          <td>${r.type || ''}</td>
          <td>${U.fmtDate(r.first_entry_date)}</td>
          <td>${stTxt} ${stBtn}</td>
          <td>${obTxt} ${obBtn}</td>
          <td>${hasOb ? '●' : ''}</td>
          <td class="align-center">${opBtn}</td>
          <td class="align-center">${ntBtn}</td>
          <td class="align-center">${sgBtn}</td>
          <td class="align-right"><button type="button" class="selectBtn">Selecionar</button></td>
        `;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      // Renderizar no container
      box.innerHTML = '';
      box.appendChild(table);

      // Atualiza estado de página e renderiza paginação
      PROC_PAGE = p;
      const pagesTotal = typeof count === 'number' ? Math.max(1, Math.ceil(count / size)) : 1;
      renderProcPagination({ page: p, pagesTotal, count: count || rows.length });

      // Bind row events (mantém comportamento existente)
      tbody.addEventListener('click', async (ev) => {
        const tr = ev.target.closest('tr');
        if (!tr) return;
        const idx = Array.from(tbody.children).indexOf(tr);
        const row = rows[idx];
        if (!row) return;
        if (ev.target.closest('.selectBtn')) return selectProcess(row);
        if (ev.target.closest('.historyBtn')) return showHistoryPopup(row.id);
        if (ev.target.closest('.opBtn')) return showOpiniaoPopup(row.id);
        if (ev.target.closest('.ntBtn')) return showNotifPopup(row.id);
        if (ev.target.closest('.sgBtn')) return showSigPopup(row.id);
        if (ev.target.closest('.editStatus')) return showStatusEditPopup(row.id, row.status, row.status_since);
        if (ev.target.closest('.toggleObra')) return showObraEditPopup(row.id, row.obra_termino_date, row.obra_concluida);
      });
    } catch (err) {
      box.innerHTML = '<div class="msg error">Falha ao carregar a lista.</div>';
      console.error(err);
    }
  }


  async function loadObsList(procId, targetId = 'obsLista') {
    const box = el(targetId);
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('process_observations')
        .select('id,text,created_at')
        .eq('process_id', procId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      Utils.renderTable(box, [
        { key: 'created_at', label: 'Data', value: r => U.fmtDateTime(r.created_at) },
        { key: 'text', label: 'Observação' }
      ], rows);
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
        { key: 'received_at', label: 'Recebida em', value: r => U.fmtDateTime(r.receb_at || r.received_at) },
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

  async function showOpiniaoPopup(procId = currentProcId) {
    if (!procId) return;
    popupProcId = procId;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="opListaPop" class="table scrolly">Carregando…</div><menu><button type="button" id="opNew">Novo</button><button type="button" id="opClose">Fechar</button></menu>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); popupProcId = null; });
    dlg.querySelector('#opClose').addEventListener('click', () => dlg.close());
    dlg.querySelector('#opNew').addEventListener('click', () => showCadOpiniaoForm(procId));
    dlg.showModal();
    await loadOpiniaoList(procId, 'opListaPop');
  }

  async function showNotifPopup(procId = currentProcId) {
    if (!procId) return;
    popupProcId = procId;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="ntListaPop" class="table scrolly">Carregando…</div><menu><button type="button" id="ntNew">Novo</button><button type="button" id="ntClose">Fechar</button></menu>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); popupProcId = null; });
    dlg.querySelector('#ntClose').addEventListener('click', () => dlg.close());
    dlg.querySelector('#ntNew').addEventListener('click', () => showCadNotifForm(procId));
    dlg.showModal();
    await loadNotifList(procId, 'ntListaPop');
  }

  async function showSigPopup(procId = currentProcId) {
    if (!procId) return;
    popupProcId = procId;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="sgListaPop" class="table scrolly">Carregando…</div><menu><button type="button" id="sgNew">Novo</button><button type="button" id="sgClose">Fechar</button></menu>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); popupProcId = null; });
    dlg.querySelector('#sgClose').addEventListener('click', () => dlg.close());
    dlg.querySelector('#sgNew').addEventListener('click', () => showCadSigForm(procId));
    dlg.showModal();
    await loadSIGList(procId, 'sgListaPop');
  }

  async function showObsPopup(procId = currentProcId) {
    if (!procId) return;
    popupProcId = procId;
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="obsListaPop" class="table scrolly">Carregando…</div><div id="obsForm" class="hidden"><textarea id="obsTexto" rows="3"></textarea></div><menu><button type="button" id="obsNova">Nova</button><button type="button" id="obsSalvar" disabled>Salvar</button><button type="button" id="obsFechar">Cancelar</button></menu><div id="obsMsg" class="msg"></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { dlg.remove(); popupProcId = null; });
    dlg.querySelector('#obsFechar').addEventListener('click', () => dlg.close());
    dlg.querySelector('#obsNova').addEventListener('click', () => {
      const box = dlg.querySelector('#obsForm');
      box?.classList.remove('hidden');
      const txt = dlg.querySelector('#obsTexto');
      if (txt) txt.value = '';
      dlg.querySelector('#obsSalvar')?.removeAttribute('disabled');
    });
    dlg.querySelector('#obsSalvar').addEventListener('click', async ev => {
      ev.preventDefault();
      await salvarObs(procId, dlg);
    });
    dlg.showModal();
    await loadObsList(procId, 'obsListaPop');
  }

  async function salvarObs(procId, dlg) {
    const txt = dlg.querySelector('#obsTexto')?.value.trim();
    if (!txt) return;
    try {
      const { error } = await sb
        .from('process_observations')
        .insert({ process_id: procId, text: txt });
      if (error) throw error;
      dlg.querySelector('#obsForm')?.classList.add('hidden');
      dlg.querySelector('#obsSalvar')?.setAttribute('disabled', 'true');
      await loadObsList(procId, 'obsListaPop');
      await loadProcessList();
    } catch (e) {
      U.setMsg('obsMsg', e.message || String(e), true);
    }
  }

  function formatHistoryDetails(det) {
    if (!det) return '';
    try {
      const obj = typeof det === 'string' ? JSON.parse(det) : det;
      return Object.entries(obj)
        .map(([k, v]) => {
          if (v == null) return null;
          const key = k.replace(/_/g, ' ');
          let val = v;
          if (typeof v === 'object') {
            val = JSON.stringify(v);
          } else if (typeof v === 'string') {
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
              val = U.fmtDateTime(v);
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
              val = U.fmtDate(v);
            }
          }
          return `${key}: ${val}`;
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

  function showCadOpiniaoForm(procId = currentProcId) {
    if (!procId) return;
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
    dlg.querySelector('#btnSalvarOp').addEventListener('click', async ev => { ev.preventDefault(); await cadOpiniao(dlg, procId); });
    dlg.querySelector('#btnCancelarOp').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function cadOpiniao(dlg, procId = currentProcId) {
    if (!procId) return U.setMsg('opMsg', 'Selecione um processo.', true);
    const payload = {
      process_id: procId,
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
      await loadProcessList();
      if (el('opListaPop')) await loadOpiniaoList(procId, 'opListaPop');
    } catch (e) {
      U.setMsg('opMsg', e.message || String(e), true);
    }
  }

  function showCadNotifForm(procId = currentProcId) {
    if (!procId) return;
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
    dlg.querySelector('#btnSalvarNt').addEventListener('click', async ev => { ev.preventDefault(); await cadNotif(dlg, procId); });
    dlg.querySelector('#btnCancelarNt').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function cadNotif(dlg, procId = currentProcId) {
    if (!procId) return U.setMsg('ntMsg', 'Selecione um processo.', true);
    const payload = {
      process_id: procId,
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
      await loadProcessList();
      if (el('ntListaPop')) await loadNotifList(procId, 'ntListaPop');
    } catch (e) {
      U.setMsg('ntMsg', e.message || String(e), true);
    }
  }

  function showCadSigForm(procId = currentProcId) {
    if (!procId) return;
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
    dlg.querySelector('#btnSalvarSg').addEventListener('click', async ev => { ev.preventDefault(); await cadSig(dlg, procId); });
    dlg.querySelector('#btnCancelarSg').addEventListener('click', () => dlg.close());
    dlg.showModal();
  }

  async function cadSig(dlg, procId = currentProcId) {
    if (!procId) return U.setMsg('sgMsg', 'Selecione um processo.', true);
    const numbers = parseSigNumbers(dlg.querySelector('#sgNums')?.value || '');
    const payload = {
      process_id: procId,
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
      await loadProcessList();
      if (el('sgListaPop')) await loadSIGList(procId, 'sgListaPop');
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
      await loadProcessList();
      if (el('opListaPop')) await loadOpiniaoList(popupProcId || currentProcId, 'opListaPop');
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
      await loadProcessList();
      if (el('opListaPop')) await loadOpiniaoList(popupProcId || currentProcId, 'opListaPop');
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
      await loadProcessList();
      if (el('ntListaPop')) await loadNotifList(popupProcId || currentProcId, 'ntListaPop');
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
      await loadProcessList();
      if (el('sgListaPop')) await loadSIGList(popupProcId || currentProcId, 'sgListaPop');
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
      await loadProcessList();
      if (el('sgListaPop')) await loadSIGList(popupProcId || currentProcId, 'sgListaPop');
    } catch (e) {
      U.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  // === Atualização de botões extras / listas ===

  async function reloadLists() {
    await loadProcessList();
  }

  function bindEvents() {
    Array.from(document.querySelectorAll('[data-tab]')).forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });
    showTab('proc');

    if (el('btnSalvarProc')) el('btnSalvarProc').addEventListener('click', (ev) => { ev.preventDefault(); upsertProcess(); });
    if (el('btnNovoProc')) el('btnNovoProc').addEventListener('click', (ev) => { ev.preventDefault(); clearProcessForm(); });
    if (el('btnBuscarProc')) el('btnBuscarProc').addEventListener('click', (ev) => { ev.preventDefault(); buscarProcesso(); });
    if (el('btnLimparProc')) el('btnLimparProc').addEventListener('click', (ev) => { ev.preventDefault(); clearProcessForm(); loadProcessList(); });
    if (el('procNUP')) el('procNUP').addEventListener('input', () => { currentNUP = el('procNUP').value.trim(); syncNupFields(); });

    // formulário principal permanece oculto por padrão
  }

  async function init() {
    bindEvents();
    clearProcessForm();     // apenas NUP + Buscar habilitados
    await loadProcessList();

    // suporte à pré-seleção de NUP (ex.: navegar a partir de outra view)
    const pre = sessionStorage.getItem('procPreSelect');
    if (pre && el('procNUP')) {
      sessionStorage.removeItem('procPreSelect');
      el('procNUP').value = pre;
      await buscarProcesso();
    }
  }

  return { init, reloadLists };
})();
