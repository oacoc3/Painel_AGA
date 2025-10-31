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

  // >>> Estado/Timers de autosave e histórico (mantidos uma única vez)
  let lastEditAt = 0;
  let autosaveTimer = null;
  let lifecycleHooksInstalled = false;

  const AUTOSAVE_EVERY_MS = 60_000;      // salva a cada 60s
  const INACTIVITY_MIN_MS = 30_000;      // considera "houve edição" por 30s após última digitação
  // <<<

  // Histórico do início das checklists por rascunho (evita duplicar chamadas)
  const startHistoryRecordedKeys = new Set();
  const startHistoryPending = new Map();

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
    if (title && PROCESS_TYPE_BY_CHECKLIST.has(title)) {
      return PROCESS_TYPE_BY_CHECKLIST.get(title);
    }
    const t = (templateSummaryOrFull.type || '').toString().trim();
    return t || null;
  }

  // === Lock/session heartbeats (injetado) ===
  let lockHeartbeatTimer = null;
  let sessionHeartbeatTimer = null;
  const LOCK_TTL_SECONDS = 30 * 60;
  const LOCK_RENEW_EVERY_MS = 5 * 60 * 1000;
  const SESSION_HEARTBEAT_MS = 2 * 60 * 1000;
  let approvedListRetryCount = 0;
  const APPROVED_LIST_MAX_RETRIES = 10;
  const APPROVED_LIST_RETRY_DELAY_MS = 500;

  async function acquireLock() {
    const sb = getSupabaseClient();
    if (!currentProcessId || !currentTemplate || !sb) return false;
    try {
      const { data, error } = await sb.rpc('rpc_acquire_checklist_lock', {
        p_process_id: currentProcessId,
        p_template_id: currentTemplate.id,
        p_ttl_seconds: LOCK_TTL_SECONDS
      });
      if (error) throw error;
      if (data?.status === 'held_by_other') {
        tornarSomenteLeitura(true);
        Utils.setMsg('adMsg', 'Checklist em edição por outro analista. Aguarde a liberação.', true);
        return false;
      }
      tornarSomenteLeitura(false);
      return true;
    } catch (e) {
      console.error('[analise] acquireLock falhou:', e);
      return false;
    }
  }

  function startLockHeartbeat() {
    if (lockHeartbeatTimer) return;
    lockHeartbeatTimer = setInterval(async () => {
      try {
        const sb = getSupabaseClient();
        if (!sb) return;
        await sb.rpc('rpc_renew_checklist_lock', {
          p_process_id: currentProcessId,
          p_template_id: currentTemplate.id,
          p_ttl_seconds: LOCK_TTL_SECONDS
        });
      } catch (_) {}
    }, LOCK_RENEW_EVERY_MS);
  }

  async function releaseLock() {
    const sb = getSupabaseClient();
    if (!sb) return;
    try {
      await sb.rpc('rpc_release_checklist_lock', {
        p_process_id: currentProcessId,
        p_template_id: currentTemplate.id
      });
    } catch (_) {}
  }
  function stopLockHeartbeat() { clearInterval(lockHeartbeatTimer); lockHeartbeatTimer = null; }

  function startSessionHeartbeat() {
    if (sessionHeartbeatTimer) return;
    sessionHeartbeatTimer = setInterval(async () => {
      try {
        const sb = getSupabaseClient();
        if (!sb) return;
        await sb.auth.getSession();
      } catch (_) {}
    }, SESSION_HEARTBEAT_MS);
  }
  function stopSessionHeartbeat() { clearInterval(sessionHeartbeatTimer); sessionHeartbeatTimer = null; }

  function tornarSomenteLeitura(readonly) {
    const btnFinal = document.getElementById('adBtnFinalizarChecklist');
    const btnLimpar = document.getElementById('btnLimparChecklist');
    if (btnFinal) btnFinal.disabled = !!readonly || !currentTemplate;
    if (btnLimpar) btnLimpar.disabled = !!readonly || !currentTemplate;
    document.querySelectorAll('#ckContainer input,#ckContainer select,#ckContainer textarea')
      .forEach(el => readonly ? el.setAttribute('disabled','disabled') : el.removeAttribute('disabled'));
  }

  const SESSION_EXPIRED_MESSAGE = 'Sessão expirada. As respostas recentes foram salvas localmente e serão sincronizadas quando você fizer login novamente e aguarde o salvamento automático antes de finalizar.';
  const LOCAL_RESTORE_MESSAGE = 'As respostas salvas anteriormente foram restauradas desta máquina. Faça login novamente e aguarde o salvamento automático antes de finalizar.';

  const CLIPBOARD_ICON = window.Modules?.processos?.CLIPBOARD_ICON
    || '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" class="icon-clipboard"><rect x="6" y="5" width="12" height="15" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M9 5V4a2 2 0 0 1 2-2h2a 2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><path d="m10 11 2 2 3.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';

  const Utils = window.Modules?.utils || window.Utils || {};

  function getSupabaseClient() {
    return (typeof window.sb !== 'undefined' ? window.sb : null)
      || (typeof window.supabaseClient !== 'undefined' ? window.supabaseClient : null)
      || (window.supabase && window.supabase._client)
      || null;
  }

  const el = id => document.getElementById(id);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function nowISO() {
    const d = new Date();
    return d.toISOString();
  }

  function nupSanitize(v) {
    const digits = (v || '').replace(/\D+/g, '').slice(0, 12);
    let formatted = digits.slice(0, 6);
    if (digits.length > 6) formatted += '/' + digits.slice(6, 10);
    if (digits.length > 10) formatted += '-' + digits.slice(10, 12);
    return formatted;
  }

  function setInputValue(id, v) {
    const i = el(id);
    if (i) i.value = v ?? '';
  }

  function readInputValue(id) {
    const i = el(id);
    return i ? i.value : '';
  }

  function getSessionUser() {
    const sb = getSupabaseClient();
    return sb?.auth?.getSession().then(({ data }) => data?.session?.user || null);
  }

  function updateLocalDraftSnapshot(patch) {
    try {
      const key = `${LOCAL_STORAGE_PREFIX}${currentProcessId || 'null'}:${currentTemplate?.id || 'null'}`;
      const prev = JSON.parse(localStorage.getItem(key) || '{}');
      const next = { ...(prev || {}), ...(patch || {}), __localUpdatedAt: nowISO() };
      localStorage.setItem(key, JSON.stringify(next));
      memoryDraftBackups.set(key, next);
    } catch (_) {}
  }

  function readLocalDraftSnapshot() {
    try {
      const key = `${LOCAL_STORAGE_PREFIX}${currentProcessId || 'null'}:${currentTemplate?.id || 'null'}`;
      const cached = memoryDraftBackups.get(key);
      if (cached) return cached;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function storeLocalDraftSnapshot(obj) {
    try {
      const key = `${LOCAL_STORAGE_PREFIX}${currentProcessId || 'null'}:${currentTemplate?.id || 'null'}`;
      localStorage.setItem(key, JSON.stringify(obj || {}));
      memoryDraftBackups.set(key, obj || {});
    } catch (_) {}
  }

  function clearLocalDraftSnapshot() {
    try {
      const key = `${LOCAL_STORAGE_PREFIX}${currentProcessId || 'null'}:${currentTemplate?.id || 'null'}`;
      localStorage.removeItem(key);
      memoryDraftBackups.delete(key);
    } catch (_) {}
  }

  function notifySessionExpiredOnce() {
    if (sessionExpiredWarningShown) return;
    sessionExpiredWarningShown = true;
    Utils.setMsg('adMsg', SESSION_EXPIRED_MESSAGE, true);
  }

  function notifyLocalBackupRestore() {
    if (localBackupRestoreNotified) return;
    localBackupRestoreNotified = true;
    if (!sessionExpiredMsgOnScreen) {
      Utils.setMsg('adMsg', LOCAL_RESTORE_MESSAGE, true);
      sessionExpiredMsgOnScreen = true;
    }
  }

  function resetLocalBackupRestoreNotice() {
    localBackupRestoreNotified = false;
    sessionExpiredMsgOnScreen = false;
    Utils.setMsg('adMsg', '');
  }

  function guardDocumentalWrite() {
    if (typeof window.Modules?.safety?.guardDocumentalWrite === 'function') {
      return window.Modules.safety.guardDocumentalWrite();
    }
    return true;
  }

  function EXTRA_NC_CODE() { return 'NC_EXTRA'; }

  async function loadTemplateById(templateId) {
    if (!templateId) return null;
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Cliente Supabase indisponível.');
      const { data, error } = await sb
        .from('checklist_templates')
        .select('id,name,type,version,items')
        .eq('id', templateId)
        .not('approved_at', 'is', null)
        .single();
      if (error) throw error;
      return {
        ...data,
        items: Array.isArray(data?.items) ? data.items : []
      };
    } catch (err) {
      console.error('Falha ao carregar checklist aprovada.', err);
      Utils.setMsg('adMsg', 'Falha ao carregar checklist aprovada.', true);
      return null;
    }
  }

  function getChecklistValidationState() {
    const items = $$('#ckContainer .ck-item[data-code]');
    if (!items.length) return { ready: false, reason: 'Checklist não carregada.' };

    for (const wrap of items) {
      const val = wrap.dataset.value;
      if (!val) {
        return { ready: false, reason: 'Selecione uma opção para todos os itens da checklist.' };
      }
      // PATCH: observação obrigatória apenas para "Não conforme" (remove "Não aplicável")
      if (val === 'Não conforme') {
        const obsField = wrap.querySelector('textarea');
        if (!obsField || !obsField.value.trim()) {
          return { ready: false, reason: 'Informe uma observação para itens marcados como “Não conforme”.' };
        }
      }
    }
    const extraFlag = el('adNCExtra');
    if (extraFlag?.checked) {
      const extraObs = el('adOutrasObs');
      if (!extraObs || !extraObs.value.trim()) {
        return { ready: false, reason: 'Descreva a “Não conformidade não abarcada” em “Outras observações do(a) Analista”.' };
      }
    }
    return { ready: true };
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

  function clearChecklist() {
    stopAutosave();
    const box = el('ckContainer');
    box.innerHTML = '';
    currentTemplate = null;
    currentDraftId = null;
    lastEditAt = 0;
    updateSaveState();
  }

  // =========================
  // PATCH: NA de categoria
  // =========================
  function syncAllCategoryNAStates() {
    $$('#ckContainer .ck-category').forEach(section => {
      const checkbox = section.querySelector('.ck-category-na-checkbox');
      if (!checkbox) return;
      const items = Array.from(section.querySelectorAll('.ck-item[data-code]'));
      if (!items.length) {
        checkbox.checked = false;
        checkbox.indeterminate = false;
        return;
      }
      const values = items.map(item => item.dataset.value || '');
      const allNA = values.length > 0 && values.every(v => v === 'Não aplicável');
      const someNA = values.some(v => v === 'Não aplicável');
      checkbox.checked = allNA;
      checkbox.indeterminate = !allNA && someNA;
    });
  }

  function renderChecklist(template) {
    currentTemplate = template;
    currentDraftId = null;
    lastEditAt = 0;

    const box = el('ckContainer');
    box.innerHTML = '';
    if (!template) {
      box.innerHTML = '<div class="msg">Nenhuma checklist aprovada encontrada para este tipo.</div>';
      return;
    }

    const frag = document.createDocumentFragment();

    const title = document.createElement('h3');
    title.className = 'ck-template-title';
    title.textContent = template.name || 'Checklist';
    frag.appendChild(title);

    const warning = document.createElement('div');
    warning.className = 'ck-warning';
    warning.innerHTML = '<strong>Atenção!</strong> Os itens apresentados nesta checklist compõem uma relação não exaustiva de verificações a serem realizadas. Ao serem detectadas não conformidade não abarcadas pelos itens a seguir, haverá o pertinente registro no campo "Outras observações do(a) Analista".';
    frag.appendChild(warning);

    // PATCH: títulos de categoria colapsáveis + NA de categoria
    (template.items || []).forEach((cat, idx) => {
      const catSection = document.createElement('section');
      catSection.className = 'ck-category is-collapsed';

      const categoryHeader = document.createElement('div');
      categoryHeader.className = 'ck-category-header';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'ck-category-title';
      const titleText = (cat.categoria || '').trim() || `Categoria ${idx + 1}`;
      const titleSpan = document.createElement('span');
      titleSpan.textContent = titleText;
      const chevron = document.createElement('span');
      chevron.className = 'ck-category-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      toggle.appendChild(titleSpan);
      toggle.appendChild(chevron);
      toggle.setAttribute('aria-expanded', 'false');

      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'ck-category-items';
      const itemsWrapId = `ckCategoryItems${idx}`;
      itemsWrap.id = itemsWrapId;
      toggle.setAttribute('aria-controls', itemsWrapId);

      toggle.addEventListener('click', () => {
        const collapsed = catSection.classList.toggle('is-collapsed');
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      });

      // Checkbox "Categoria não aplicável"
      const naLabel = document.createElement('label');
      naLabel.className = 'ck-category-na';
      const naCheckbox = document.createElement('input');
      naCheckbox.type = 'checkbox';
      naCheckbox.className = 'ck-category-na-checkbox';
      naLabel.appendChild(naCheckbox);
      naLabel.appendChild(document.createTextNode('Categoria não aplicável'));

      categoryHeader.appendChild(toggle);
      categoryHeader.appendChild(naLabel);
      catSection.appendChild(categoryHeader);

      const updateCategoryNAState = () => {
        const items = Array.from(itemsWrap.querySelectorAll('.ck-item[data-code]'));
        if (!items.length) {
          naCheckbox.checked = false;
          naCheckbox.indeterminate = false;
          return;
        }
        const values = items.map(item => item.dataset.value || '');
        const allNA = values.length > 0 && values.every(v => v === 'Não aplicável');
        const someNA = values.some(v => v === 'Não aplicável');
        naCheckbox.checked = allNA;
        naCheckbox.indeterminate = !allNA && someNA;
      };

      const applyCategoryNAState = (checked) => {
        const items = Array.from(itemsWrap.querySelectorAll('.ck-item[data-code]'));
        items.forEach(item => {
          item.dataset.value = checked ? 'Não aplicável' : '';
          item.classList.remove('ck-has-nc');
          item.querySelectorAll('input[type="checkbox"]').forEach(chk => {
            const isNAOption = chk.value === 'Não aplicável';
            chk.checked = checked && isNAOption;
          });
        });
        updateCategoryNAState();
        markEdited();
        updateSaveState();
        scheduleDraftSave();
      };

      naCheckbox.addEventListener('change', () => {
        applyCategoryNAState(naCheckbox.checked);
      });

      (cat.itens || []).forEach(item => {
        const wrap = document.createElement('div');
        wrap.className = 'ck-item';
        wrap.dataset.code = item.code || '';

        const header = document.createElement('div');
        header.className = 'ck-item-header';
        header.innerHTML = `${item.code ? `<strong>${item.code}</strong> — ` : ''}${item.requisito || ''}`;
        wrap.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'ck-item-grid';

        const optionsCol = document.createElement('div');
        optionsCol.className = 'ck-item-options';
        const optionsList = document.createElement('div');
        optionsList.className = 'ck-options-list';

        ['Conforme', 'Não conforme', 'Não aplicável'].forEach(v => {
          const optLabel = document.createElement('label');
          optLabel.className = 'ck-option';
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.value = v;
          input.addEventListener('change', () => {
            const isChecked = input.checked;
            const options = Array.from(wrap.querySelectorAll('input[type="checkbox"]'));
            if (isChecked) {
              options.forEach(chk => {
                if (chk !== input) chk.checked = false;
              });
              wrap.dataset.value = v;
            } else {
              const anotherChecked = options.some(chk => chk !== input && chk.checked);
              if (!anotherChecked) {
                wrap.dataset.value = '';
              }
            }
            if (v === 'Não conforme') {
              wrap.classList.toggle('ck-has-nc', isChecked);
            } else if (isChecked) {
              wrap.classList.remove('ck-has-nc');
            } else if (!options.some(chk => chk.value === 'Não conforme' && chk.checked)) {
              wrap.classList.remove('ck-has-nc');
            }
            markEdited();
            updateSaveState();
            scheduleDraftSave();
            updateCategoryNAState();
          });

          const labelText = document.createElement('span');
          labelText.textContent = v;

          optLabel.appendChild(input);
          optLabel.appendChild(labelText);
          optionsList.appendChild(optLabel);
        });

        optionsCol.appendChild(optionsList);
        grid.appendChild(optionsCol);

        // ====== Detalhes/observações ======
        const detailsCol = document.createElement('div');
        detailsCol.className = 'ck-item-details';

        const obsBox = document.createElement('label');
        obsBox.className = 'ck-detail-card ck-observacao';
        const obsTitle = document.createElement('span');
        obsTitle.className = 'ck-detail-card-title';
        obsTitle.textContent = 'Observações';
        const obs = document.createElement('textarea');
        obs.rows = 3;
        obs.placeholder = 'Observações';
        obs.addEventListener('input', () => { markEdited();
          updateSaveState();
          scheduleDraftSave();
        });

        obsBox.appendChild(obsTitle);
        obsBox.appendChild(obs);
        detailsCol.appendChild(obsBox);

        if (item.texto_sugerido) {
          const suggestionBox = document.createElement('div');
          suggestionBox.className = 'ck-detail-card ck-suggestion';

          const suggestionTitle = document.createElement('span');
          suggestionTitle.className = 'ck-detail-card-title';
          suggestionTitle.textContent = 'Texto(s) sugerido(s) para não conformidade / não aplicação:';

          const suggestionText = document.createElement('div');
          suggestionText.className = 'ck-suggestion-text';
          suggestionText.textContent = item.texto_sugerido || '';

          suggestionBox.appendChild(suggestionTitle);
          suggestionBox.appendChild(suggestionText);
          detailsCol.appendChild(suggestionBox);
        }

        grid.appendChild(detailsCol);
        // ====== FIM ======

        wrap.appendChild(grid);
        itemsWrap.appendChild(wrap);
      });

      catSection.appendChild(itemsWrap);
      frag.appendChild(catSection);

      // Sincroniza estado NA após montar itens da categoria
      updateCategoryNAState();
    });

    const extraFlag = document.createElement('label');
    extraFlag.className = 'ck-extra-flag';
    const extraInput = document.createElement('input');
    extraInput.type = 'checkbox';
    extraInput.id = 'adNCExtra';
    extraInput.addEventListener('change', () => {
      markEdited();
      updateSaveState();
      scheduleDraftSave();
    });
    extraFlag.appendChild(extraInput);
    extraFlag.appendChild(document.createTextNode(' Foi identificada não conformidade não abarcada pelos itens anteriores (vide outras observações do(a) Analista)'));
    frag.appendChild(extraFlag);

    const extraObs = document.createElement('label');
    extraObs.className = 'ck-detail-card';
    const extraObsTitle = document.createElement('span');
    extraObsTitle.className = 'ck-detail-card-title';
    extraObsTitle.textContent = 'Outras observações do(a) Analista';
    const extraObsText = document.createElement('textarea');
    extraObsText.id = 'adOutrasObs';
    extraObsText.rows = 4;
    extraObsText.placeholder = 'Descreva aqui quaisquer não conformidades adicionais, se houver.';
    extraObsText.addEventListener('input', () => { markEdited();
      updateSaveState();
      scheduleDraftSave();
    });
    extraObs.appendChild(extraObsTitle);
    extraObs.appendChild(extraObsText);
    frag.appendChild(extraObs);

    box.appendChild(frag);
    // Sincroniza todos os checkboxes NA de categoria depois de renderizar
    syncAllCategoryNAStates();
    updateSaveState();
  }

  async function saveChecklistDraft() {
    if (!currentProcessId || !currentTemplate) return;
    const items = $$('#ckContainer .ck-item[data-code]');
    if (!items.length) return;

    // Coleta respostas da UI (mantém comportamento atual)
    const answers = items.map(wrap => {
      const code = wrap.dataset.code;
      const value = wrap.dataset.value || '';
      const obsField = wrap.querySelector('textarea');
      const obs = obsField ? obsField.value.trim() : '';
      return { code, value: value || null, obs: obs || null };
    });

    const extraNcField = el('adNCExtra');
    if (extraNcField) {
       answers.push({ code: EXTRA_NC_CODE(), value: extraNcField.checked ? 'Sim' : 'Não', obs: null });
    }

    const extraField = el('adOutrasObs');
    const extraValue = extraField ? extraField.value.trim() : '';

    // Snapshot local imediato
    storeLocalDraftSnapshot({
      answers,
      extra_obs: extraValue || null
    });
    updateLocalDraftSnapshot({ unsynced: true, lastError: null });

    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Cliente Supabase indisponível.');
      const { data, error } = await sb.rpc('rpc_upsert_checklist_draft', {
        p_process_id: currentProcessId,
        p_template_id: currentTemplate.id,
        p_answers: answers,
        p_extra_obs: extraValue || null
      });
      if (error) throw error;
      currentDraftId = data || currentDraftId || null;
      await ensureChecklistStartHistory(currentDraftId);
      updateLocalDraftSnapshot({
        unsynced: false,
        lastError: null,
        draft_id: currentDraftId,
        answers,
        extra_obs: extraValue || null
      });
    } catch (e) {
      console.error('[analise] falha ao salvar rascunho via RPC:', e);
      updateLocalDraftSnapshot({
        unsynced: true,
        lastError: e.message || String(e),
        answers,
        extra_obs: extraValue || null
      });
    }
  }

  function applyDraftToUI(draft) {
    if (!draft) {
      resetLocalBackupRestoreNotice();
      return;
    }
    if (draft.__fromLocalBackup && draft.__unsynced) {
      notifyLocalBackupRestore();
    } else {
      resetLocalBackupRestoreNotice();
    }
    const answers = Array.isArray(draft.answers) ? draft.answers : [];
    const map = new Map();
    answers.forEach(ans => {
      if (!ans || !ans.code) return;
      map.set(ans.code, ans);
    });

    $$('#ckContainer .ck-item[data-code]').forEach(wrap => {
      const code = wrap.dataset.code;
      const ans = map.get(code) || {};
      const value = ans.value || '';
      wrap.dataset.value = value || '';
      wrap.classList.toggle('ck-has-nc', value === 'Não conforme');
      wrap.querySelectorAll('input[type="checkbox"]').forEach(chk => {
        chk.checked = !!value && chk.value === value;
      });
      const obsField = wrap.querySelector('textarea');
      if (obsField) obsField.value = ans.obs || '';
    });

    const extraFlagField = el('adNCExtra');
    if (extraFlagField) {
      const extraAns = answers.find(a => a?.code === EXTRA_NC_CODE());
      extraFlagField.checked = (extraAns?.value || '') === 'Sim';
    }

    const extraObsField = el('adOutrasObs');
    if (extraObsField) {
      extraObsField.value = draft.extra_obs || '';
    }

    // Mantém o estado visual coerente para NA de categoria
    syncAllCategoryNAStates();
    updateSaveState();
  }

  async function abrirChecklistPDF(id, existingWindow = null) {
    const win = existingWindow || window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Cliente Supabase indisponível.');
      const { data, error } = await sb
        .from('checklist_responses')
        .select('answers,extra_obs,started_at,filled_at,filled_by,profiles:filled_by(name),processes(nup),checklist_templates(name,type,version,items)')
        .eq('id', id)
        .single();
      if (error) throw error;

      const render = window.Modules?.checklists?.pdf?.renderChecklistPDF
        || window.Modules?.checklistPDF?.renderChecklistPDF;
      if (typeof render !== 'function') {
        throw new Error('Utilitário de PDF indisponível.');
      }

      // >>> Patch: repassa metadados ao PDF final
      const startedAt = data.started_at ? Utils.fmtDateTime(data.started_at) : '—';
      const finishedAt = data.filled_at ? Utils.fmtDateTime(data.filled_at) : '—';
      const responsibleProfile = Array.isArray(data.profiles)
        ? data.profiles[0]
        : data.profiles;
      const responsible = responsibleProfile?.name || data.filled_by || '—';

      const url = render(data, {
        mode: 'final',
        startedAt: startedAt || '—',
        finishedAt: finishedAt || '—',
        responsible: responsible || '—'
      });
      // <<< Patch

      if (win) win.location.href = url;
    } catch (err) {
      if (win) win.close();
      alert(err.message || String(err));
    }
  }

  // ====== SALVAR COM DEBOUNCE ======
  let saveTimer = null;
  const SAVE_DEBOUNCE_MS = 800;
  function scheduleDraftSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveChecklistDraft, SAVE_DEBOUNCE_MS);
  }

  // >>> Estado da checklist: tenta carregar rascunho; senão consulta a última finalizada
  async function loadChecklistProgress(processId, templateId) {
    if (!processId || !templateId) {
      return { draft: null, finalized: null };
    }
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Cliente Supabase indisponível.');

      const { data: draft, error: draftError } = await sb
        .from('checklist_drafts')
        .select('*')
        .eq('process_id', processId)
        .eq('template_id', templateId)
        .maybeSingle();
      if (draftError) throw draftError;
      if (draft) {
        return { draft, finalized: null };
      }

      const { data: finalized, error: finalizedError } = await sb
        .from('checklist_responses')
        .select('id, filled_at, filled_by, profiles:filled_by(name)')
        .eq('process_id', processId)
        .eq('template_id', templateId)
        .eq('status', 'final')
        .order('filled_at', { ascending: false, nullsLast: false })
        .limit(1)
        .maybeSingle();
      if (finalizedError) throw finalizedError;
      return { draft: null, finalized: finalized || null };
    } catch (err) {
      console.error('Falha ao carregar rascunho.', err);
      return { draft: null, finalized: null };
    }
  }
  // <<< Estado da checklist

  async function evaluateChecklistResult(draft) {
    const answers = Array.isArray(draft?.answers) ? draft.answers : [];
    const hasNonConformity = answers.some(a => a?.value === 'Não conforme');
    return { hasNonConformity, summary: hasNonConformity ? 'Com não conformidade' : 'Sem não conformidade' };
  }

  async function finalizarChecklist() {
    if (!guardDocumentalWrite()) return;
    if (!currentProcessId || !currentTemplate) return;

    const state = getChecklistValidationState();
    if (!state.ready) {
      Utils.setMsg('adMsg', state.reason || 'Checklist incompleta.', true);
      return;
    }

    Utils.setMsg('adMsg', 'Finalizando checklist...');
    const pdfWindow = window.open('about:blank', '_blank', 'noopener');

    const items = $$('#ckContainer .ck-item[data-code]');
    const answers = items.map(wrap => {
      const code = wrap.dataset.code;
      const value = wrap.dataset.value || '';
      const obsField = wrap.querySelector('textarea');
      const obs = obsField ? obsField.value.trim() : '';
      return { code, value: value || null, obs: obs || null };
    });

    const extraField = el('adOutrasObs');
    const extraValue = extraField ? extraField.value.trim() : '';

    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Cliente Supabase indisponível.');
      await acquireLock().catch(() => {});
      const { data, error } = await sb.rpc('rpc_finalize_checklist', {
        p_process_id: currentProcessId,
        p_template_id: currentTemplate.id,
        p_answers: answers,
        p_extra_obs: extraValue || null,
        p_draft_id: currentDraftId || null
      });
      if (error) throw error;

      await abrirChecklistPDF(data, pdfWindow);
      await insertChecklistHistory('Checklist finalizada', {
        template_id: currentTemplate?.id || null,
        response_id: data || null,
        draft_id: currentDraftId || null,
        event: 'finish'
      });
      Utils.setMsg('adMsg', '');
      clearLocalDraftSnapshot();
      currentDraftId = null;
      await releaseLock();
      stopLockHeartbeat();
      lastEditAt = 0;
    } catch (err) {
      if (pdfWindow) pdfWindow.close();
      Utils.setMsg('adMsg', err.message || 'Falha ao finalizar checklist.', true);
    }
  }

  async function loadIndicador() {
    // (mantido conforme seu arquivo; se não houver, ignora)
  }

  // === PATCH: ações da checklist aprovada (Abrir + PDF) ===
  function createApprovedChecklistActions(row) {
    const container = document.createElement('div');
    container.className = 'actions';

    const btnOpen = document.createElement('button');
    btnOpen.type = 'button';
    // PATCH: muda rótulo para "Preencher"
    btnOpen.textContent = 'Preencher';
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

      const render = window.Modules?.checklists?.pdf?.renderChecklistPDF
        || window.Modules?.checklistPDF?.renderChecklistPDF;
      if (typeof render !== 'function') {
        throw new Error('Utilitário de PDF indisponível.');
      }

      const approvedAt = templateSummary?.approved_at
        ? Utils.fmtDateTime(templateSummary.approved_at)
        : '';
      const approvedBy = templateSummary?.approved_by_display
        || templateSummary?.approved_by
        || '';

      const response = {
        checklist_templates: template
      };

      const url = render(response, {
        mode: 'approved',
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
        .not('approved_at', 'is', null)
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

      // Resolver "Aprovada por" com lookup em profiles
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
      console.error('Falha ao listar checklists aprovadas.', err);
      el('adApprovedList').innerHTML = '<div class="msg error">Falha ao carregar as checklists aprovadas.</div>';
    }
  }

  async function openChecklistFromApproved(templateSummary) {
    clearChecklist();

    // Se ainda não houver processo aberto para este NUP, cria/obtém
    let nup = readInputValue('adNUP').trim();
    nup = nupSanitize(nup);
    if (!nup) {
      return Utils.setMsg('adMsg', 'Informe um NUP válido.', true);
    }
    const u = await getSessionUser();
    if (!u) {
      notifySessionExpiredOnce();
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      console.error('Cliente Supabase indisponível ao abrir checklist aprovada.');
      return Utils.setMsg('adMsg', 'Não foi possível conectar ao banco de dados.', true);
    }

    // Abre ou cria o processo e carrega o template aprovado
    let { data: pData, error: pErr } = await sb
      .from('processes')
      .select('id') // mantido conforme seu arquivo
      .eq('nup', nup)
      .maybeSingle();

    if (pErr) {
      console.error('Erro ao consultar processo por NUP:', pErr);
      return Utils.setMsg('adMsg', 'Falha ao consultar NUP.', true);
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
      // Observação: pData.type não foi selecionado neste select; mantido conforme seu arquivo original.
      currentProcessId = pData.id;
    }

    const template = await loadTemplateById(templateSummary.id);
    if (!template) {
      return Utils.setMsg('adMsg', 'Checklist selecionada não encontrada ou não aprovada.', true);
    }
    template.name = template.name || templateSummary.name || '';

    renderChecklist(template);
    // Acquire exclusive lock e iniciar heartbeats
    const gotLock = await acquireLock();
    startSessionHeartbeat();
    startAutosave();
    if (gotLock) startLockHeartbeat();

    let loadedDraft = null;
    let infoMsg = '';
    let skipLocalRestore = false; // >>> Patch
    if (template && currentProcessId) {
      const { draft, finalized } = await loadChecklistProgress(currentProcessId, template.id);
      loadedDraft = draft || null;
      if (draft) {
        currentDraftId = draft.id || null;
        applyDraftToUI(draft);
        infoMsg = 'Checklist em andamento carregada.';
      } else {
        applyDraftToUI(null);
        if (finalized) {
          const filledAt = finalized.filled_at ? Utils.fmtDateTime(finalized.filled_at) : '';
          const filledBy = finalized.profiles?.name || finalized.filled_by || '';
          const parts = ['Uma checklist para este processo já foi finalizada.'];
          if (filledAt) parts.push(`Finalizada em ${filledAt}.`);
          if (filledBy) parts.push(`Responsável: ${filledBy}.`);
          parts.push('Ao prosseguir, você preencherá uma nova checklist em branco.');
          infoMsg = parts.join(' ');
          // >>> Patch: evita restaurar rascunho local antigo quando já há finalizada
          skipLocalRestore = true;
          clearLocalDraftSnapshot();
          // <<< Patch
        }
      }
    }
    tryRestoreLocalBackupAgainst(loadedDraft, { skip: skipLocalRestore }); // >>> Patch
    Utils.setMsg('adMsg', infoMsg);
  }

  function bind() {
    const btnLimparAD = el('btnLimparAD');
    const btnLimpar = el('btnLimparChecklist');
    const btnFinalizar = el('adBtnFinalizarChecklist');
    const inputNup = el('adNUP');

    if (btnLimparAD) {
      btnLimparAD.addEventListener('click', ev => {
        ev.preventDefault();
        setInputValue('adNUP', '');
        clearChecklist();
        Utils.setMsg('adMsg', '');
      });
    }

    if (inputNup) {
      inputNup.addEventListener('input', ev => {
        const v = nupSanitize(ev.target.value);
        ev.target.value = v;
      });
    }

    if (btnLimpar) {
      btnLimpar.addEventListener('click', ev => {
        ev.preventDefault();
        if (!currentTemplate) return;
        if (!confirm('Limpar respostas desta checklist?')) return;
        renderChecklist(currentTemplate);
        Utils.setMsg('adMsg', 'Checklist limpa. As respostas serão salvas automaticamente.');
      });
    }

    if (btnFinalizar) {
      btnFinalizar.addEventListener('click', ev => {
        ev.preventDefault();
        if (!currentTemplate) return;
        if (!guardDocumentalWrite()) return;
        const state = getChecklistValidationState();
        if (!state.ready) {
          const msg = state.reason || 'Checklist incompleta. Finalize apenas após preencher todos os itens obrigatórios.';
          Utils.setMsg('adMsg', msg, true);
          window.alert(msg);
          return;
        }
        if (window.confirm('Deseja finalizar esta checklist? As respostas atuais serão salvas e a versão final será emitida.')) {
          finalizarChecklist();
        }
      });
    }

    // Instala ganchos de ciclo de vida uma única vez
    if (!lifecycleHooksInstalled) {
      lifecycleHooksInstalled = true;

      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && currentProcessId && currentTemplate) {
          try { await acquireLock(); } catch (_) {}
          try { await saveChecklistDraft(); } catch (_) {}
        }
      });

      window.addEventListener('online', async () => {
        if (currentProcessId && currentTemplate) {
          try { await acquireLock(); } catch (_) {}
          try { await saveChecklistDraft(); } catch (_) {}
        }
      }, { passive: true });

      window.addEventListener('beforeunload', () => {
        try { navigator.sendBeacon && navigator.sendBeacon('/noop','1'); } catch(_) {}
        releaseLock();
        stopLockHeartbeat();
        stopSessionHeartbeat();
        stopAutosave();
      }, { capture: true });
    }
  }

  function init() { bind(); }
  async function load() {
    clearChecklist();
    await Promise.all([
      loadIndicador(),
      loadApprovedChecklists()
    ]);
  }

  function getStartHistoryKey(draftId) {
    if (!draftId) return null;
    const processKey = currentProcessId || 'null';
    const templateKey = currentTemplate?.id || 'null';
    return `${processKey}:${templateKey}:${draftId}`;
  }

  async function ensureChecklistStartHistory(draftId) {
    if (!draftId || !currentProcessId || !currentTemplate) return;
    const key = getStartHistoryKey(draftId);
    if (!key || startHistoryRecordedKeys.has(key)) return;
    if (startHistoryPending.has(key)) return startHistoryPending.get(key);

    const sb = getSupabaseClient();
    if (!sb) return;

    const promise = (async () => {
      try {
        const { data, error } = await sb
          .from('history')
          .select('id')
          .eq('process_id', currentProcessId)
          .eq('details->>template_id', currentTemplate.id)
          .eq('details->>event', 'start')
          .eq('details->>draft_id', draftId)
          .limit(1);
        if (error) throw error;
        if (!Array.isArray(data) || data.length === 0) {
          await insertChecklistHistory('Checklist: início de preenchimento', {
            template_id: currentTemplate.id,
            draft_id: draftId,
            event: 'start'
          });
        }
        startHistoryRecordedKeys.add(key);
      } catch (err) {
        console.warn('[analise] falha ao registrar histórico de início da checklist:', err);
      } finally {
        startHistoryPending.delete(key);
      }
    })();

    startHistoryPending.set(key, promise);
    return promise;
  }

  // >>> Autosave robusto + histórico
  async function insertChecklistHistory(action, details = {}) {
    try {
      const sb = getSupabaseClient();
      if (!sb || !currentProcessId || !action) return;
      const u = await getSessionUser();
      if (!u?.id) return;
      await sb.from('history').insert({
        process_id: currentProcessId,
        action,
        details,
        user_id: u.id,
        user_name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email || null
      });
    } catch (e) {
      console.error('[analise] falha ao registrar histórico:', e);
    }
  }

  function markEdited() {
    lastEditAt = Date.now();
  }

  function startAutosave() {
    if (autosaveTimer) return;
    autosaveTimer = setInterval(async () => {
      const since = Date.now() - (lastEditAt || 0);
      // Salva sempre que houve edição recente OU se houver rascunho marcado como "unsynced" no backup local
      const backupKey = `${LOCAL_STORAGE_PREFIX}${currentProcessId || 'null'}:${currentTemplate?.id || 'null'}`;
      let unsynced = false;
      try {
        const obj = JSON.parse(localStorage.getItem(backupKey) || '{}');
        unsynced = !!obj.unsynced || !!obj.__unsynced;
      } catch (_) {}
      if (since <= INACTIVITY_MIN_MS || unsynced) {
        try { await acquireLock(); } catch (_) {}
        try { await saveChecklistDraft(); } catch (_) {}
      }
    }, AUTOSAVE_EVERY_MS);
  }
  function stopAutosave() { clearInterval(autosaveTimer); autosaveTimer = null; }

  function tryRestoreLocalBackupAgainst(draftRow, options = {}) {
    if (options?.skip) return false; // >>> Patch
    try {
      const key = `${LOCAL_STORAGE_PREFIX}${currentProcessId || 'null'}:${currentTemplate?.id || 'null'}`;
      const local = JSON.parse(localStorage.getItem(key) || '{}');
      if (!local || !local.__localUpdatedAt) return false;

      const localAt = Date.parse(local.__localUpdatedAt) || 0;
      const remoteAt = Date.parse(draftRow?.updated_at || draftRow?.filled_at || '') || 0;

      if (localAt > remoteAt) {
        const draftLike = {
          answers: Array.isArray(local.answers) ? local.answers : [],
          extra_obs: local.extra_obs || ''
        };
        draftLike.__fromLocalBackup = true;
        draftLike.__unsynced = !!local.unsynced || !!local.__unsynced;
        applyDraftToUI(draftLike);
        updateLocalDraftSnapshot({ unsynced: true });
        saveChecklistDraft().catch(() => {});
        return true;
      }
    } catch (e) {
      console.warn('[analise] falha ao comparar/aplicar backup local', e);
    }
    return false;
  }
  // <<< Autosave robusto + histórico

  return { init, load, syncDraftBackup: () => {/* mantido */} };
})();
