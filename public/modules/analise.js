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

  // === Auto-save periódico mesmo em inatividade ===
  let autoSaveTimer = null;
  const AUTO_SAVE_INTERVAL_MS = 60 * 1000; // a cada 60s, sem alterar UX/visual

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
        const { data, error } = await sb.auth.getSession();
        if (error) return; // silencioso
        const hasSession = !!data?.session;
        if (!hasSession) {
          // Sessão expirou: avisar e marcar rascunho local como não sincronizado
          notifySessionExpiredOnce();
          updateLocalDraftSnapshot({ unsynced: true, lastError: 'Sessão expirada' });
        }
      } catch (_) {}
    }, SESSION_HEARTBEAT_MS);
  }
  function stopSessionHeartbeat() { clearInterval(sessionHeartbeatTimer); sessionHeartbeatTimer = null; }

  // == Auto-save periódico ==
  function startAutoSave() {
    if (autoSaveTimer) return;
    autoSaveTimer = setInterval(async () => {
      try {
        if (!currentTemplate || !currentProcessId) return;
        // salva rascunho do estado atual da UI
        await saveChecklistDraft();
      } catch (e) {
        // marca como não sincronizado em caso de erro
        updateLocalDraftSnapshot({ unsynced: true, lastError: e?.message || String(e) });
      }
    }, AUTO_SAVE_INTERVAL_MS);
  }
  function stopAutoSave() { clearInterval(autoSaveTimer); autoSaveTimer = null; }

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

  // ================== HISTÓRICO (migrado para dentro do módulo) ==================
  let historyStartLogged = false;

  async function insertChecklistHistory(action, details) {
    try {
      const sb = getSupabaseClient();
      if (!sb) return;
      const { data: { user } } = await sb.auth.getUser();
      if (!user || !currentProcessId) return;
      const payload = {
        process_id: currentProcessId,
        action, // 'Checklist iniciada' | 'Checklist finalizada'
        details, // objeto com infos úteis (template/process/result/etc.)
        user_id: user.id,
        user_name: (user.user_metadata?.full_name || user.email || 'Desconhecido')
      };
      const { error } = await sb.from('history').insert(payload);
      if (error) console.warn('[analise] histórico falhou:', error);
    } catch (e) {
      console.warn('[analise] histórico erro:', e);
    }
  }
  // ==============================================================================

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
    stopAutoSave();
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
    title.className = 'ck-template-ti
