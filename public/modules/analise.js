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
      if (val === 'Não conforme' || val === 'Não aplicável') {
        const obsField = wrap.querySelector('textarea');
        if (!obsField || !obsField.value.trim()) {
          return { ready: false, reason: 'Informe uma observação para itens marcados como “Não conforme” ou “Não aplicável”.' };
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
    const box = el('ckContainer');
    box.innerHTML = '';
    currentTemplate = null;
    currentDraftId = null;
    updateSaveState();
  }

  function renderChecklist(template) {
    currentTemplate = template;
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

    const warning = document.createElement('div');
    warning.className = 'ck-warning';
    warning.innerHTML = '<strong>Atenção!</strong> Os itens apresentados abaixo se referem aos requisitos regulamentares aplicáveis à Análise Documental. Quaisquer não conformidades não previstas devem ser registradas no campo “Outras observações do(a) Analista”.';
    frag.appendChild(warning);

    (template.items || []).forEach(cat => {
      const catSection = document.createElement('section');
      catSection.className = 'ck-category';

      if (cat.categoria) {
        const h = document.createElement('h4');
        h.className = 'ck-category-title';
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
        optionsList.className = 'ck-options-list';

        ['Conforme', 'Não conforme', 'Não aplicável'].forEach(v => {
          const optLabel = document.createElement('label');
          optLabel.className = 'ck-option';
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.value = v;
          input.addEventListener('change', () => {
            wrap.dataset.value = input.checked ? v : '';
            if (v === 'Não conforme') wrap.classList.toggle('ck-has-nc', input.checked);
            wrap.querySelectorAll('input[type="checkbox"]').forEach(chk => {
              if (chk !== input) chk.checked = false;
            });
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
        obs.addEventListener('input', () => {
          updateSaveState();
          scheduleDraftSave();
        });

        obsBox.appendChild(obsTitle);
        obsBox.appendChild(obs);
        detailsCol.appendChild(obsBox);

        grid.appendChild(detailsCol);
        // ====== FIM ======

        wrap.appendChild(grid);
        catSection.appendChild(wrap);
      });

      frag.appendChild(catSection);
    });

    const extraFlag = document.createElement('label');
    extraFlag.className = 'ck-extra-flag';
    const extraInput = document.createElement('input');
    extraInput.type = 'checkbox';
    extraInput.id = 'adNCExtra';
    extraInput.addEventListener('change', () => {
      updateSaveState();
      scheduleDraftSave();
    });
    extraFlag.appendChild(extraInput);
    extraFlag.appendChild(document.createTextNode(' Há “Não conformidade não abarcada pelos itens”?'));
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
    extraObsText.addEventListener('input', () => {
      updateSaveState();
      scheduleDraftSave();
    });
    extraObs.appendChild(extraObsTitle);
    extraObs.appendChild(extraObsText);
    frag.appendChild(extraObs);

    box.appendChild(frag);
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
      answers.push({ code: EXTRA_NC_CODE, value: extraNcField.checked ? 'Sim' : 'Não', obs: null });
    }

    const extraField = el('adOutrasObs');
    const extraValue = extraField ? extraField.value.trim() : '';

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
      updateLocalDraftSnapshot({ unsynced: false, lastError: null });
    } catch (e) {
      console.error('[analise] falha ao salvar rascunho via RPC:', e);
      updateLocalDraftSnapshot({ unsynced: true, lastError: e.message || String(e) });
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
        .select('answers,extra_obs,started_at,filled_at,filled_by:profiles(name),processes(nup),checklist_templates(name,type,version,items)')
        .eq('id', id)
        .single();
      if (error) throw error;

      const render = window.Modules?.checklists?.pdf?.renderChecklistPDF
        || window.Modules?.checklistPDF?.renderChecklistPDF;
      if (typeof render !== 'function') {
        throw new Error('Utilitário de PDF indisponível.');
      }

      const url = render({
        response: data,
        mode: 'final'
      });
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

  async function loadChecklistDraft(processId, templateId) {
    if (!processId || !templateId) return null;
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Cliente Supabase indisponível.');
      const { data, error } = await sb
        .from('checklist_responses')
        .select('*')
        .eq('process_id', processId)
        .eq('template_id', templateId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    } catch (err) {
      console.error('Falha ao carregar rascunho.', err);
      return null;
    }
  }

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
      const { data, error } = await sb.rpc('rpc_finalize_checklist', {
        p_process_id: currentProcessId,
        p_template_id: currentTemplate.id,
        p_answers: answers,
        p_extra_obs: extraValue || null
      });
      if (error) throw error;

      await abrirChecklistPDF(data, pdfWindow);
      Utils.setMsg('adMsg', '');
      await releaseLock();
      stopLockHeartbeat();
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

      // Chamada conforme patch enviado (assinatura a 2 argumentos)
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
      if (!sb || typeof sb.from !== 'function') {
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

      // ==== PATCH anterior (mantido): resolver "Aprovada por" com lookup em profiles ====
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
      // ==== FIM DO PATCH ====

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
      .select('id')
      .eq('nup', nup)
      .maybeSingle();

    if (pErr) {
      console.error('Erro ao consultar processo por NUP:', pErr);
      return Utils.setMsg('adMsg', 'Falha ao consultar NUP.', true);
    }

    if (!pData) {
      const payload = { nup };
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
    if (gotLock) startLockHeartbeat();

    if (template && currentProcessId) {
      const draft = await loadChecklistDraft(currentProcessId, template.id);
      applyDraftToUI(draft);
    }
    Utils.setMsg('adMsg', '');
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

    // Libera trava ao fechar/atualizar a página
    window.addEventListener('beforeunload', () => {
      try { navigator.sendBeacon && navigator.sendBeacon('/noop','1'); } catch(_) {}
      releaseLock();
      stopLockHeartbeat();
      stopSessionHeartbeat();
    }, { capture: true });
  }

  function init() { bind(); }
  async function load() {
    clearChecklist();
    await Promise.all([
      loadIndicador(),
      loadApprovedChecklists()
    ]);
  }

  return { init, load, syncDraftBackup: () => {/* mantido */} };
})();
