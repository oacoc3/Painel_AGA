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

  // === novos toggles do patch ===
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

        // patch: removido setProcFormEnabled/toggleProcFields/bindProcFormTracking aqui
        setOtherTabsEnabled(true);
        toggleOtherTabsVisible(true);
        if (el('btnSalvarProc')) el('btnSalvarProc').disabled = true;
        if (el('btnNovoProc')) el('btnNovoProc').disabled = false;

        U.setMsg('procMsg', 'Processo encontrado.');
        await loadProcessList();
        await reloadLists();
      } else {
        // patch: confirmar antes de abrir popup de novo processo
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
          const { data, error } = await sb
            .from('processes')
            .insert(payload)
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
        setOtherTabsEnabled(true);
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

  // Popup para editar status do processo (patch)
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

  // Popup para editar término de obra (patch)
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
        if (String(r.id) === String(currentProcId)) tr.classList.add('selected');
        const stCls = currentProcId ? 'editStatus editable' : '';
        const obCls = currentProcId ? 'editObra editable' : '';
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

          // patch: removido setProcFormEnabled/toggleProcFields/bindProcFormTracking aqui
          setOtherTabsEnabled(true);
          toggleOtherTabsVisible(true);
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

  async function loadOpiniaoList(procId) {
    const box = el('opLista');
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

  async function loadNotifList(procId) {
    const box = el('ntLista');
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

  async function loadSIGList(procId) {
    const box = el('sgLista');
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

  // === Patch adicionado ===

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

  async function cadOpiniao() {
    if (!currentProcId) return U.setMsg('opMsg', 'Selecione um processo.', true);
    const st = el('opStatus')?.value || 'PENDENTE';
    const payload = {
      process_id: currentProcId,
      type: el('opTipo')?.value || 'ATM',
      requested_at: el('opSolic')?.value ? new Date(el('opSolic').value).toISOString() : new Date().toISOString(),
      status: { PENDENTE: 'SOLICITADO', RECEBIDO: 'RECEBIDO', FINALIZADO: 'RECEBIDO' }[st] || 'SOLICITADO',
      received_at: (st === 'RECEBIDO' || st === 'FINALIZADO') && el('opRecInput')?.value
        ? new Date(el('opRecInput').value).toISOString()
        : null,
      finalized_at: st === 'FINALIZADO' && el('opFinInput')?.value
        ? new Date(el('opFinInput').value).toISOString()
        : null
    };
    try {
      const u = await getUser();
      if (!u) return U.setMsg('opMsg', 'Sessão expirada.', true);
      const { error } = await sb.from('internal_opinions').insert({ ...payload, created_by: u.id });
      if (error) throw error;
      U.setMsg('opMsg', 'Parecer cadastrado.');
      if (el('opSolic')) el('opSolic').value = '';
      if (el('opRecInput')) el('opRecInput').value = '';
      if (el('opFinInput')) el('opFinInput').value = '';
      await reloadLists();
    } catch (e) {
      U.setMsg('opMsg', e.message || String(e), true);
    }
  }

  async function cadNotif() {
    if (!currentProcId) return U.setMsg('ntMsg', 'Selecione um processo.', true);
    const st = el('ntStatus')?.value || 'PENDENTE';
    const payload = {
      process_id: currentProcId,
      type: el('ntTipo')?.value || 'FAV',
      requested_at: el('ntSolic')?.value ? new Date(el('ntSolic').value).toISOString() : new Date().toISOString(),
      status: st === 'LIDA' ? 'LIDA' : 'SOLICITADA',
      read_at: st === 'LIDA' && el('ntLidaInput')?.value
        ? new Date(el('ntLidaInput').value).toISOString()
        : null
    };
    try {
      const u = await getUser();
      if (!u) return U.setMsg('ntMsg', 'Sessão expirada.', true);
      const { error } = await sb.from('notifications').insert({ ...payload, created_by: u.id });
      if (error) throw error;
      U.setMsg('ntMsg', 'Notificação cadastrada.');
      if (el('ntSolic')) el('ntSolic').value = '';
      if (el('ntLidaInput')) el('ntLidaInput').value = '';
      await reloadLists();
    } catch (e) {
      U.setMsg('ntMsg', e.message || String(e), true);
    }
  }

  async function cadSig() {
    if (!currentProcId) return U.setMsg('sgMsg', 'Selecione um processo.', true);
    const numbers = parseSigNumbers(el('sgNums')?.value || '');
    const payload = {
      process_id: currentProcId,
      type: el('sgTipo')?.value || 'COMAE',
      requested_at: el('sgSolic')?.value ? new Date(el('sgSolic').value).toISOString() : new Date().toISOString(),
      numbers,
      status: 'SOLICITADO'
    };
    try {
      const u = await getUser();
      if (!u) return U.setMsg('sgMsg', 'Sessão expirada.', true);
      const { error } = await sb.from('sigadaer').insert({ ...payload, created_by: u.id });
      if (error) throw error;
      U.setMsg('sgMsg', 'SIGADAER cadastrado.');
      if (el('sgSolic')) el('sgSolic').value = '';
      if (el('sgNums')) el('sgNums').value = '';
      await reloadLists();
    } catch (e) {
      U.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  // === Ações de atualização de status ===

  function showOpRecForm(id) {
    editingOpId = id;
    el('opRecForm')?.classList.remove('hidden');
  }

  function showOpFinForm(id) {
    editingOpId = id;
    el('opFinForm')?.classList.remove('hidden');
  }

  function cancelOpRec() {
    el('opRecForm')?.classList.add('hidden');
    if (el('opRecInput')) el('opRecInput').value = '';
    editingOpId = null;
  }

  function cancelOpFin() {
    el('opFinForm')?.classList.add('hidden');
    if (el('opFinInput')) el('opFinInput').value = '';
    editingOpId = null;
  }

  async function salvarOpRec() {
    if (!editingOpId) return;
    const dt = el('opRecInput')?.value ? new Date(el('opRecInput').value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('internal_opinions')
        .update({ status: 'RECEBIDO', received_at: dt })
        .eq('id', editingOpId);
      if (error) throw error;
      U.setMsg('opMsg', 'Recebimento registrado.');
      cancelOpRec();
      await reloadLists();
    } catch (e) {
      U.setMsg('opMsg', e.message || String(e), true);
    }
  }

  async function salvarOpFin() {
    if (!editingOpId) return;
    const dt = el('opFinInput')?.value ? new Date(el('opFinInput').value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('internal_opinions')
        .update({ status: 'FINALIZADO', finalized_at: dt })
        .eq('id', editingOpId);
      if (error) throw error;
      U.setMsg('opMsg', 'Parecer finalizado.');
      cancelOpFin();
      await reloadLists();
    } catch (e) {
      U.setMsg('opMsg', e.message || String(e), true);
    }
  }

  function showNtLidaForm(id) {
    editingNtId = id;
    el('ntLidaForm')?.classList.remove('hidden');
  }

  function cancelNtLida() {
    el('ntLidaForm')?.classList.add('hidden');
    if (el('ntLidaInput')) el('ntLidaInput').value = '';
    editingNtId = null;
  }

  async function salvarNtLida() {
    if (!editingNtId) return;
    const dt = el('ntLidaInput')?.value ? new Date(el('ntLidaInput').value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('notifications')
        .update({ status: 'LIDA', read_at: dt })
        .eq('id', editingNtId);
      if (error) throw error;
      U.setMsg('ntMsg', 'Leitura registrada.');
      cancelNtLida();
      await reloadLists();
    } catch (e) {
      U.setMsg('ntMsg', e.message || String(e), true);
    }
  }

  function showSgExpForm(id) {
    editingSgId = id;
    el('sgExpForm')?.classList.remove('hidden');
  }

  function showSgRecForm(id) {
    editingSgId = id;
    el('sgRecForm')?.classList.remove('hidden');
  }

  function cancelSgExp() {
    el('sgExpForm')?.classList.add('hidden');
    if (el('sgExpInput')) el('sgExpInput').value = '';
    editingSgId = null;
  }

  function cancelSgRec() {
    el('sgRecForm')?.classList.add('hidden');
    if (el('sgRecInput')) el('sgRecInput').value = '';
    editingSgId = null;
  }

  async function salvarSgExp() {
    if (!editingSgId) return;
    const dt = el('sgExpInput')?.value ? new Date(el('sgExpInput').value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('sigadaer')
        .update({ status: 'EXPEDIDO', expedit_at: dt })
        .eq('id', editingSgId);
      if (error) throw error;
      U.setMsg('sgMsg', 'Expedição registrada.');
      cancelSgExp();
      await reloadLists();
    } catch (e) {
      U.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  async function salvarSgRec() {
    if (!editingSgId) return;
    const dt = el('sgRecInput')?.value ? new Date(el('sgRecInput').value).toISOString() : new Date().toISOString();
    try {
      const { error } = await sb
        .from('sigadaer')
        .update({ status: 'RECEBIDO', received_at: dt })
        .eq('id', editingSgId);
      if (error) throw error;
      U.setMsg('sgMsg', 'Recebimento registrado.');
      cancelSgRec();
      await reloadLists();
    } catch (e) {
      U.setMsg('sgMsg', e.message || String(e), true);
    }
  }

  // === Fim do patch adicionado ===

  async function reloadLists() {
    try {
      if (currentProcId) {
        if (typeof loadOpiniaoList === 'function') await loadOpiniaoList(currentProcId);
        if (typeof loadNotifList   === 'function') await loadNotifList(currentProcId);
        if (typeof loadSIGList     === 'function') await loadSIGList(currentProcId);
      }
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

    // binds do patch
    if (el('btnCadOpiniao')) el('btnCadOpiniao').addEventListener('click', (ev) => { ev.preventDefault(); cadOpiniao(); });
    if (el('btnCadNotif')) el('btnCadNotif').addEventListener('click', (ev) => { ev.preventDefault(); cadNotif(); });
    if (el('btnCadSig')) el('btnCadSig').addEventListener('click', (ev) => { ev.preventDefault(); cadSig(); });

    if (el('btnSalvarOpRec')) el('btnSalvarOpRec').addEventListener('click', (ev) => { ev.preventDefault(); salvarOpRec(); });
    if (el('btnVoltarOpRec')) el('btnVoltarOpRec').addEventListener('click', (ev) => { ev.preventDefault(); cancelOpRec(); });
    if (el('btnSalvarOpFin')) el('btnSalvarOpFin').addEventListener('click', (ev) => { ev.preventDefault(); salvarOpFin(); });
    if (el('btnVoltarOpFin')) el('btnVoltarOpFin').addEventListener('click', (ev) => { ev.preventDefault(); cancelOpFin(); });

    if (el('btnSalvarNtLida')) el('btnSalvarNtLida').addEventListener('click', (ev) => { ev.preventDefault(); salvarNtLida(); });
    if (el('btnVoltarNtLida')) el('btnVoltarNtLida').addEventListener('click', (ev) => { ev.preventDefault(); cancelNtLida(); });

    if (el('btnSalvarSgExp')) el('btnSalvarSgExp').addEventListener('click', (ev) => { ev.preventDefault(); salvarSgExp(); });
    if (el('btnVoltarSgExp')) el('btnVoltarSgExp').addEventListener('click', (ev) => { ev.preventDefault(); cancelSgExp(); });
    if (el('btnSalvarSgRec')) el('btnSalvarSgRec').addEventListener('click', (ev) => { ev.preventDefault(); salvarSgRec(); });
    if (el('btnVoltarSgRec')) el('btnVoltarSgRec').addEventListener('click', (ev) => { ev.preventDefault(); cancelSgRec(); });

    if (el('opStatus')) el('opStatus').addEventListener('change', () => {
      const st = el('opStatus').value;
      el('opRecForm')?.classList.toggle('hidden', st === 'PENDENTE');
      el('opFinForm')?.classList.toggle('hidden', st !== 'FINALIZADO');
    });
    if (el('ntStatus')) el('ntStatus').addEventListener('change', () => {
      const st = el('ntStatus').value;
      el('ntLidaForm')?.classList.toggle('hidden', st !== 'LIDA');
    });

    // formulário principal permanece oculto por padrão
  }

  async function init() {
    bindEvents();
    clearProcessForm();     // apenas NUP + Buscar habilitados
    await loadProcessList();
  }

  return { init, reloadLists };
})();
