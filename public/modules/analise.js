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

  const SESSION_EXPIRED_MESSAGE = 'Sessão expirada. As respostas da checklist foram salvas neste computador. Faça login novamente e aguarde o salvamento automático antes de finalizar.';
  const LOCAL_RESTORE_MESSAGE = 'As respostas salvas anteriormente foram recuperadas deste computador. Faça login novamente e aguarde o salvamento automático antes de finalizar.';

  const CLIPBOARD_ICON = window.Modules?.processos?.CLIPBOARD_ICON
    || '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" class="icon-clipboard"><rect x="6" y="5" width="12" height="15" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M9 5V4a2 2 0 0 1 2-2h2a 2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><path d="m10 11 2 2 3.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path><path d="m10 16 2 2 3.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  // ==== Utilitários do patch (resultado da checklist e flag extra) ====
  const CHECKLIST_PDF = window.Modules?.checklistPDF || {};
  const EXTRA_NC_CODE = CHECKLIST_PDF.EXTRA_NON_CONFORMITY_CODE || '__ck_extra_nc__';

  // ======= Utilitários de backup local de rascunho (patch) =======
  function getLocalStorageSafe() {
    try {
      return window.localStorage || null;
    } catch (_) {
      return null;
    }
  }

  function getLocalDraftKey(processId, templateId) {
    if (!processId || !templateId) return null;
    return `${LOCAL_STORAGE_PREFIX}${processId}:${templateId}`;
  }

  function rememberDraftInMemory(key, record) {
    if (!key) return null;
    if (record) {
      memoryDraftBackups.set(key, record);
    } else {
      memoryDraftBackups.delete(key);
    }
    return record || null;
  }

  function readLocalDraft(processId = currentProcessId, templateId = currentTemplate?.id) {
    const key = getLocalDraftKey(processId, templateId);
    if (!key) return null;
    const storage = getLocalStorageSafe();
    if (storage) {
      let raw = null;
      try {
        raw = storage.getItem(key);
      } catch (err) {
        console.warn('[Checklist] Falha ao ler rascunho local do armazenamento.', err);
      }
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          rememberDraftInMemory(key, parsed);
          return parsed;
        } catch (err) {
          console.warn('[Checklist] Rascunho local inválido. Limpando entrada.', err);
          try { storage.removeItem(key); } catch (_) {}
          rememberDraftInMemory(key, null);
        }
      }
    }
    return memoryDraftBackups.get(key) || null;
  }

  function storeLocalDraftSnapshot(snapshot = {}, { processId = currentProcessId, templateId = currentTemplate?.id, markUnsynced = true } = {}) {
    const key = getLocalDraftKey(processId, templateId);
    if (!key) return null;
    const record = {
      process_id: processId,
      template_id: templateId,
      draft_id: snapshot.draft_id ?? snapshot.draftId ?? currentDraftId ?? null,
      answers: Array.isArray(snapshot.answers) ? snapshot.answers : [],
      extra_obs: snapshot.extra_obs ?? null,
      filled_by: snapshot.filled_by ?? null,
      unsynced: markUnsynced ? true : (typeof snapshot.unsynced === 'boolean' ? snapshot.unsynced : false),
      lastError: snapshot.lastError ?? null,
      updatedAt: snapshot.updatedAt || new Date().toISOString()
    };
    const storage = getLocalStorageSafe();
    if (storage) {
      try {
        storage.setItem(key, JSON.stringify(record));
      } catch (err) {
        console.warn('[Checklist] Falha ao gravar rascunho local.', err);
      }
    }
    rememberDraftInMemory(key, record);
    return record;
  }

  function updateLocalDraftSnapshot(updates = {}, { processId = currentProcessId, templateId = currentTemplate?.id } = {}) {
    const key = getLocalDraftKey(processId, templateId);
    if (!key) return null;
    const current = readLocalDraft(processId, templateId);
    if (!current) return null;
    const record = {
      ...current,
      ...updates
    };
    if (!('updatedAt' in updates)) {
      record.updatedAt = current.updatedAt || new Date().toISOString();
    }
    if (updates.answers && !Array.isArray(updates.answers)) {
      record.answers = Array.isArray(current.answers) ? current.answers : [];
    }
    const storage = getLocalStorageSafe();
    if (storage) {
      try {
        storage.setItem(key, JSON.stringify(record));
      } catch (err) {
        console.warn('[Checklist] Falha ao atualizar rascunho local.', err);
      }
    }
    rememberDraftInMemory(key, record);
    return record;
  }

  function clearLocalDraftSnapshot(processId = currentProcessId, templateId = currentTemplate?.id) {
    const key = getLocalDraftKey(processId, templateId);
    if (!key) return;
    const storage = getLocalStorageSafe();
    if (storage) {
      try { storage.removeItem(key); } catch (err) {
        console.warn('[Checklist] Falha ao limpar rascunho local.', err);
      }
    }
    rememberDraftInMemory(key, null);
  }

  function convertLocalBackupToDraft(localBackup) {
    if (!localBackup) return null;
    return {
      id: localBackup.draft_id || null,
      answers: Array.isArray(localBackup.answers) ? localBackup.answers : [],
      extra_obs: localBackup.extra_obs ?? null,
      filled_by: localBackup.filled_by ?? null,
      __fromLocalBackup: true,
      __unsynced: !!localBackup.unsynced,
      __localUpdatedAt: localBackup.updatedAt || null
    };
  }

  function notifySessionExpiredOnce() {
    if (sessionExpiredWarningShown) return;
    sessionExpiredWarningShown = true;
    sessionExpiredMsgOnScreen = true;
    Utils.setMsg('adMsg', SESSION_EXPIRED_MESSAGE, true);
    try {
      window.alert(SESSION_EXPIRED_MESSAGE);
    } catch (_) {}
  }

  function resetSessionExpiredWarning() {
    sessionExpiredWarningShown = false;
    if (sessionExpiredMsgOnScreen) {
      const msgBox = document.getElementById('adMsg');
      if (msgBox && (msgBox.textContent || '').trim() === SESSION_EXPIRED_MESSAGE) {
        Utils.setMsg('adMsg', '');
      }
      sessionExpiredMsgOnScreen = false;
    }
  }

  function notifyLocalBackupRestore() {
    Utils.setMsg('adMsg', LOCAL_RESTORE_MESSAGE, true);
    if (localBackupRestoreNotified) return;
    localBackupRestoreNotified = true;
    try {
      window.alert(LOCAL_RESTORE_MESSAGE);
    } catch (_) {}
  }

  function resetLocalBackupRestoreNotice() {
    if (localBackupRestoreNotified) {
      const msgBox = document.getElementById('adMsg');
      if (msgBox && (msgBox.textContent || '').trim() === LOCAL_RESTORE_MESSAGE) {
        Utils.setMsg('adMsg', '');
      }
    }
    localBackupRestoreNotified = false;
  }

  async function syncLocalDraftIfPossible(processId = currentProcessId, templateId = currentTemplate?.id) {
    if (syncingLocalDraft) return;
    const local = readLocalDraft(processId, templateId);
    if (!local || !local.unsynced) return;
    const user = await getUser();
    if (!user) return;
    if (processId !== currentProcessId || templateId !== currentTemplate?.id) return;
    syncingLocalDraft = true;
    try {
      await saveChecklistDraft();
    } finally {
      syncingLocalDraft = false;
    }
  }
  // ================================================================

  // ==== Normalização de tipos de processo x tipos de checklist (patch) ====
  const PROCESS_TYPE_TO_CHECKLIST = new Map([
    ['OPEA', ['OPEA - Documental']],
    ['PDIR', ['AD/HEL - Documental']],
    ['Inscrição', ['AD/HEL - Documental']],
    ['Alteração', ['AD/HEL - Documental']],
    ['Exploração', ['AD/HEL - Documental']]
  ]);
  const SUPPORTED_PROCESS_TYPES = Array.from(PROCESS_TYPE_TO_CHECKLIST.keys());

  const CHECKLIST_TYPE_VARIANTS = new Map([
    ['OPEA - Documental', ['OPEA - Documental', 'OPEA']],
    ['AD/HEL - Documental', ['AD/HEL - Documental', 'AD/HEL']]
  ]);

  const CHECKLIST_TYPE_ALIAS = (() => {
    const normalize = (value) => (
      typeof value === 'string'
        ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
        : ''
    );
    const map = new Map();
    CHECKLIST_TYPE_VARIANTS.forEach((variants, canonical) => {
      const canonicalKey = normalize(canonical);
      if (canonicalKey) map.set(canonicalKey, canonical);
      variants.forEach(variant => {
        const key = normalize(variant);
        if (key) map.set(key, canonical);
      });
    });
    return { map, normalize };
  })();

  const getCanonicalChecklistType = (value) => {
    if (typeof value !== 'string') return '';
    const key = CHECKLIST_TYPE_ALIAS.normalize(value);
    if (!key) return '';
    return CHECKLIST_TYPE_ALIAS.map.get(key) || '';
  };

  const CHECKLIST_TO_PROCESS_TYPES = (() => {
    const map = new Map();
    PROCESS_TYPE_TO_CHECKLIST.forEach((checklists, type) => {
      checklists.forEach(checklist => {
        if (!map.has(checklist)) map.set(checklist, new Set());
        map.get(checklist).add(type);
      });
    });
    return map;
  })();

  const getProcessTypesForChecklist = (value) => {
    const canonical = getCanonicalChecklistType(value) || (typeof value === 'string' ? value.trim() : '');
    const set = canonical ? CHECKLIST_TO_PROCESS_TYPES.get(canonical) : null;
    return set ? Array.from(set) : [];
  };

  const TYPE_ALIAS_MAP = (() => {
    const map = new Map();
    const normalizeKey = (value) => (
      typeof value === 'string'
        ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
        : ''
    );
    const register = (alias, canonical) => {
      const key = normalizeKey(alias);
      if (key) map.set(key, canonical);
    };

    PROCESS_TYPE_TO_CHECKLIST.forEach((checklists, type) => {
      register(type, type);
      register(`${type} - Documental`, type);
      checklists.forEach(checklist => {
        const processTypesForChecklist = CHECKLIST_TO_PROCESS_TYPES.get(checklist);
        if (processTypesForChecklist && processTypesForChecklist.size === 1) {
          const variants = CHECKLIST_TYPE_VARIANTS.get(checklist) || [];
          variants.forEach(variant => register(variant, type));
        }
      });
    });

    return { map, normalizeKey };
  })();

  const normalizeProcessType = (value) => {
    if (typeof value !== 'string') return '';
    const key = TYPE_ALIAS_MAP.normalizeKey(value);
    if (TYPE_ALIAS_MAP.map.has(key)) return TYPE_ALIAS_MAP.map.get(key);
    const trimmed = value.trim();
    return SUPPORTED_PROCESS_TYPES.includes(trimmed) ? trimmed : '';
  };

  const normalizeValue = (value) => (
    typeof value === 'string'
      ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
      : ''
  );

  const deriveProcessTypeFromTemplate = (template) => {
    if (!template) return '';
    if (template?.process_type) {
      const direct = normalizeProcessType(template.process_type);
      if (direct) return direct;
    }
    const candidates = [];
    const rawName = typeof template.name === 'string' ? template.name.trim() : '';
    if (rawName) {
      const dashIndex = rawName.indexOf('—');
      if (dashIndex > -1) {
        candidates.push(rawName.slice(0, dashIndex).trim());
      }
      const hyphenIndex = rawName.indexOf('-');
      if (hyphenIndex > -1) {
        candidates.push(rawName.slice(0, hyphenIndex).trim());
      }
    }
    const canonicalType = typeof template.type === 'string' ? template.type.trim() : '';
    if (canonicalType) candidates.push(canonicalType);
    for (const value of candidates) {
      const normalized = normalizeProcessType(value);
      if (normalized) return normalized;
    }
    return '';
  };

  function evaluateChecklistResult(source) {
    if (typeof CHECKLIST_PDF.getChecklistResult === 'function') {
      return CHECKLIST_PDF.getChecklistResult(source);
    }
    const answers = Array.isArray(source?.answers) ? source.answers : [];
    const hasTemplateNonConformity = answers.some(ans => normalizeValue(ans?.value) === 'nao conforme');
    const extraEntry = answers.find(ans => ans?.code === EXTRA_NC_CODE);
    const hasExtraNonConformity = normalizeValue(extraEntry?.value) === 'sim';
    const hasNonConformity = hasTemplateNonConformity || hasExtraNonConformity;
    return {
      answers,
      extraFlag: hasExtraNonConformity,
      hasNonConformity,
      summary: hasNonConformity ? 'Processo não conforme' : 'Processo conforme'
    };
  }
  // ========================================================================

  function debounce(fn, wait = 500) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  const scheduleDraftSave = debounce(() => { saveChecklistDraft(); }, 600);

  // ===== Registro de histórico (patch) =====
  function getHistoryUserName(user) {
    if (!user) return '';
    const metadataName = user.user_metadata && user.user_metadata.name;
    return metadataName || user.email || user.id || '';
  }

  async function insertChecklistHistoryRecord(processId, action, details, user) {
    if (!processId || !user?.id || !action) return;
    const payload = {
      process_id: processId,
      action,
      details: details || null,
      user_id: user.id,
      user_name: getHistoryUserName(user)
    };
    const { error } = await sb.from('history').insert(payload);
    if (error) throw error;
  }
  // =========================================

  // ===== Toast “Rascunho salvo!” (patch) =====
  let draftPopupDialog = null;
  let draftPopupTimer = null;
  function showDraftSavedPopup() {
    try {
      if (draftPopupTimer) {
        clearTimeout(draftPopupTimer);
        draftPopupTimer = null;
      }
    } catch (_) {}
    if (draftPopupDialog?.open) {
      try { draftPopupDialog.close(); } catch (_) {}
    }
    if (draftPopupDialog) {
      draftPopupDialog.remove();
      draftPopupDialog = null;
    }
    const dlg = document.createElement('dialog');
    dlg.className = 'toast-popup';
    dlg.innerHTML = '<p>Rascunho salvo!</p>';
    dlg.addEventListener('close', () => {
      try { dlg.remove(); } catch (_) {}
      if (draftPopupDialog === dlg) {
        draftPopupDialog = null;
        draftPopupTimer = null;
      }
    });
    document.body.appendChild(dlg);
    try { dlg.showModal(); } catch (_) { dlg.classList.add('toast-popup-open'); }
    draftPopupDialog = dlg;
    draftPopupTimer = window.setTimeout(() => {
      if (dlg.open) {
        try { dlg.close(); } catch (_) {}
      }
    }, 1800);
  }
  // ===========================================

  // ===== Guardas de escrita documental =====
  const Access = window.AccessGuards || null;
  function guardDocumentalWrite(options = {}) {
    if (!Access || typeof Access.ensureWrite !== 'function') return true;
    const opts = { msgId: 'adMsg', ...options };
    return Access.ensureWrite('documental', opts);
  }
  // ================================================

  async function loadTemplateById(templateId) {
    if (!templateId) return null;
    try {
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
      return null;
    }
  }

  function getChecklistValidationState() {
    const items = $$('#ckContainer .ck-item[data-code]');
    if (!items.length) {
      return { ready: false, reason: 'Selecione um checklist com itens para preencher.' };
    }
    for (const wrap of items) {
      const val = wrap.dataset.value;
      if (!val) {
        return { ready: false, reason: 'Selecione uma opção para todos os itens da checklist.' };
      }
      if (val === 'Não conforme' || val === 'Não aplicável') {
        const obsField = wrap.querySelector('textarea');
        if (!obsField || !obsField.value.trim()) {
          return { ready: false, reason: 'Informe uma observação para itens marcados como “Não conforme” ou “Não aplicável”.' };
        }
      }
    }
    // Validação adicional do patch: se marcar NC extra, exigir observação
    const extraFlag = el('adNCExtra');
    if (extraFlag?.checked) {
      const extraObs = el('adOutrasObs');
      if (!extraObs || !extraObs.value.trim()) {
        return {
          ready: false,
          reason: 'Descreva a não conformidade em “Outras observações do(a) Analista” ao assinalar a opção adicional.'
        };
      }
    }
    return { ready: true };
  }

  function getDraftValidationState(draft, template) {
    if (!draft || !template) {
      return { ready: false, reason: 'Nenhum rascunho salvo para finalizar.' };
    }
    const items = [];
    (template.items || []).forEach(cat => {
      (cat.itens || []).forEach(item => { if (item) items.push(item); });
    });
    if (!items.length) {
      return { ready: false, reason: 'Selecione um checklist com itens para preencher.' };
    }
    const answers = Array.isArray(draft.answers) ? draft.answers : [];

    // Validação adicional do patch: se houver flag extra, exigir extra_obs
    const draftEvaluation = evaluateChecklistResult(draft);
    if (draftEvaluation.extraFlag) {
      if (!(draft.extra_obs || '').trim()) {
        return {
          ready: false,
          reason: 'Preencha “Outras observações do(a) Analista” ao indicar não conformidade não abarcada pela checklist.'
        };
      }
    }

    return items.reduce((state, item) => {
      if (!state.ready) return state;
      const ans = answers.find(entry => entry && entry.code === (item.code || '')) || {};
      const value = ans.value || '';
      if (!value) {
        return { ready: false, reason: 'O rascunho ainda não possui todas as respostas salvas. Aguarde o salvamento automático antes de finalizar.' };
      }
      if ((value === 'Não conforme' || value === 'Não aplicável') && !(ans.obs || '').trim()) {
        return { ready: false, reason: 'Preencha as observações para itens marcados como “Não conforme” ou “Não aplicável”.' };
      }
      return state;
    }, { ready: true });
  }

  function updateSaveState() {
    const state = getChecklistValidationState();
    const { ready, reason } = state;
    const btnFinalizar = el('adBtnFinalizarChecklist');
    const btnLimpar = el('btnLimparChecklist');
    if (btnFinalizar) {
      // Botão só fica desabilitado quando não há checklist carregada;
      // quando houver checklist, validação é verificada no clique e mensagem é mostrada.
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
    if (currentTemplate) {
      renderChecklist(currentTemplate);
    } else {
      el('ckContainer').innerHTML = '';
      currentDraftId = null;
    }
    updateSaveState();
  }

  function renderChecklist(template) {
    currentTemplate = template || null;
    currentDraftId = null;

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

    // Aviso do patch (texto institucional)
    const warning = document.createElement('div');
    warning.className = 'ck-warning';
    warning.innerHTML = '<strong>Atenção!</strong> Os itens apresentados nesta checklist compõem uma relação não exaustiva de verificações a serem realizadas. Ao serem detectadas não conformidade não abarcadas pelos itens a seguir, marque a opção "Identificada não conformidade não abarcada pelos itens anteriores" e realize o registro pertinente no campo “Outras observações do(a) Analista”.';
    frag.appendChild(warning);

    (template.items || []).forEach(cat => {
      const catSection = document.createElement('section');
      catSection.className = 'ck-category';

      if (cat.categoria) {
        const h = document.createElement('h4');
        h.className = 'ck-category-title'; // Patch: adiciona classe
        h.textContent = cat.categoria || '';
        catSection.appendChild(h);
      }

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
        optionsList.className = 'ck-options';

        ['Conforme', 'Não conforme', 'Não aplicável'].forEach(v => {
          const optLabel = document.createElement('label');
          optLabel.className = 'ck-option';

          const input = document.createElement('input');
          input.type = 'checkbox';
          input.value = v;
          input.addEventListener('change', () => {
            if (input.checked) {
              optionsList.querySelectorAll('input[type="checkbox"]').forEach(other => {
                if (other !== input) other.checked = false;
              });
              wrap.dataset.value = v;
            } else {
              const selected = Array.from(optionsList.querySelectorAll('input[type="checkbox"]').values()).find(ch => ch.checked);
              wrap.dataset.value = selected ? selected.value : '';
            }
            wrap.classList.toggle('ck-has-nc', wrap.dataset.value === 'Não conforme');
            updateSaveState();
            scheduleDraftSave();
          });

          const labelText = document.createElement('span');
          labelText.textContent = v;

          optLabel.appendChild(input);
          optLabel.appendChild(labelText);
          optionsList.appendChild(optLabel);
        });

        optionsCol.appendChild(optionsList);
        grid.appendChild(optionsCol);

        // ====== BLOCO AJUSTADO PELO PATCH ======
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
        obs.addEventListener('input', () => {
          updateSaveState();
          scheduleDraftSave();
        });
        obsBox.appendChild(obsTitle);
        obsBox.appendChild(obs);

        const suggestionsBox = document.createElement('div');
        suggestionsBox.className = 'ck-detail-card ck-sugestoes';
        const sugTitle = document.createElement('span');
        sugTitle.className = 'ck-detail-card-title';
        sugTitle.textContent = 'Texto(s) sugerido';
        suggestionsBox.appendChild(sugTitle);

        const sugList = document.createElement('div');
        sugList.className = 'ck-sugestoes-list';

        const suggestions = Array.isArray(item.textos_sugeridos)
          ? item.textos_sugeridos
          : (item.texto_sugerido ? [item.texto_sugerido] : []);
        if (suggestions.length) {
          suggestions.forEach(texto => {
            if (!texto) return;
            const sugItem = document.createElement('div');
            sugItem.className = 'ck-sugestao-item';

            const sugText = document.createElement('span');
            sugText.textContent = texto;

            const useBtn = document.createElement('button');
            useBtn.type = 'button';
            useBtn.textContent = 'Usar';
            useBtn.addEventListener('click', () => {
              obs.value = texto;
              obs.dispatchEvent(new Event('input', { bubbles: true }));
            });

            sugItem.appendChild(sugText);
            sugItem.appendChild(useBtn);
            sugList.appendChild(sugItem);
          });
        } else {
          const emptyMsg = document.createElement('p');
          emptyMsg.className = 'muted';
          emptyMsg.textContent = 'Nenhum texto sugerido cadastrado.';
          sugList.appendChild(emptyMsg);
        }

        suggestionsBox.appendChild(sugList);

        detailsCol.appendChild(obsBox);
        detailsCol.appendChild(suggestionsBox);

        grid.appendChild(detailsCol);
        // ====== FIM DO BLOCO AJUSTADO ======

        wrap.appendChild(grid);
        catSection.appendChild(wrap);
      });

      frag.appendChild(catSection);
    });

    // Flag extra do patch: não conformidade não abarcada pelos itens
    const extraFlag = document.createElement('label');
    extraFlag.className = 'ck-extra-flag';
    const extraInput = document.createElement('input');
    extraInput.type = 'checkbox';
    extraInput.id = 'adNCExtra';
    extraInput.addEventListener('change', () => {
      updateSaveState();
      scheduleDraftSave();
    });
    const extraText = document.createElement('span');
    extraText.textContent = 'Identificada não conformidade não abarcada pelos itens anteriores';
    extraFlag.appendChild(extraInput);
    extraFlag.appendChild(extraText);
    frag.appendChild(extraFlag);

    const other = document.createElement('label');
    other.className = 'ck-outros';
    const otherTitle = document.createElement('span');
    otherTitle.textContent = 'Outras observações do(a) Analista';
    const otherInput = document.createElement('textarea');
    otherInput.id = 'adOutrasObs';
    otherInput.rows = 3;
    otherInput.addEventListener('input', () => {
      updateSaveState();
      scheduleDraftSave();
    });
    other.appendChild(otherTitle);
    other.appendChild(otherInput);
    frag.appendChild(other);

    box.appendChild(frag);
    updateSaveState();
  }

  async function loadChecklistDraft(processId, templateId) {
    currentDraftId = null;
    if (!processId || !templateId) return null;

    let remoteDraft = null;
    try {
      const { data, error } = await sb
        .from('checklist_responses')
        .select('id,answers,extra_obs,filled_by')
        .eq('process_id', processId)
        .eq('template_id', templateId)
        .eq('status', 'draft')
        .maybeSingle();
      if (error) throw error;
      if (data?.id) {
        currentDraftId = data.id;
        remoteDraft = { ...data, __fromLocalBackup: false, __unsynced: false, __localUpdatedAt: null };
      }
    } catch (err) {
      console.error('Falha ao carregar rascunho da checklist.', err);
    }

    const localBackup = readLocalDraft(processId, templateId);

    if (remoteDraft) {
      storeLocalDraftSnapshot({
        draft_id: remoteDraft.id || null,
        answers: Array.isArray(remoteDraft.answers) ? remoteDraft.answers : [],
        extra_obs: remoteDraft.extra_obs ?? null,
        filled_by: remoteDraft.filled_by ?? null,
        unsynced: false,
        lastError: null
      }, { processId, templateId, markUnsynced: false });
      resetLocalBackupRestoreNotice();
      resetSessionExpiredWarning();
      return remoteDraft;
    }

    if (localBackup) {
      const draft = convertLocalBackupToDraft(localBackup);
      if (draft?.id) currentDraftId = draft.id;
      if (localBackup.unsynced) {
        window.setTimeout(() => { syncLocalDraftIfPossible(processId, templateId); }, 0);
      }
      return draft;
    }

    return null;
  }

  async function saveChecklistDraft() {
    if (!currentProcessId || !currentTemplate) return;
    const items = $$('#ckContainer .ck-item[data-code]');
    if (!items.length) return;

    const answers = items.map(wrap => {
      const code = wrap.dataset.code;
      const value = wrap.dataset.value || '';
      const obsField = wrap.querySelector('textarea');
      const obs = obsField ? obsField.value.trim() : '';
      return {
        code,
        value: value ? value : null,
        obs: obs ? obs : null
      };
    });

    // Grava a resposta da flag extra do patch
    const extraNcField = el('adNCExtra');
    if (extraNcField) {
      answers.push({
        code: EXTRA_NC_CODE,
        value: extraNcField.checked ? 'Sim' : 'Não',
        obs: null
      });
    }

    const extraField = el('adOutrasObs');
    const extra = extraField ? extraField.value.trim() : '';
    const extraValue = extra ? extra : null;

    const baseSnapshot = {
      draft_id: currentDraftId,
      answers,
      extra_obs: extraValue,
      filled_by: null,
      unsynced: true,
      lastError: null
    };
    storeLocalDraftSnapshot(baseSnapshot, { markUnsynced: true });

    const u = await getUser();
    if (!u) {
      updateLocalDraftSnapshot({
        unsynced: true,
        lastError: 'Sessão expirada.'
      });
      notifySessionExpiredOnce();
      return;
    }

    storeLocalDraftSnapshot({
      ...baseSnapshot,
      filled_by: u.id,
      unsynced: true,
      lastError: null
    }, { markUnsynced: true });

    const payload = {
      answers,
      extra_obs: extraValue,
      filled_by: u.id
    };

    let saved = false;
    let historyDetails = null;
    try {
      if (currentDraftId) {
        const { error } = await sb
          .from('checklist_responses')
          .update({ ...payload })
          .eq('id', currentDraftId)
          .eq('status', 'draft');
        if (error) throw error;
        saved = true;
      } else {
        const startedAtIso = new Date().toISOString();
        const { data, error } = await sb
          .from('checklist_responses')
          .insert({
            process_id: currentProcessId,
            template_id: currentTemplate.id,
            started_at: startedAtIso,
            status: 'draft',
            ...payload
          })
          .select('id,started_at')
          .single();
        if (error) throw error;
        currentDraftId = data?.id || null;
        const startedAt = data?.started_at || startedAtIso;
        historyDetails = {
          checklist_name: currentTemplate?.name || null,
          template_id: currentTemplate?.id || null,
          status: 'draft',
          started_at: startedAt
        };
        saved = true;
      }
    } catch (err) {
      console.error('Falha ao salvar rascunho da checklist.', err);
      updateLocalDraftSnapshot({
        draft_id: currentDraftId || null,
        filled_by: u.id,
        unsynced: true,
        lastError: err?.message || 'Falha ao salvar rascunho da checklist.'
      });
    }
    if (saved) {
      updateLocalDraftSnapshot({
        draft_id: currentDraftId || null,
        filled_by: u.id,
        unsynced: false,
        lastError: null
      });
      resetSessionExpiredWarning();
      resetLocalBackupRestoreNotice();
      showDraftSavedPopup();
      if (historyDetails) {
        try {
          await insertChecklistHistoryRecord(
            currentProcessId,
            'Checklist iniciado',
            historyDetails,
            u
          );
        } catch (historyErr) {
          console.error('Falha ao registrar histórico do início da checklist.', historyErr);
        }
      }
    }
  }

  function applyDraftToUI(draft) {
    if (!draft) {
      resetLocalBackupRestoreNotice();
      updateSaveState();
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

    // Restaura a flag extra a partir da avaliação do rascunho (patch)
    const extraFlagField = el('adNCExtra');
    if (extraFlagField) {
      const draftEvaluation = evaluateChecklistResult(draft);
      extraFlagField.checked = !!draftEvaluation.extraFlag;
    }

    const extraField = el('adOutrasObs');
    if (extraField) extraField.value = draft.extra_obs || '';

    updateSaveState();
  }

  async function discardDraft(processId = currentProcessId, templateId = currentTemplate?.id) {
    if (!processId || !templateId) {
      clearLocalDraftSnapshot(processId, templateId);
      resetLocalBackupRestoreNotice();
      currentDraftId = null;
      return;
    }
    try {
      let query = sb.from('checklist_responses').delete().eq('status', 'draft');
      if (currentDraftId) {
        query = query.eq('id', currentDraftId);
      } else {
        query = query.eq('process_id', processId).eq('template_id', templateId);
      }
      await query;
    } catch (err) {
      console.error('Falha ao limpar rascunho da checklist.', err);
    }
    currentDraftId = null;
    clearLocalDraftSnapshot(processId, templateId);
    resetLocalBackupRestoreNotice();
  }

  async function iniciarChecklist(templateSummary) {
    if (!guardDocumentalWrite()) return;
    const nup = el('adNUP').value.trim();
    if (!nup) return Utils.setMsg('adMsg', 'Informe um NUP.', true);
    if (!templateSummary || !templateSummary.id) {
      return Utils.setMsg('adMsg', 'Selecione uma checklist aprovada.', true);
    }

    const rawChecklistType = (() => {
      const rawType = typeof templateSummary?.type === 'string' ? templateSummary.type.trim() : '';
      if (rawType) return rawType;
      if (typeof templateSummary?.name === 'string') {
        const name = templateSummary.name.trim();
        if (!name) return '';
        const dashIndex = name.indexOf('—');
        if (dashIndex > -1) return name.slice(0, dashIndex).trim();
        return name;
      }
      return '';
    })();
    const canonicalChecklistType = getCanonicalChecklistType(rawChecklistType);
    const allowedProcessTypes = getProcessTypesForChecklist(canonicalChecklistType || rawChecklistType);

    let processType = '';
    if (templateSummary?.process_type) {
      processType = normalizeProcessType(templateSummary.process_type);
    }
    if (!processType) {
      processType = deriveProcessTypeFromTemplate(templateSummary);
    }
    if (processType && allowedProcessTypes.length && !allowedProcessTypes.includes(processType)) {
      processType = '';
    }

    const { data: proc } = await sb.from('processes').select('id,type').eq('nup', nup).maybeSingle();
    if (proc) {
      const normalizedProcType = normalizeProcessType(proc.type);
      if (!normalizedProcType) {
        return Utils.setMsg('adMsg', 'Não foi possível identificar o tipo do processo existente.', true);
      }
      if (allowedProcessTypes.length && normalizedProcType && !allowedProcessTypes.includes(normalizedProcType)) {
        alert('Já existe processo com este NUP, mas o tipo não é compatível com a checklist selecionada.');
        return;
      }
      if (!processType) processType = normalizedProcType;
      if (!processType) {
        return Utils.setMsg('adMsg', 'Não foi possível identificar o tipo da checklist selecionada.', true);
      }
      currentProcessId = proc.id;
    } else {
      if (!processType) {
        if (allowedProcessTypes.length === 1) {
          processType = allowedProcessTypes[0];
        } else if (allowedProcessTypes.length > 1) {
          const msg = 'Checklist selecionada é utilizada em mais de um tipo de processo. Cadastre o processo na tela de Processos antes de continuar.';
          Utils.setMsg('adMsg', msg, true);
          window.alert(msg);
          return;
        }
      }
      if (!processType) {
        return Utils.setMsg('adMsg', 'Não foi possível identificar o tipo da checklist selecionada.', true);
      }
      const u = await getUser();
      if (!u) return Utils.setMsg('adMsg', 'Sessão expirada.', true);
      const { data, error } = await sb.from('processes')
        .insert({ nup, type: processType, created_by: u.id })
        .select('id')
        .single();
      if (error) return Utils.setMsg('adMsg', error.message, true);
      currentProcessId = data.id;
      if (window.Modules.processos?.reloadLists) {
        await window.Modules.processos.reloadLists();
      }
    }

    const template = await loadTemplateById(templateSummary.id);
    if (!template) {
      return Utils.setMsg('adMsg', 'Checklist selecionada não encontrada ou não aprovada.', true);
    }
    template.name = template.name || templateSummary.name || '';

    renderChecklist(template);
    if (template && currentProcessId) {
      const draft = await loadChecklistDraft(currentProcessId, template.id);
      applyDraftToUI(draft);
    }
    Utils.setMsg('adMsg', '');
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
    await saveChecklistDraft();

    // Evita finalizar a checklist caso o último salvamento local ainda não tenha
    // sido sincronizado com o servidor, prevenindo a perda das respostas que
    // acabaram de ser preenchidas.
    const localSnapshot = readLocalDraft(currentProcessId, currentTemplate.id);
    if (localSnapshot?.unsynced) {
      let msg = localSnapshot.lastError || 'As respostas da checklist ainda não foram sincronizadas.';
      if (msg === 'Sessão expirada.') {
        msg = SESSION_EXPIRED_MESSAGE;
      }
      if (msg === SESSION_EXPIRED_MESSAGE) {
        sessionExpiredWarningShown = true;
        sessionExpiredMsgOnScreen = true;
      }
      Utils.setMsg('adMsg', msg, true);
      try {
        window.alert(msg);
      } catch (_) {}
      return;
    }

    const draft = await loadChecklistDraft(currentProcessId, currentTemplate.id);
    if (!draft) {
      const msg = 'Nenhum rascunho encontrado. Aguarde o salvamento automático e tente novamente.';
      Utils.setMsg('adMsg', msg, true);
      window.alert(msg);
      return;
    }

    if (draft.__fromLocalBackup && draft.__unsynced) {
      Utils.setMsg('adMsg', LOCAL_RESTORE_MESSAGE, true);
      window.alert(LOCAL_RESTORE_MESSAGE);
      return;
    }

    if (!draft.id) {
      const msg = 'Rascunho inválido. Aguarde o salvamento automático e tente novamente.';
      Utils.setMsg('adMsg', msg, true);
      window.alert(msg);
      return;
    }

    const draftState = getDraftValidationState(draft, currentTemplate);
    if (!draftState.ready) {
      const msg = draftState.reason || 'Rascunho incompleto.';
      Utils.setMsg('adMsg', msg, true);
      window.alert(msg);
      return;
    }

    const u = await getUser();
    if (!u) {
      Utils.setMsg('adMsg', 'Sessão expirada.', true);
      return;
    }

    // Janela para o PDF aberta antecipadamente para evitar bloqueio de pop-up
    const pdfWindow = window.open('', '_blank');
    if (pdfWindow) pdfWindow.opener = null;

    const nowIso = new Date().toISOString();
    let saved;
    try {
      const { data, error } = await sb
        .from('checklist_responses')
        .update({
          answers: draft.answers || [],
          extra_obs: draft.extra_obs || null,
          filled_by: u.id,
          status: 'final',
          filled_at: nowIso
        })
        .eq('id', draft.id)
        .eq('status', 'draft')
        .select('id,filled_at')
        .single();
      if (error) throw error;
      saved = data;
      currentDraftId = null;
    } catch (err) {
      if (pdfWindow) pdfWindow.close();
      Utils.setMsg('adMsg', err.message || 'Falha ao finalizar checklist.', true);
      return;
    }

    const filledAt = saved?.filled_at || nowIso;
    const checklistResult = evaluateChecklistResult(draft);

    await sb.from('audit_log').insert({
      user_id: u.id,
      user_email: u.email,
      action: 'UPDATE',
      entity_type: 'checklist_responses',
      entity_id: saved?.id,
      details: { process_id: currentProcessId, checklist_name: currentTemplate.name, filled_at: filledAt }
    });

    try {
      await insertChecklistHistoryRecord(
        currentProcessId,
        'Checklist finalizado',
        {
          checklist_name: currentTemplate?.name || null,
          status: 'final',
          filled_at: filledAt,
          result_summary: checklistResult?.summary || null,
          has_non_conformity: !!checklistResult?.hasNonConformity
        },
        u
      );
    } catch (historyErr) {
      console.error('Falha ao registrar histórico da finalização da checklist.', historyErr);
    }

    await discardDraft(currentProcessId, currentTemplate.id);
    Utils.setMsg('adMsg', 'Checklist finalizada.');
    await loadIndicador();
    if (window.Modules.processos?.reloadLists) {
      try {
        await window.Modules.processos.reloadLists();
      } catch (err) {
        console.error('Falha ao recarregar listas de processos.', err);
      }
    }
    if (saved?.id) {
      await abrirChecklistPDF(saved.id, pdfWindow);
    } else if (pdfWindow) {
      pdfWindow.close();
    }
    clearChecklist();
  }

  async function clearForm() {
    await discardDraft();
    el('adNUP').value = '';
    Utils.setMsg('adMsg', '');
    currentProcessId = null;
    currentTemplate = null;
    clearChecklist();
  }

  async function loadIndicador() {
    const box = el('listaAD');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('checklist_responses')
        .select('process_id,filled_at,processes(nup)')
        .eq('status', 'final')
        .order('filled_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const seen = new Set();
      const rows = [];
      (data || []).forEach(r => {
        const procId = r.process_id;
        if (!procId || seen.has(procId)) return;
        seen.add(procId);
        rows.push({
          process_id: procId,
          nup: r.processes?.nup || '',
          filled_at: r.filled_at
        });
      });
      if (!rows.length) {
        box.innerHTML = '<div class="msg">Nenhuma checklist concluída.</div>';
        return;
      }
      Utils.renderTable(box, [
        { key: 'nup', label: 'NUP' },
        { key: 'filled_at', label: 'Última checklist', value: r => Utils.fmtDateTime(r.filled_at) },
        {
          label: 'Checklists',
          align: 'center',
          render: r => createChecklistButton(r.process_id)
        }
      ], rows);
    } catch (err) {
      box.innerHTML = `<div class="msg error">${err.message || String(err)}</div>`;
    }
  }

  async function loadApprovedChecklists() {
    const box = el('adApprovedList');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('checklist_templates')
        .select('id,name,type,version,approved_at,profiles:approved_by(name)')
        .not('approved_by', 'is', null)
        .order('approved_at', { ascending: false })
        .order('name');
      if (error) throw error;
      const rows = Array.isArray(data)
        ? data.map(row => ({
            id: row.id,
            name: row.name || '',
            type: row.type || '',
            version: row.version,
            approved_at: row.approved_at,
            approved_by_name: row.profiles?.name || '',
            process_type: deriveProcessTypeFromTemplate(row)
          }))
        : [];
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
      // Coluna "Nome" removida conforme patch
      Utils.renderTable(box, [
        { key: 'type', label: 'Tipo' },
        { key: 'version', label: 'Versão', align: 'center' },
        { key: 'approved_by_name', label: 'Aprovada por' },
        {
          key: 'approved_at',
          label: 'Aprovada em',
          value: r => (r.approved_at ? Utils.fmtDateTime(r.approved_at) : '')
        },
        {
          label: 'Ações',
          align: 'center',
          render: r => createApprovedChecklistActions(r)
        }
      ], latestRows);
    } catch (err) {
      box.innerHTML = `<div class="msg error">${err.message || String(err)}</div>`;
    }
  }

  function createApprovedChecklistActions(row) {
    const wrap = document.createElement('div');
    wrap.className = 'ad-approved-actions';
    const fillBtn = document.createElement('button');
    fillBtn.type = 'button';
    fillBtn.textContent = 'Preencher';
    if (!row?.id) {
      fillBtn.disabled = true;
    } else {
      fillBtn.addEventListener('click', () => iniciarChecklist(row));
    }
    wrap.appendChild(fillBtn);
    wrap.appendChild(createApprovedChecklistViewButton(row?.id));
    return wrap;
  }

  function createApprovedChecklistViewButton(templateId) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Ver';
    if (!templateId) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => abrirChecklistTemplatePDF(templateId));
    }
    return btn;
  }

  function createChecklistButton(processId) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'docIcon ckBtn on';
    btn.innerHTML = CLIPBOARD_ICON;
    btn.title = 'Checklists';
    btn.setAttribute('aria-label', 'Checklists');
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      openChecklistPopup(processId);
    });
    return btn;
  }

  async function loadChecklistHistory(procId, targetId = 'ckListaPop') {
    const box = el(targetId);
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('checklist_responses')
        .select('id,filled_at,answers,checklist_templates(name,version)')
        .eq('process_id', procId)
        .eq('status', 'final')
        .order('filled_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data)
        ? data.map(r => {
            const evaluation = evaluateChecklistResult(r);
            const version = r.checklist_templates?.version;
            const checklistName = r.checklist_templates?.name || '';
            const checklistWithVersion = version != null
              ? `${checklistName} (v${version})`
              : checklistName;
            return {
              id: r.id,
              checklist: checklistWithVersion,
              filled_at: r.filled_at,
              result: evaluation.summary || ''
            };
          })
        : [];
      if (!rows.length) {
        box.innerHTML = '<div class="msg">Nenhuma checklist preenchida.</div>';
        return;
      }
      Utils.renderTable(box, [
        { key: 'checklist', label: 'Doc' },
        { key: 'filled_at', label: 'Preenchida em', value: r => Utils.fmtDateTime(r.filled_at) },
        { key: 'result', label: 'Resultado' },
        {
          label: 'PDF',
          align: 'center',
          render: r => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = 'PDF';
            b.addEventListener('click', () => abrirChecklistPDF(r.id));
            return b;
          }
        }
      ], rows);
    } catch (err) {
      box.innerHTML = `<div class="msg error">${err.message || String(err)}</div>`;
    }
  }

  async function openChecklistPopup(procId) {
    if (!procId) return;
    if (window.Modules.processos?.showChecklistPopup) {
      window.Modules.processos.showChecklistPopup(procId);
      return;
    }
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="ckListaPop" class="table scrolly">Carregando…</div><menu><button type="button" id="ckClose">Fechar</button></menu>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#ckClose')?.addEventListener('click', () => dlg.close());
    dlg.showModal();
    await loadChecklistHistory(procId, 'ckListaPop');
  }

  async function abrirChecklistTemplatePDF(templateId, existingWindow = null) {
    if (!templateId) return;
    const win = existingWindow || window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const { data, error } = await sb
        .from('checklist_templates')
        .select('id,name,type,version,items,approved_at,profiles:approved_by(name)')
        .eq('id', templateId)
        .single();
      if (error) throw error;

      const render = window.Modules?.checklistPDF?.renderChecklistPDF;
      if (typeof render !== 'function') {
        throw new Error('Utilitário de PDF indisponível.');
      }

      const payload = {
        processes: { nup: '—' },
        checklist_templates: {
          name: data?.name || '',
          type: data?.type || '',
          version: data?.version,
          items: Array.isArray(data?.items) ? data.items : []
        },
        answers: []
      };

      // Parâmetros para o PDF aprovado
      const url = render(payload, {
        mode: 'approved',
        approvedAt: data?.approved_at ? Utils.fmtDateTime(data.approved_at) : '—',
        approvedBy: data?.profiles?.name || '—'
      });
      if (win) win.location.href = url;
    } catch (err) {
      if (win) win.close();
      alert(err.message || String(err));
    }
  }

  // ===== PDF com margens, quebra de página e word wrap =====
  async function abrirChecklistPDF(id, existingWindow = null) {
    // Reaproveita janela existente (quando fornecida) para evitar bloqueio de pop-up
    const win = existingWindow || window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const { data, error } = await sb
        .from('checklist_responses')
        .select('answers,extra_obs,started_at,filled_at,filled_by,profiles:filled_by(name),processes(nup),checklist_templates(name,type,version,items)')
        .eq('id', id)
        .single();
      if (error) throw error;

      const render = window.Modules?.checklistPDF?.renderChecklistPDF;
      if (typeof render !== 'function') {
        throw new Error('Utilitário de PDF indisponível.');
      }

      const startedAt = data.started_at ? Utils.fmtDateTime(data.started_at) : '—';
      const finishedAt = data.filled_at ? Utils.fmtDateTime(data.filled_at) : '—';
      const responsible = data.profiles?.name || data.filled_by || '—';

      // Parâmetros para o PDF final
      const url = render(data, {
        mode: 'final',
        startedAt: startedAt || '—',
        finishedAt: finishedAt || '—',
        responsible: responsible || '—'
      });

      if (win) win.location.href = url;
    } catch (err) {
      if (win) win.close();
      alert(err.message || String(err));
    }
  }
  // ===== Fim do patch =====

  function bind() {
    const btnLimparAD = el('btnLimparAD');
    const btnLimparChecklist = el('btnLimparChecklist');
    const btnFinalizarChecklist = el('adBtnFinalizarChecklist');

    if (btnLimparAD) btnLimparAD.addEventListener('click', async ev => {
      ev.preventDefault();
      if (!guardDocumentalWrite()) return;
      await clearForm();
    });
    if (btnLimparChecklist) {
      btnLimparChecklist.addEventListener('click', async ev => {
        ev.preventDefault();
        if (!currentTemplate) return;
        if (!guardDocumentalWrite()) return;
        if (window.confirm('Deseja limpar a checklist atual?')) {
          await discardDraft();
          clearChecklist();
        }
      });
    }
    if (btnFinalizarChecklist) {
      btnFinalizarChecklist.addEventListener('click', ev => {
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
        if (window.confirm('Deseja finalizar esta checklist? As respostas salvas serão registradas como versão final e o rascunho será removido.')) finalizarChecklist();
      });
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

  return { init, load, syncDraftBackup: () => syncLocalDraftIfPossible() };
})();
