// public/modules/processos.js
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

  // Normaliza entrada de NUP para o formato do banco: XXXXXX/XXXX-00
  // Aceita NUP colado com/sem prefixo de 5 dígitos, com ou sem pontuação.
  function normalizeNupToBankFormat(input) {
    const digits = String(input || '').replace(/\D/g, '');
    if (!digits) return '';
    // Usa os ÚLTIMOS 10 dígitos como núcleo (6 + 4), ignorando prefixo quando houver.
    if (digits.length < 10) return input || '';
    const core = digits.slice(-10);
    const part1 = core.slice(0, 6);
    const part2 = core.slice(6, 10);
    return `${part1}/${part2}-00`;
  }

  function renderProcPagination({ page, pagesTotal, count }) {
    const box = el('procLista');
    if (!box) return;
    let pager = box.querySelector('.pager');
    if (!pager) {
      pager = document.createElement('div');
      pager.className = 'pager';
    }
    if (box.firstElementChild !== pager) {
      box.insertBefore(pager, box.firstElementChild);
    }
    const disablePrev = page <= 1;
    const disableNext = page >= pagesTotal;
    pager.innerHTML = `
      <div class="row" style="display:flex;gap:.5rem;align-items:center;justify-content:flex-end;margin-bottom:.5rem;">
        <button type="button" id="procFirstPage" ${disablePrev ? 'disabled' : ''}>&laquo;</button>
        <button type="button" id="procPrevPage" ${disablePrev ? 'disabled' : ''}>&lsaquo;</button>
        <span id="procPagerInfo">${page} / ${pagesTotal} (${count} itens)</span>
        <button type="button" id="procNextPage" ${disableNext ? 'disabled' : ''}>&rsaquo;</button>
        <button type="button" id="procLastPage" ${disableNext ? 'disabled' : ''}>&raquo;</button>
      </div>`;
    pager.querySelector('#procFirstPage')?.addEventListener('click', () => loadProcessList({ page: 1 }));
    pager.querySelector('#procPrevPage')?.addEventListener('click', () => loadProcessList({ page: Math.max(1, page - 1) }));
    pager.querySelector('#procNextPage')?.addEventListener('click', () => loadProcessList({ page: Math.min(pagesTotal, page + 1) }));
    pager.querySelector('#procLastPage')?.addEventListener('click', () => loadProcessList({ page: pagesTotal }));
  }

  function setProcFormEnabled(enabled) {
    ['procType','procStatus','procStatusDate','procFirstEntryDate','procObraTerminoDate','procObraConcluida'].forEach(id => {
      const e = el(id);
      if (e) e.disabled = !enabled;
    });
    if (el('btnSalvarProc')) el('btnSalvarProc').disabled = !enabled;
    if (el('btnNovoProc')) el('btnNovoProc').disabled = false;
    if (el('btnBuscarProc')) el('btnBuscarProc').disabled = false;
    if (el('procNUP')) el('procNUP').disabled = false;
  }

  function setOtherTabsEnabled(enabled) {
    ['opType','opStatus','opStatusDate','opRequestedAt','ntType','ntStatus','ntReadAt','sgType','sgStatus','sgExpeditAt','sgReceivedAt','sgDeadlineDays']
      .forEach(id => { const e = el(id); if (e) e.disabled = !enabled; });
    ['btnSalvarOpiniao','btnSalvarNotif','btnSalvarSigadaer'].forEach(id => { const b = el(id); if (b) b.disabled = !enabled; });
  }

  function toggleProcFields(show) {
    const box = el('tabProcFields');
    if (box) box.style.display = show ? 'block' : 'none';
  }

  function toggleOtherTabsVisible(show) {
    const ids = ['tabOpiniao','tabNotif','tabSig'];
    ids.forEach(id => { const box = el(id); if (box) box.style.display = show ? 'block' : 'none'; });
  }

  function toggleProcActions(show) {
    const box = el('tabProcActions');
    if (box) box.style.display = show ? 'block' : 'none';
  }

  function el(id) { return document.getElementById(id); }

  function U_confirm(msg) {
    return new Promise(res => {
      const ok = window.confirm(msg);
      res(ok);
    });
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
    let nup = (el('procNUP')?.value || '').trim();
    nup = normalizeNupToBankFormat(nup);
    if (el('procNUP')) el('procNUP').value = nup;
    if (!nup) return U.setMsg('procMsg', 'Informe o NUP (Número Único de Protocolo).', true);

    U.setMsg('procMsg', 'Buscando…');
    try {
      const { data, error } = await sb
        .from('processes')
        .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida,created_at')
        .eq('nup', nup)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        currentProcId = data.id;
        currentNUP = data.nup;
        syncNupFields();

        setProcFormEnabled(true);
        setOtherTabsEnabled(true);
        toggleProcFields(true);
        toggleOtherTabsVisible(true);
        toggleProcActions(true);

        // Preenche campos
        if (el('procType')) el('procType').value = data.type || '';
        if (el('procStatus')) el('procStatus').value = data.status || '';
        if (el('procStatusDate')) el('procStatusDate').value = Utils.dateOnly(data.status_since);
        if (el('procFirstEntryDate')) el('procFirstEntryDate').value = Utils.dateOnly(data.first_entry_date);
        if (el('procObraTerminoDate')) el('procObraTerminoDate').value = Utils.dateOnly(data.obra_termino_date);
        if (el('procObraConcluida')) el('procObraConcluida').checked = !!data.obra_concluida;

        U.setMsg('procMsg', 'Processo carregado.');
        bringProcessToTopInList(currentProcId);
      } else {
        // não existe: perguntar se deseja criar
        const ok = await U_confirm('Processo não encontrado. Deseja criar este NUP?');
        if (!ok) {
          U.setMsg('procMsg', 'Operação cancelada.');
          return;
        }
        currentProcId = null;
        currentNUP = nup;
        syncNupFields();

        setProcFormEnabled(true);
        setOtherTabsEnabled(false);
        toggleProcFields(true);
        toggleOtherTabsVisible(false);
        toggleProcActions(true);

        U.setMsg('procMsg', 'Informe os dados do processo e clique em Salvar.');
      }
    } catch (e) {
      U.setMsg('procMsg', e.message || String(e), true);
    }
  }

  function bringProcessToTopInList(id) {
    const tbody = document.querySelector('#procLista table tbody');
    if (!tbody || !id) return;
    const row = tbody.querySelector(`tr[data-id="${id}"]`);
    if (!row) return;
    tbody.insertBefore(row, tbody.firstElementChild);
  }

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
  }

  function guardProcessWrite(msgId) {
    if (!window.SafetyGuards?.canWriteProcess()) {
      U.setMsg(msgId, 'Você não tem permissão para alterar processos.', true);
      return false;
    }
    return true;
  }

  async function loadProcessList({ page = PROC_PAGE } = {}) {
    PROC_PAGE = page;
    const { count, error: countErr } = await sb.from('processes').select('*', { count: 'exact', head: true });
    if (countErr) {
      U.setMsg('procMsg', countErr.message || String(countErr), true);
      return;
    }
    const pagesTotal = Math.max(1, Math.ceil(count / PROC_PAGE_SIZE));
    const from = (page - 1) * PROC_PAGE_SIZE;
    const to = from + PROC_PAGE_SIZE - 1;

    const { data, error } = await sb
      .from('processes')
      .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida,created_at')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      U.setMsg('procMsg', error.message || String(error), true);
      return;
    }

    renderProcessList(data || []);
    renderProcPagination({ page, pagesTotal, count });
  }

  function renderProcessList(rows) {
    const box = el('procLista'); if (!box) return;
    if (!rows) rows = [];
    let tbl = box.querySelector('table');
    if (!tbl) {
      tbl = document.createElement('table');
      tbl.innerHTML = `
        <thead>
          <tr>
            <th>NUP</th><th>Tipo</th><th>Status</th><th>Desde</th><th>Entrada</th><th>Obra</th><th>Concluída</th><th>Criado</th><th>Ações</th>
          </tr>
        </thead>
        <tbody></tbody>`;
      box.appendChild(tbl);
    }
    const tbody = tbl.querySelector('tbody');
    tbody.innerHTML = rows.map(r => `
      <tr data-id="${r.id}">
        <td>${r.nup || ''}</td>
        <td>${r.type || ''}</td>
        <td>${r.status || ''}</td>
        <td>${Utils.fmtDate(r.status_since)}</td>
        <td>${Utils.fmtDate(r.first_entry_date)}</td>
        <td>${Utils.fmtDate(r.obra_termino_date)}</td>
        <td>${r.obra_concluida ? 'Sim' : 'Não'}</td>
        <td>${Utils.fmtDateTime(r.created_at)}</td>
        <td><button type="button" class="mini" data-action="edit">Editar</button></td>
      </tr>`).join('');

    tbody.querySelectorAll('button[data-action="edit"]').forEach(b => {
      b.addEventListener('click', async () => {
        const tr = b.closest('tr');
        const id = tr?.dataset?.id;
        if (!id) return;
        await selecionarDaLista(id);
      });
    });
  }

  async function selecionarDaLista(id) {
    U.setMsg('procMsg', 'Carregando…');
    try {
      const { data, error } = await sb
        .from('processes')
        .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida,created_at')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return;

      currentProcId = data.id;
      currentNUP = data.nup || '';
      syncNupFields();

      setProcFormEnabled(true);
      setOtherTabsEnabled(true);
      toggleProcFields(true);
      toggleOtherTabsVisible(true);
      toggleProcActions(true);

      if (el('procNUP')) el('procNUP').value = currentNUP;
      if (el('procType')) el('procType').value = data.type || '';
      if (el('procStatus')) el('procStatus').value = data.status || '';
      if (el('procStatusDate')) el('procStatusDate').value = Utils.dateOnly(data.status_since);
      if (el('procFirstEntryDate')) el('procFirstEntryDate').value = Utils.dateOnly(data.first_entry_date);
      if (el('procObraTerminoDate')) el('procObraTerminoDate').value = Utils.dateOnly(data.obra_termino_date);
      if (el('procObraConcluida')) el('procObraConcluida').checked = !!data.obra_concluida;

      U.setMsg('procMsg', 'Processo carregado da lista.');
    } catch (e) {
      U.setMsg('procMsg', e.message || String(e), true);
    }
  }

  function parseDateInput(v) {
    return v ? new Date(v + 'T00:00:00') : null;
  }

  async function upsertProcess() {
    if (!guardProcessWrite('procMsg')) return;
    let nup = (el('procNUP')?.value || '').trim();
    nup = normalizeNupToBankFormat(nup);
    if (el('procNUP')) el('procNUP').value = nup;
    if (!nup) return U.setMsg('procMsg', 'Informe o NUP.', true);

    const payload = { nup };

    try {
      if (!currentProcId) {
        // criar
        payload.type = el('procType')?.value || null;
        payload.status = el('procStatus')?.value || null;
        payload.status_since = parseDateInput(el('procStatusDate')?.value || null);
        payload.first_entry_date = parseDateInput(el('procFirstEntryDate')?.value || null);
        payload.obra_termino_date = parseDateInput(el('procObraTerminoDate')?.value || null);
        payload.obra_concluida = !!(el('procObraConcluida')?.checked);

        const { data, error } = await sb.from('processes').insert(payload).select('id,nup').maybeSingle();
        if (error) throw error;
        currentProcId = data?.id || null;
        currentNUP = data?.nup || nup;
        syncNupFields();

        U.setMsg('procMsg', 'Processo criado com sucesso.');
      } else {
        // atualizar
        payload.type = el('procType')?.value || null;
        payload.status = el('procStatus')?.value || null;
        payload.status_since = parseDateInput(el('procStatusDate')?.value || null);
        payload.first_entry_date = parseDateInput(el('procFirstEntryDate')?.value || null);
        payload.obra_termino_date = parseDateInput(el('procObraTerminoDate')?.value || null);
        payload.obra_concluida = !!(el('procObraConcluida')?.checked);

        const { error } = await sb.from('processes').update(payload).eq('id', currentProcId);
        if (error) throw error;

        U.setMsg('procMsg', 'Processo atualizado com sucesso.');
      }

      if (el('btnSalvarProc')) el('btnSalvarProc').disabled = true;
      await loadProcessList();
    } catch (e) {
      U.setMsg('procMsg', e.message || String(e), true);
    }
  }

  // Popup para editar status do processo
  function showStatusEditPopup(id, curStatus, curDate) {
    if (!id) return;
    if (!guardProcessWrite('procMsg')) return;
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <form method="dialog" class="proc-popup">
        <h3>Alterar status</h3>
        <div class="row">
          <label class="grow">Status
            <select id="popupStatus"></select>
          </label>
          <label>Desde
            <input id="popupStatusDate" type="date" />
          </label>
        </div>
        <menu>
          <button value="cancel">Cancelar</button>
          <button value="ok" class="primary">Salvar</button>
        </menu>
      </form>`;
    document.body.appendChild(dlg);
    const sel = dlg.querySelector('#popupStatus');
    const dt = dlg.querySelector('#popupStatusDate');

    // preenche opções de status
    (window.Modules?.statuses?.OPTIONS || []).forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value; o.textContent = opt.label;
      if (String(opt.value) === String(curStatus)) o.selected = true;
      sel.appendChild(o);
    });

    if (curDate) dt.value = Utils.dateOnly(curDate);

    dlg.addEventListener('close', async () => {
      document.body.removeChild(dlg);
      if (dlg.returnValue !== 'ok') return;

      const newStatus = sel.value || null;
      const newDate = dt.value ? new Date(dt.value + 'T00:00:00') : null;

      try {
        const { error } = await sb
          .from('processes')
          .update({ status: newStatus, status_since: newDate })
          .eq('id', id);

        if (error) throw error;
        U.setMsg('procMsg', 'Status atualizado.');
        await selecionarDaLista(id);
      } catch (e) {
        U.setMsg('procMsg', e.message || String(e), true);
      }
    });
    dlg.showModal();
  }

  async function upsertOpinion() {
    if (!guardProcessWrite('procMsg')) return;
    if (!currentProcId) return U.setMsg('procMsg', 'Selecione um processo primeiro.', true);

    const payload = {
      process_id: currentProcId,
      nup: currentNUP || null,
      type: el('opType')?.value || null,
      status: el('opStatus')?.value || null,
      requested_at: parseDateInput(el('opRequestedAt')?.value || null)
    };

    try {
      let resp;
      if (!editingOpId) {
        resp = await sb.from('internal_opinions').insert(payload).select('id').maybeSingle();
      } else {
        resp = await sb.from('internal_opinions').update(payload).eq('id', editingOpId).select('id').maybeSingle();
      }
      if (resp.error) throw resp.error;

      editingOpId = resp.data?.id || editingOpId;
      U.setMsg('procMsg', 'Parecer salvo.');
    } catch (e) {
      U.setMsg('procMsg', e.message || String(e), true);
    }
  }

  async function upsertNotification() {
    if (!guardProcessWrite('procMsg')) return;
    if (!currentProcId) return U.setMsg('procMsg', 'Selecione um processo primeiro.', true);

    const payload = {
      process_id: currentProcId,
      nup: currentNUP || null,
      type: el('ntType')?.value || null,
      status: el('ntStatus')?.value || null,
      read_at: parseDateInput(el('ntReadAt')?.value || null)
    };

    try {
      let resp;
      if (!editingNtId) {
        resp = await sb.from('notifications').insert(payload).select('id').maybeSingle();
      } else {
        resp = await sb.from('notifications').update(payload).eq('id', editingNtId).select('id').maybeSingle();
      }
      if (resp.error) throw resp.error;

      editingNtId = resp.data?.id || editingNtId;
      U.setMsg('procMsg', 'Notificação salva.');
    } catch (e) {
      U.setMsg('procMsg', e.message || String(e), true);
    }
  }

  async function upsertSigadaer() {
    if (!guardProcessWrite('procMsg')) return;
    if (!currentProcId) return U.setMsg('procMsg', 'Selecione um processo primeiro.', true);

    const payload = {
      process_id: currentProcId,
      nup: currentNUP || null,
      type: el('sgType')?.value || null,
      status: el('sgStatus')?.value || null,
      expedit_at: parseDateInput(el('sgExpeditAt')?.value || null),
      received_at: parseDateInput(el('sgReceivedAt')?.value || null),
      deadline_days: (el('sgDeadlineDays')?.value || '').trim() ? Number(el('sgDeadlineDays').value) : null
    };

    try {
      let resp;
      if (!editingSgId) {
        resp = await sb.from('sigadaer').insert(payload).select('id').maybeSingle();
      } else {
        resp = await sb.from('sigadaer').update(payload).eq('id', editingSgId).select('id').maybeSingle();
      }
      if (resp.error) throw resp.error;

      editingSgId = resp.data?.id || editingSgId;
      U.setMsg('procMsg', 'SIGADAER salvo.');
    } catch (e) {
      U.setMsg('procMsg', e.message || String(e), true);
    }
  }

  async function reloadLists() {
    await loadProcessList();
  }

  function bindEvents() {
    // navegação por abas
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });
    showTab('proc');

    if (el('btnSalvarProc')) el('btnSalvarProc').addEventListener('click', (ev) => { ev.preventDefault(); upsertProcess(); });
    if (el('btnNovoProc')) el('btnNovoProc').addEventListener('click', (ev) => { ev.preventDefault(); clearProcessForm(); });
    if (el('btnBuscarProc')) el('btnBuscarProc').addEventListener('click', (ev) => { ev.preventDefault(); buscarProcesso(); });
    if (el('btnLimparProc')) el('btnLimparProc').addEventListener('click', (ev) => { ev.preventDefault(); clearProcessForm(); loadProcessList(); });
    if (el('procNUP')) el('procNUP').addEventListener('input', () => {
      const v = el('procNUP').value;
      const norm = normalizeNupToBankFormat(v);
      // Só aplica formatação automática quando houver ao menos 10 dígitos
      if (v.replace(/\D/g,'').length >= 10) {
        el('procNUP').value = norm;
      }
      currentNUP = el('procNUP').value.trim();
      syncNupFields();
    });

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

  return { init, reloadLists, CLIPBOARD_ICON };
})();
