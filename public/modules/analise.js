// public/modules/analise.js
window.Modules = window.Modules || {};
window.Modules.analise = (() => {
  let currentTemplate = null;
  let currentProcessId = null;
  let currentDraftId = null;

  const LOCAL_STORAGE_PREFIX = 'agaChecklistDraft:';
  const memoryDraftBackups = new Map();
  let sessionExpiredWarningShown = false;
  let sessionExpiredMsgOnScreen = false;
  let localBackupRestoreNotified = false;
  let syncingLocalDraft = false;

  // === Correlação "Tipo da checklist" -> "Tipo do processo" (definida pelo usuário) ===
  const PROCESS_TYPE_BY_CHECKLIST = new Map([
    ['OPEA - Documental', 'OPEA'],
    ['PDIR - Documental', 'PDIR'],
    ['Inscrição - Documental', 'Inscrição'],
    ['Alteração - Documental', 'Alteração'],
    ['Exploração - Documental', 'Exploração']
  ]);

  function deriveProcessTypeFromTemplate(templateSummaryOrFull) {
    if (!templateSummaryOrFull) return null;
    const title = String(templateSummaryOrFull.title || templateSummaryOrFull.name || '').trim();
    for (const [ck, processType] of PROCESS_TYPE_BY_CHECKLIST.entries()) {
      if (title.startsWith(ck) || (templateSummaryOrFull.type === ck)) {
        return processType;
      }
    }
    return null;
  }

  const el = id => document.getElementById(id);
  const getSupabaseClient = () => (window.sb || window.supabaseClient || window.supabase || null)?.from ? window.sb : (window.sb || null);

  function setReadOnly(readonly) {
    const btnFinal = document.getElementById('adBtnFinalizarChecklist');
    const btnLimpar = document.getElementById('btnLimparChecklist');
    if (btnFinal) btnFinal.disabled = !!readonly || !currentTemplate;
    if (btnLimpar) btnLimpar.disabled = !!readonly || !currentTemplate;
    document.querySelectorAll('#ckContainer input,#ckContainer select,#ckContainer textarea')
      .forEach(el => readonly ? el.setAttribute('disabled','disabled') : el.removeAttribute('disabled'));
  }

  const SESSION_EXPIRED_MESSAGE = 'Sessão expirada. As respostas recentes foram salvas localmente e serão sincronizadas ao reabrir a checklist. Faça login novamente.';

  function notifySessionExpiredOnce() {
    if (sessionExpiredWarningShown) return;
    sessionExpiredWarningShown = true;
    Utils.setMsg('adMsg', SESSION_EXPIRED_MESSAGE, true);
    try { showSessionExpiredBanner(); } catch(_) {}
  }

  function showSessionExpiredBanner() {
    if (sessionExpiredMsgOnScreen) return;
    const container = document.querySelector('#adChecklistCard .card-title, #adChecklistCard h2')?.parentElement || document.getElementById('adChecklistCard');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'msg warn';
    div.textContent = SESSION_EXPIRED_MESSAGE;
    container.insertBefore(div, container.firstChild);
    sessionExpiredMsgOnScreen = true;
  }

  function readInputValue(id) {
    const i = document.getElementById(id);
    return i ? i.value : '';
  }

  // --- NUP helpers (mantém máscara no input e envia já no formato 000000/0000-00) ---
  const NUP_REGEX = /^[0-9]{6}\/[0-9]{4}-[0-9]{2}$/;

  // Formata progressivamente para exibição no input (sem travar a digitação)
  function nupFormatDisplay(v) {
    const d = String(v || '').replace(/\D/g, '').slice(0, 12);
    if (d.length <= 6) return d;
    if (d.length <= 10) return `${d.slice(0,6)}/${d.slice(6)}`;
    return `${d.slice(0,6)}/${d.slice(6,10)}-${d.slice(10,12)}`;
  }

  // Valida e retorna o NUP **estritamente** no padrão exigido, ou null se incompleto
  function nupFormatStrict(v) {
    const f = nupFormatDisplay(v);
    return NUP_REGEX.test(f) ? f : null;
  }

  function updateSaveState() {
    const { ready, reason } = getChecklistValidationState();
    const btnFinalizar = el('adBtnFinalizarChecklist');
    const btnLimpar = el('btnLimparChecklist');
    if (btnFinalizar) {
      btnFinalizar.disabled = !currentTemplate;
      if (!currentTemplate) {
        btnFinalizar.removeAttribute('title');
      } else if (!ready) {
        btnFinalizar.title = reason || 'Finalize a checklist apenas após preencher todos os itens obrigatórios.';
      } else {
        btnFinalizar.title = 'As respostas são salvas automaticamente como rascunho. Clique para finalizar.';
      }
    }
    if (btnLimpar) btnLimpar.disabled = !currentTemplate;
  }

  function getChecklistValidationState() {
    // Mantido: validação simplificada só para tooltip do botão
    return { ready: !!currentTemplate, reason: currentTemplate ? '' : 'Selecione uma checklist aprovada.' };
  }

  function clearChecklist() {
    currentTemplate = null;
    currentDraftId = null;
    const box = el('ckContainer');
    if (box) box.innerHTML = '';
    updateSaveState();
  }

  function renderChecklistTo(box, template, answers = {}, readonly = false) {
    if (!box || !template) return;
    const items = Array.isArray(template.items) ? template.items : [];
    const frag = document.createDocumentFragment();

    const header = document.createElement('div');
    header.className = 'muted';
    const labelType = String(template.type || template.title || '').trim() || 'Checklist';
    header.textContent = `${labelType} • v${template.version || 1}`;
    frag.appendChild(header);

    items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'ck-row';

      const label = document.createElement('label');
      label.textContent = it?.label || `Item ${idx+1}`;
      row.appendChild(label);

      const input = document.createElement(it?.type === 'text' ? 'textarea' : 'input');
      input.name = it?.name || `item_${idx}`;
      if (it?.type !== 'text') input.type = it?.type || 'text';
      input.value = answers[input.name] ?? '';
      if (readonly) input.setAttribute('disabled','disabled');

      // Debounce simples por campo
      let tId = null;
      input.addEventListener('input', () => {
        if (tId) clearTimeout(tId);
        tId = setTimeout(() => {
          persistLocalDraftFromUI();
          notifyEdited();
        }, 350);
      });

      row.appendChild(input);
      frag.appendChild(row);
    });

    box.innerHTML = '';
    box.appendChild(frag);
  }

  function getAnswersFromUI() {
    const out = {};
    document.querySelectorAll('#ckContainer input[name], #ckContainer textarea[name], #ckContainer select[name]')
      .forEach(el => { out[el.name] = el.value; });
    return out;
  }

  function persistLocalDraftFromUI() {
    if (!currentTemplate || !currentProcessId) return;
    const key = `${LOCAL_STORAGE_PREFIX}${currentProcessId}:${currentTemplate.id}`;
    const draft = {
      template_id: currentTemplate.id,
      process_id: currentProcessId,
      answers: getAnswersFromUI(),
      extra_obs: el('adChecklistObs')?.value || '',
      updated_at: new Date().toISOString()
    };
    try {
      localStorage.setItem(key, JSON.stringify(draft));
      memoryDraftBackups.set(key, draft); // cópia em memória, caso o storage esteja indisponível
    } catch(_) {}
  }

  function tryRestoreLocalBackupAgainst(loadedDraft) {
    if (localBackupRestoreNotified) return;
    if (!currentTemplate || !currentProcessId) return;
    const key = `${LOCAL_STORAGE_PREFIX}${currentProcessId}:${currentTemplate.id}`;
    let localDraft = null;
    try { localDraft = localStorage.getItem(key); } catch(_) {}
    if (!localDraft && memoryDraftBackups.has(key)) {
      localDraft = JSON.stringify(memoryDraftBackups.get(key));
    }
    if (!localDraft) return;

    try {
      const parsed = JSON.parse(localDraft);
      const localAt = new Date(parsed?.updated_at || 0).getTime();
      const remoteAt = new Date(loadedDraft?.updated_at || 0).getTime();
      if (localAt > remoteAt) {
        // aplica local na UI
        const answers = parsed?.answers || {};
        Object.entries(answers).forEach(([name, val]) => {
          const el = document.querySelector(`#ckContainer [name="${CSS.escape(name)}"]`);
          if (el) el.value = val;
        });
        const obs = parsed?.extra_obs || '';
        if (el('adChecklistObs')) el('adChecklistObs').value = obs;
        if (!localBackupRestoreNotified) {
          Utils.setMsg('adMsg', 'Rascunho local mais recente restaurado na tela.', false);
          localBackupRestoreNotified = true;
        }
      }
    } catch(_) {}
  }

  function bindAD() {
    const btn = el('btnLimparAD');
    if (!btn) return;
    btn.addEventListener('click', () => {
      el('adNUP') && (el('adNUP').value = '');
      el('adNome') && (el('adNome').value = '');
      Utils.setMsg('adMsg','');
      clearChecklist();
    });
  }

  function bind() {
    const btnLimparAD = el('btnLimparAD');
    const btnLimpar = el('btnLimparChecklist');
    const btnFinalizar = el('adBtnFinalizarChecklist');
    const inputNUP = el('adNUP');

    if (btnLimparAD) {
      btnLimparAD.addEventListener('click', () => {
        if (el('adNUP')) el('adNUP').value = '';
        if (el('adNome')) el('adNome').value = '';
        Utils.setMsg('adMsg','');
        clearChecklist();
      });
    }

    if (btnLimpar) {
      btnLimpar.addEventListener('click', () => {
        clearChecklist();
        Utils.setMsg('adMsg','Checklist limpa.');
      });
    }

    if (btnFinalizar) {
      btnFinalizar.addEventListener('click', finalizeChecklist);
    }

    if (inputNUP) {
      // Mantém a MÁSCARA no campo durante a digitação
      inputNUP.addEventListener('input', (ev) => {
        const caretEnd = ev.target.selectionEnd;
        ev.target.value = nupFormatDisplay(ev.target.value);
        // ajuste simples de caret (opcional, não essencial)
        try { ev.target.setSelectionRange(ev.target.value.length, ev.target.value.length); } catch(_) {}
      });
    }

    // Salvar local ao trocar de aba/janela
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        try { persistLocalDraftFromUI(); } catch(_) {}
      }
    }, { passive: true });

    // Quando perde foco, pelo menos persistimos localmente
    window.addEventListener('blur', () => {
      try { persistLocalDraftFromUI(); } catch(_) {}
    }, { passive: true });
  }

  window.addEventListener('beforeunload', () => {
    try { persistLocalDraftFromUI(); } catch(_) {}
    try { navigator.sendBeacon && navigator.sendBeacon('/noop','1'); } catch(_) {}
    releaseLock();
    stopLockHeartbeat();
    stopSessionHeartbeat();
  }, { capture: true });

  // ==== Ações para o card "Checklists aprovadas" ====

  function createApprovedChecklistActions(row) {
    const container = document.createElement('div');
    container.className = 'actions';

    const btnOpen = document.createElement('button');
    btnOpen.type = 'button';
    btnOpen.textContent = 'Abrir';
    btnOpen.addEventListener('click', async (ev) => {
      ev.preventDefault();
      await openChecklistFromApproved(row);
    });
    container.appendChild(btnOpen);

    const btnPdf = document.createElement('button');
    btnPdf.type = 'button';
    btnPdf.textContent = 'PDF';
    btnPdf.addEventListener('click', async (ev) => {
      ev.preventDefault();
      await openApprovedChecklistPDF(row);
    });
    container.appendChild(btnPdf);

    return container;
  }

  async function openApprovedChecklistPDF(templateSummary) {
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const templateId = templateSummary?.id;
      if (!templateId) throw new Error('Checklist aprovada não encontrada.');

      const template = await loadTemplateById(templateId);
      if (!template) throw new Error('Checklist aprovada não encontrada.');

      const rendered = window.ChecklistPDF?.renderChecklistTemplate;
      if (typeof rendered !== 'function') throw new Error('Gerador de PDF não disponível.');

      const approvedAt = template?.approved_at ? Utils.fmtDateTime(template.approved_at) : '';
      const approvedBy = templateSummary?.approved_by_display || template?.approved_by || '';

      const { url } = await rendered({
        title: template?.title || template?.name || 'Checklist',
        version: template?.version || 1,
        items: Array.isArray(template?.items) ? template.items : [],
        approvedAt: approvedAt || '—',
        approvedBy: approvedBy || '—'
      });
      if (win) win.location.href = url;
    } catch (err) {
      if (win) win.close();
      alert(err.message || String(err));
    }
  }
  // === FIM DO PATCH ===

  async function loadApprovedChecklists() {
    try {
      const box = el('adApprovedList');
      box.innerHTML = '<div class="muted">Carregando…</div>';

      const sb = getSupabaseClient();
      if (sb === null || typeof sb.from !== 'function') {
        console.error('[Análise] Cliente Supabase não encontrado.');
        approvedListRetryCount += 1;
        if (approvedListRetryCount <= APPROVED_LIST_MAX_RETRIES) {
          box.innerHTML = '<div class="muted">Conectando ao banco de dados…</div>';
          setTimeout(loadApprovedChecklists, APPROVED_LIST_RETRY_DELAY_MS);
        } else {
          box.innerHTML = '<div class="msg error">Falha ao carregar as checklists aprovadas.</div>';
        }
        return;
      }
      approvedListRetryCount = 0;

      const { data, error } = await sb
        .from('checklist_templates')
        .select('id,name,type,version, approved_by, approved_at')
        // <<< AJUSTE: em vez de .not('approved_at','is',null)
        .gte('approved_at', '1970-01-01T00:00:00Z')
        .order('approved_at', { ascending: false });

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const latestRows = [];
      const seen = new Set();
      rows.forEach(row => {
        const key = `${row.type}:::${row.name}`;
        if (seen.has(key)) return;
        seen.add(key);
        latestRows.push(row);
      });
      if (!latestRows.length) {
        box.innerHTML = '<div class="msg">Nenhuma checklist aprovada.</div>';
        return;
      }

      // Resolver “Aprovada por” com lookup em profiles
      const approverIds = Array.from(new Set(
        latestRows
          .map(row => row?.approved_by)
          .filter(Boolean)
      ));

      const approverMap = new Map();
      if (approverIds.length) {
        try {
          const { data: profiles, error: profilesError } = await sb
            .from('profiles')
            .select('id,name,email')
            .in('id', approverIds);
          if (profilesError) {
            console.warn('[Análise] Falha ao carregar aprovadores das checklists:', profilesError);
          } else {
            (profiles || []).forEach(profile => {
              if (profile?.id) approverMap.set(profile.id, profile);
            });
          }
        } catch (profilesErr) {
          console.warn('[Análise] Erro inesperado ao carregar aprovadores das checklists:', profilesErr);
        }
      }

      const tableRows = latestRows.map(row => {
        const profile = row?.approved_by ? approverMap.get(row.approved_by) : null;
        const displayName = profile?.name || profile?.email || row?.approved_by || '—';
        return { ...row, approved_by_display: displayName };
      });

      Utils.renderTable(box, [
        { key: 'type', label: 'Tipo' },
        { key: 'version', label: 'Versão', align: 'center' },
        {
          key: 'approved_by_display',
          label: 'Aprovada por',
          value: r => r.approved_by_display || r.approved_by || '—'
        },
        {
          key: 'approved_at',
          label: 'Aprovada em',
          value: r => (r.approved_at ? Utils.fmtDateTime(r.approved_at) : '')
        },
        { label: 'Ações', align: 'center', render: r => createApprovedChecklistActions(r) }
      ], tableRows);
    } catch (err) {
      console.error('[Análise] Erro ao carregar checklists aprovadas:', err);
      const box = el('adApprovedList');
      if (box) box.innerHTML = `<div class="msg error">${Utils.escapeHtml(err?.message || 'Falha ao carregar as checklists aprovadas.')}</div>`;
    }
  }

  async function loadTemplateById(id) {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('checklist_templates')
      .select('id,name,type,items,version,approved_by,approved_at')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('Erro ao carregar template:', error);
      return null;
    }
    return data || null;
  }

  async function openChecklistFromApproved(templateSummary) {
    clearChecklist();

    // Se ainda não houver processo aberto para este NUP, cria/obtém
    const nupValue = readInputValue('adNUP').trim();
    const nup = nupFormatStrict(nupValue);
    if (!nup) {
      return Utils.setMsg('adMsg', 'Informe o NUP completo no formato 000000/0000-00.', true);
    }
    const u = await getSessionUser();
    if (!u) {
      notifySessionExpiredOnce();
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      console.error('Cliente Supabase indisponível ao abrir checklist aprovada.');
      return Utils.setMsg('adMsg', 'Não foi possível abrir a checklist.', true);
    }

    // Tenta achar processo existente
    let pData = null;
    try {
      const { data, error } = await sb
        .from('processes')
        .select('id,type')
        .eq('nup', nup)  // já no formato exigido
        .maybeSingle();
      if (error) throw error;
      pData = data || null;
    } catch (err) {
      console.warn('Falha ao buscar processo por NUP:', err);
    }

    if (!pData) {
      // Carrega template para derivar o tipo do processo antes de criar o processo
      const template = await loadTemplateById(templateSummary.id);
      if (!template) {
        return Utils.setMsg('adMsg', 'Checklist selecionada não foi encontrada.', true);
      }
      const processType = deriveProcessTypeFromTemplate(template) || deriveProcessTypeFromTemplate(templateSummary);
      if (!processType) {
        return Utils.setMsg('adMsg', 'Não foi possível determinar o tipo do processo para esta checklist.', true);
      }
      const payload = { nup, type: processType };
      if (u?.id) payload.created_by = u.id;

      const { data, error } = await sb
        .from('processes')
        .insert(payload)
        .select('id')
        .single();
      if (error) {
        console.error('Erro ao criar processo:', error);
        return Utils.setMsg('adMsg', 'Falha ao criar processo.', true);
      }
      currentProcessId = data.id;
      if (window.Modules.processos?.reloadLists) {
        await window.Modules.processos.reloadLists();
      }
    } else {
      // Confere coerência entre tipo do processo existente e o tipo esperado pelo template
      const template = await loadTemplateById(templateSummary.id);
      if (!template) {
        return Utils.setMsg('adMsg', 'Checklist selecionada não foi encontrada.', true);
      }
      const expectedType = deriveProcessTypeFromTemplate(template) || deriveProcessTypeFromTemplate(templateSummary);
      if (!expectedType) {
        return Utils.setMsg('adMsg', 'Não foi possível determinar o tipo do processo para esta checklist.', true);
      }
      if (pData.type && pData.type !== expectedType) {
        const msg = `O NUP informado pertence a um processo do tipo "${pData.type}", mas a checklist selecionada é do tipo "${expectedType}".`;
        return Utils.setMsg('adMsg', msg, true);
      }
      currentProcessId = pData.id;
    }

    // Carrega template completo para render
    const fullTemplate = await loadTemplateById(templateSummary.id);
    if (!fullTemplate) {
      return Utils.setMsg('adMsg', 'Checklist não encontrada.', true);
    }

    currentTemplate = fullTemplate;
    const box = el('ckContainer');
    renderChecklistTo(box, currentTemplate, {}, false);
    updateSaveState();

    // Tenta carregar rascunho do servidor
    let loadedDraft = null;
    try {
      const { data, error } = await sb
        .from('checklist_drafts')
        .select('id, answers, extra_obs, updated_at, created_at, filled_by, filled_by_name')
        .eq('process_id', currentProcessId)
        .eq('template_id', currentTemplate.id)
        .maybeSingle();
      if (!error) loadedDraft = data || null;
    } catch (err) {
      console.warn('Falha ao buscar rascunho:', err);
    }

    let infoMsg = 'Checklist em branco pronta para preenchimento.';
    if (loadedDraft) {
      // aplica na UI
      const answers = loadedDraft?.answers || {};
      Object.entries(answers).forEach(([name, val]) => {
        const el = document.querySelector(`#ckContainer [name="${CSS.escape(name)}"]`);
        if (el) el.value = val;
      });
      if (el('adChecklistObs')) el('adChecklistObs').value = loadedDraft.extra_obs || '';
      infoMsg = 'Rascunho recuperado do servidor.';
      if (loadedDraft?.filled_by || loadedDraft?.filled_by_name) {
        const parts = [];
        const filledBy = loadedDraft?.filled_by_name || loadedDraft?.filled_by || '';
        const updatedAt = loadedDraft?.updated_at ? Utils.fmtDateTime(loadedDraft.updated_at) : null;
        if (updatedAt) parts.push(`Última edição em ${updatedAt}.`);
        if (filledBy) parts.push(`Responsável: ${filledBy}.`);
        parts.push('Ao prosseguir, você preencherá uma nova checklist em branco.');
        infoMsg = parts.join(' ');
      }
    }
    tryRestoreLocalBackupAgainst(loadedDraft);
    Utils.setMsg('adMsg', infoMsg);
  }

  // === Histórico + autosave robusto (mantido do seu código atual) ===
  let historyStartLogged = false;
  let lastEditAt = 0;
  let autosaveTimer = null;
  let lifecycleHooksInstalled = false;
  const AUTOSAVE_EVERY_MS = 60_000;      // salva a cada 60s
  const INACTIVITY_MIN_MS = 30_000;      // considera "houve edição" por 30s após última digitação

  function nowISO() { return new Date().toISOString(); }

  async function insertChecklistHistory(action, details = {}) {
    try {
      const sb = getSupabaseClient();
      const u = await getSessionUser();
      if (!sb || !u || !currentProcessId) return;

      await sb.from('history').insert({
        process_id: currentProcessId,
        action,
        details,
        user_id: u.id,
        user_name: u.user_metadata?.full_name || u.email || u.id
      });
    } catch (err) {
      console.warn('[Histórico] falha ao registrar:', err);
    }
  }

  function notifyEdited() {
    lastEditAt = Date.now();
  }

  function startAutosave() {
    if (autosaveTimer) return;
    autosaveTimer = setInterval(async () => {
      const since = Date.now() - lastEditAt;
      if (since <= INACTIVITY_MIN_MS || (currentTemplate && currentProcessId)) {
        await autosaveDraft();
      }
    }, AUTOSAVE_EVERY_MS);
  }

  async function autosaveDraft() {
    try {
      const sb = getSupabaseClient();
      const u = await getSessionUser();
      if (!sb || !u || !currentTemplate || !currentProcessId) return;

      const payload = {
        p_answers: getAnswersFromUI(),
        p_extra_obs: el('adChecklistObs')?.value || '',
        p_process_id: currentProcessId,
        p_template_id: currentTemplate.id
      };

      const { data, error } = await sb.rpc('rpc_upsert_checklist_draft', payload);
      if (error) {
        console.warn('[Autosave] falha:', error);
        // salva local pra não perder nada
        persistLocalDraftFromUI();
        return;
      }
      currentDraftId = data?.id || currentDraftId;
      if (!historyStartLogged) {
        historyStartLogged = true;
      }
    } catch (err) {
      console.warn('[Autosave] erro inesperado:', err);
      persistLocalDraftFromUI();
    }
  }

  async function finalizeChecklist() {
    try {
      const sb = getSupabaseClient();
      const u = await getSessionUser();
      if (!sb || !u || !currentTemplate || !currentProcessId) {
        notifySessionExpiredOnce();
        return;
      }

      // garante última captura do que está na UI
      await autosaveDraft();

      const payload = {
        p_process_id: currentProcessId,
        p_template_id: currentTemplate.id
      };
      const { data, error } = await sb.rpc('rpc_finalize_checklist', payload);
      if (error) {
        console.error('[Finalizar] falha:', error);
        return Utils.setMsg('adMsg', error.message || 'Falha ao finalizar checklist.', true);
      }

      await insertChecklistHistory('Checklist: finalizada', {
        template_id: currentTemplate.id,
        draft_id: currentDraftId || null
      });

      Utils.setMsg('adMsg', 'Checklist finalizada com sucesso.');
      clearChecklist();
    } catch (err) {
      console.error('[Finalizar] erro inesperado:', err);
      Utils.setMsg('adMsg', 'Ocorreu um erro ao finalizar a checklist.', true);
    }
  }

  // Heartbeats/locks (mantidos)
  function startSessionHeartbeat() {/* ... mantido ... */}
  function stopSessionHeartbeat() {/* ... mantido ... */}
  function releaseLock() {/* ... mantido ... */}
  function stopLockHeartbeat() {/* ... mantido ... */}

  // Retentativas para a lista de aprovadas
  let approvedListRetryCount = 0;
  const APPROVED_LIST_MAX_RETRIES = 3;
  const APPROVED_LIST_RETRY_DELAY_MS = 1200;

  async function loadIndicador() {/* ... mantido ... */}

  async function getSessionUser() {
    try {
      const { data: { user } } = await window.sb.auth.getUser();
      return user || null;
    } catch(_) { return null; }
  }

  function bindForm() { bindAD(); bind(); startAutosave(); }

  async function init() { bindForm(); }
  async function load() {
    clearChecklist();
    await Promise.all([
      loadIndicador(),
      loadApprovedChecklists()
    ]);
  }

  return { init, load, openChecklistFromApproved, openApprovedChecklistPDF };
})();
