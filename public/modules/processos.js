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
    U.setMsg('procMsg', '');
    if (el('histProcesso')) el('histProcesso').innerHTML = '';
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
        setOtherTabsEnabled(true);
        bindProcFormTracking();
        if (el('btnSalvarProc')) el('btnSalvarProc').disabled = true;
        if (el('btnNovoProc')) el('btnNovoProc').disabled = false;

        U.setMsg('procMsg', 'Processo encontrado.');
        await loadProcessList();
        await reloadLists();
      } else {
        const ok = window.confirm('NUP não encontrado. Deseja criar um novo processo com este NUP?');
        if (!ok) {
          U.setMsg('procMsg', 'Busca cancelada.');
          return clearProcessForm();
        }

        currentProcId = null;
        currentNUP = nup;
        syncNupFields();

        el('procTipo').value = 'PDIR';
        el('procStatus').value = 'ANATEC-PRE';
        el('procStatusDate').value = '';
        el('procEntrada').value = '';
        el('procObraTermino').value = '';
        if (el('procObs')) el('procObs').value = '';
        const ob2 = el('btnObraConcluida'); if (ob2) ob2.classList.remove('active');

        setProcFormEnabled(true);
        setOtherTabsEnabled(false);
        bindProcFormTracking();
        if (el('btnSalvarProc')) el('btnSalvarProc').disabled = false;
        if (el('btnNovoProc')) el('btnNovoProc').disabled = false;

        U.setMsg('procMsg', 'Preencha os campos e clique em Salvar para cadastrar.');
      }
    } catch (e) {
      U.setMsg('procMsg', e.message || String(e), true);
    }
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
          <th>1ª Entrada</th><th>Obra (término)</th><th>Concluída</th><th>Ações</th>
        </tr>`;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${r.nup}</td>
          <td>${r.type || ''}</td>
          <td>${r.status || ''}</td>
          <td>${r.status_since ? U.fmtDateTime(r.status_since) : ''}</td>
          <td>${r.first_entry_date ? U.fmtDate(r.first_entry_date) : ''}</td>
          <td>${r.obra_termino_date ? U.fmtDate(r.obra_termino_date) : ''}</td>
          <td>${r.obra_concluida ? 'Sim' : 'Não'}</td>
          <td><button type="button" class="selProc" data-id="${r.id}">Selecionar</button></td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      box.innerHTML = '';
      box.appendChild(table);

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
          setOtherTabsEnabled(true);
          bindProcFormTracking();
          if (el('btnSalvarProc')) el('btnSalvarProc').disabled = true;
          if (el('btnNovoProc')) el('btnNovoProc').disabled = false;

          U.setMsg('procMsg', 'Processo selecionado.');
          await reloadLists();
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
        { key: 'received_at', label: 'Recebida em', value: r => U.fmtDateTime(r.received_at) }
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
        { key: 'read_at', label: 'Lida em', value: r => U.fmtDateTime(r.read_at) }
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
        { key: 'received_at', label: 'Recebida em', value: r => U.fmtDateTime(r.received_at) }
      ], rows);
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  async function reloadLists() {
    try {
      if (currentProcId) {
        if (typeof loadOpiniaoList === 'function') await loadOpiniaoList(currentProcId);
        if (typeof loadNotifList   === 'function') await loadNotifList(currentProcId);
        if (typeof loadSIGList     === 'function') await loadSIGList(currentProcId);
        if (typeof loadHistory     === 'function') await loadHistory(currentProcId);
        else if (el('histProcesso')) el('histProcesso').innerHTML = '';
      } else {
        if (el('histProcesso')) el('histProcesso').innerHTML = '';
      }
    } catch {
      if (el('histProcesso')) el('histProcesso').innerHTML = '';
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
    if (el('procNUP')) el('procNUP').addEventListener('input', () => { currentNUP = el('procNUP').value.trim(); syncNupFields(); });
    bindProcFormTracking();
  }

  async function init() {
    bindEvents();
    clearProcessForm();     // apenas NUP + Buscar habilitados
    await loadProcessList();
    if (el('histProcesso')) el('histProcesso').innerHTML = '';
  }

  return { init, reloadLists };
})();
