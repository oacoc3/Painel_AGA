// public/modules/processos.js
window.Modules = window.Modules || {};
window.Modules.processos = (() => {
  let currentProcId = null;
  let currentNUP = '';
  let currentOpiniaoRecId = null;
  let currentNotifLidaId = null;
  let currentSigExpId = null;
  let currentSigRecId = null;
  let procFormEnabled = false;

  function el(id) { return document.getElementById(id); }

  function syncNUP() {
    if (el('procNUP')) el('procNUP').value = currentNUP || '';
    if (el('opNUP')) el('opNUP').value = currentNUP || '';
    if (el('ntNUP')) el('ntNUP').value = currentNUP || '';
    if (el('sgNUP')) el('sgNUP').value = currentNUP || '';
  }

  function setProcFormEnabled(on) {
    procFormEnabled = on;
    ['procTipo','procStatus','procStatusDate','procEntrada','procObraTermino','procObs'].forEach(id => {
      const e = el(id); if (e) e.disabled = !on;
    });
    ['btnObraConcluida','btnSalvarProc','btnNovoProc'].forEach(id => {
      const b = el(id); if (b) b.disabled = !on;
    });
  }

  // Habilita/desabilita as abas não-Processo
  function setOtherTabsEnabled(on) {
    ['opiniao','notif','sig'].forEach(t => {
      const btn = document.querySelector(`[data-tab="${t}"]`);
      if (btn) btn.disabled = !on;
    });
  }

  // Mostra a aba (formulário à esquerda) e alterna a lista do meio
  function showTab(tab) {
    const tabs = ['proc','opiniao','notif','sig'];
    tabs.forEach(t => {
      const box = el('tab' + t.charAt(0).toUpperCase() + t.slice(1));
      if (box) box.style.display = t === tab ? 'block' : 'none';
    });
    // Destaque no botão ativo
    Array.from(document.querySelectorAll('[data-tab]'))
      .forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    // Alterna a lista na coluna do meio
    const map = { proc: 'procLista', opiniao: 'opLista', notif: 'ntLista', sig: 'sgLista' };
    Object.values(map).forEach(id => { if (el(id)) el(id).style.display = 'none'; });
    if (el(map[tab])) el(map[tab]).style.display = 'block';
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
    Utils.setMsg('procMsg', '');
    setProcFormEnabled(false);
    setOtherTabsEnabled(false);
    // Limpa listas relacionadas e histórico
    if (el('opLista')) el('opLista').innerHTML = '';
    if (el('ntLista')) el('ntLista').innerHTML = '';
    if (el('sgLista')) el('sgLista').innerHTML = '';
    if (el('histProcesso')) el('histProcesso').innerHTML = '';
  }

  function bindProcFormTracking() {
    const inputs = ['procNUP','procTipo','procStatus','procStatusDate','procEntrada','procObraTermino','procObs'];
    inputs.forEach(id => {
      const e = el(id);
      if (!e) return;
      ['input','change'].forEach(evt => {
        e.addEventListener(evt, () => { if (procFormEnabled) el('btnSalvarProc').disabled = false; });
      });
    });
  }

  async function buscarProcesso() {
    const nup = el('procNUP').value.trim();
    if (!nup) return Utils.setMsg('procMsg', 'Informe o NUP.', true);
    Utils.setMsg('procMsg', 'Buscando…');
    try {
      const { data, error } = await sb.from('processes')
        .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida,observations')
        .eq('nup', nup)
        .maybeSingle();
      if (error) throw error;

      if (data) {
        // Encontrado: carrega formulário e habilita tudo
        currentProcId = data.id;
        currentNUP = data.nup;
        syncNUP();
        el('procTipo').value = data.type;
        el('procStatus').value = data.status || 'ANATEC-PRE';
        el('procStatusDate').value = data.status_since ? Utils.toDateTimeLocalValue(data.status_since) : '';
        el('procEntrada').value = data.first_entry_date ? Utils.toDateInputValue(data.first_entry_date) : '';
        el('procObraTermino').value = data.obra_termino_date ? Utils.toDateInputValue(data.obra_termino_date) : '';
        el('procObs').value = data.observations || '';
        if (data.obra_concluida) el('btnObraConcluida').classList.add('active'); else el('btnObraConcluida').classList.remove('active');

        setProcFormEnabled(true);
        setOtherTabsEnabled(true);
        el('btnSalvarProc').disabled = true;
        el('btnNovoProc').disabled = false;
        Utils.setMsg('procMsg', 'Processo encontrado.');
        await loadProcessList(); // reposiciona o processo no topo
        await reloadLists();
      } else {
        // Não encontrado: pergunta se deseja cadastrar
        const ok = window.confirm('NUP não encontrado. Deseja criar um novo processo com este NUP?');
        if (!ok) {
          // cancela e limpa para nova busca
          clearProcessForm();
          return;
        }
        // prepara para cadastro: habilita somente a aba Processo
        currentProcId = null;
        currentNUP = nup;
        syncNUP();
        el('procTipo').value = 'PDIR';
        el('procStatus').value = 'ANATEC-PRE';
        el('procStatusDate').value = '';
        el('procEntrada').value = '';
        el('procObraTermino').value = '';
        el('procObs').value = '';
        el('btnObraConcluida').classList.remove('active');

        setProcFormEnabled(true);
        setOtherTabsEnabled(false); // outras abas só após salvar
        el('btnSalvarProc').disabled = false;
        el('btnNovoProc').disabled = false;
        await loadHistory(null);
        Utils.setMsg('procMsg', 'Preencha os campos e clique em Salvar para cadastrar o processo.');
      }
    } catch (e) {
      Utils.setMsg('procMsg', e.message || String(e), true);
    }
  }

  async function upsertProcess() {
    const nup = el('procNUP').value.trim();
    const type = el('procTipo').value;
    const status = el('procStatus').value;
    const statusSinceInput = el('procStatusDate').value;
    const firstEntry = el('procEntrada').value ? new Date(el('procEntrada').value).toISOString().slice(0,10) : null;
    const obraTerm = el('procObraTermino').value ? new Date(el('procObraTermino').value).toISOString().slice(0,10) : null;
    const obraConcl = el('btnObraConcluida').classList.contains('active');
    const observations = el('procObs').value || null;

    if (!nup) return Utils.setMsg('procMsg', 'Informe o NUP.', true);

    try {
      if (!currentProcId) {
        // insert
        const payload = {
          nup, type, status,
          status_since: statusSinceInput ? new Date(statusSinceInput).toISOString() : null,
          first_entry_date: firstEntry,
          obra_termino_date: obraTerm,
          obra_concluida: obraConcl,
          observations
        };
        const { data, error } = await sb.from('processes').insert(payload).select('id').single();
        if (error) throw error;
        currentProcId = data.id;
        currentNUP = nup;
        syncNUP();
        Utils.setMsg('procMsg', 'Processo cadastrado.');
        setOtherTabsEnabled(true);
        await Promise.all([loadProcessList(), reloadLists()]);
      } else {
        // update
        const payload = {
          nup, type, status,
          status_since: statusSinceInput ? new Date(statusSinceInput).toISOString() : null,
          first_entry_date: firstEntry,
          obra_termino_date: obraTerm,
          obra_concluida: obraConcl,
          observations
        };
        const { error } = await sb.from('processes').update(payload).eq('id', currentProcId);
        if (error) throw error;
        Utils.setMsg('procMsg', 'Processo atualizado.');
        await Promise.all([loadProcessList(), reloadLists()]);
      }
    } catch (e) {
      Utils.setMsg('procMsg', e.message || String(e), true);
    }
  }

  // ======== LISTA DE PROCESSOS (coluna do meio quando aba "Processo") ========
  async function loadProcessList() {
    const box = el('procLista');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb.from('processes')
        .select('id,nup,type,status,status_since,first_entry_date,obra_termino_date,obra_concluida,created_at,created_by')
        .order('created_at', { ascending: false });
      // Reposiciona o processo selecionado no topo da lista, se houver
      if (currentProcId && Array.isArray(data)) {
        data.sort((a,b) => (a.id === currentProcId ? -1 : (b.id === currentProcId ? 1 : 0)));
      }
      if (error) throw error;

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>NUP</th><th>Tipo</th><th>Status</th><th>Desde</th>
          <th>1ª Entrada</th><th>Obra (término)</th><th>Concluída</th><th>Ações</th>
        </tr>`;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      (data || []).forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.nup}</td>
          <td>${row.type}</td>
          <td>${row.status || ''}</td>
          <td>${row.status_since ? Utils.fmtDateTime(row.status_since) : ''}</td>
          <td>${row.first_entry_date ? Utils.fmtDate(row.first_entry_date) : ''}</td>
          <td>${row.obra_termino_date ? Utils.fmtDate(row.obra_termino_date) : ''}</td>
          <td>${row.obra_concluida ? 'Sim' : 'Não'}</td>
          <td><button type="button" data-id="${row.id}" class="selProc">Selecionar</button></td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.innerHTML = '';
      box.appendChild(table);

      Array.from(box.querySelectorAll('.selProc')).forEach(btn => {
        btn.addEventListener('click', async () => {
          currentProcId = btn.getAttribute('data-id');
          const row = (data || []).find(r => r.id === currentProcId);
          currentNUP = row?.nup || '';
          syncNUP();
          // Preenche formulário (aba Processo)
          el('procNUP').value = row.nup;
          el('procTipo').value = row.type;
          el('procStatus').value = row.status || 'ANATEC-PRE';
          el('procStatusDate').value = row.status_since ? Utils.toDateTimeLocalValue(row.status_since) : '';
          el('procEntrada').value = row.first_entry_date ? Utils.toDateInputValue(row.first_entry_date) : '';
          el('procObraTermino').value = row.obra_termino_date ? Utils.toDateInputValue(row.obra_termino_date) : '';
          el('procObs').value = row.observations || '';
          if (row.obra_concluida) el('btnObraConcluida').classList.add('active'); else el('btnObraConcluida').classList.remove('active');
          setProcFormEnabled(true);
          setOtherTabsEnabled(true);
          el('btnSalvarProc').disabled = true;
          el('btnNovoProc').disabled = false;
          Utils.setMsg('procMsg', 'Processo selecionado.');
          await reloadLists(); // carrega listas das outras abas + histórico
        });
      });
    } catch (e) {
      box.innerHTML = `<div class="msg error">${e.message || String(e)}</div>`;
    }
  }

  // ======== OUTRAS LISTAS, HISTÓRICO E BINDINGS (inalterados) ========
  // ... (o restante do arquivo segue igual ao seu, incluindo: reloadLists, opiniões internas, notificações, SIGADAER e histórico)

  async function reloadLists() {
    if (!currentProcId) return;
    await Promise.all([loadOpiniaoList(currentProcId), loadNotifList(currentProcId), loadSIGList(currentProcId), loadHistory(currentProcId)]);
  }

  // (As demais funções — loadOpiniaoList, loadNotifList, loadSIGList, loadHistory, etc. — permanecem as mesmas do seu arquivo.)

  function bindEvents() {
    // Abas
    Array.from(document.querySelectorAll('[data-tab]')).forEach(btn => {
      btn.addEventListener('click', () => showTab(btn.dataset.tab));
    });
    showTab('proc'); // padrão

    // Processo
    if (el('btnObraConcluida')) el('btnObraConcluida').addEventListener('click', toggleObraConcluida);
    if (el('btnSalvarProc')) el('btnSalvarProc').addEventListener('click', (ev) => { ev.preventDefault(); upsertProcess(); });
    if (el('btnNovoProc')) el('btnNovoProc').addEventListener('click', (ev) => { ev.preventDefault(); clearProcessForm(); loadHistory(null); });
    if (el('btnBuscarProc')) el('btnBuscarProc').addEventListener('click', (ev) => { ev.preventDefault(); buscarProcesso(); });
    bindProcFormTracking();

    // (demais binds das abas seguem iguais ao seu arquivo)
  }

  async function init() {
    bindEvents();
    clearProcessForm();
    await loadProcessList(); // carrega a lista inicial
    await loadHistory(null); // mostra mensagem "Selecione um processo…"
  }

  return { init };
})();
document.addEventListener('DOMContentLoaded', () => {
  if (window.Modules?.processos?.init) window.Modules.processos.init();
});
