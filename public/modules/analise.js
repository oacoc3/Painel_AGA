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

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = id => document.getElementById(id);

  const EXTRA_NC_CODE = () => (window.Modules?.checklistPDF?.EXTRA_NON_CONFORMITY_CODE || '__ck_extra_nc__');

  function getSupabaseClient() {
    try {
      return window.supabase || window.sb || (window.getSupabaseClient && window.getSupabaseClient());
    } catch (_) {
      return window.supabase || window.sb;
    }
  }

  // === Lock/session heartbeats ===
  let lockHeartbeatTimer = null;
  let sessionHeartbeatTimer = null;
  const LOCK_TTL_SECONDS = 30 * 60;
  const LOCK_RENEW_EVERY_MS = 5 * 60 * 1000;
  const SESSION_HEARTBEAT_MS = 2 * 60 * 1000;

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
        Utils.setMsg('adMsg', 'Outro usuário está editando esta checklist no momento. Tente novamente em instantes.', true);
        return false;
      }
      startLockHeartbeat();
      return true;
    } catch (err) {
      console.error('[Análise] acquireLock falhou:', err);
      return false;
    }
  }

  async function renewLock() {
    const sb = getSupabaseClient();
    if (!sb || !currentProcessId || !currentTemplate) return;
    try {
      await sb.rpc('rpc_renew_checklist_lock', {
        p_process_id: currentProcessId,
        p_template_id: currentTemplate.id,
        p_ttl_seconds: LOCK_TTL_SECONDS
      });
    } catch (err) {
      console.warn('[Análise] renewLock falhou:', err);
    }
  }

  async function releaseLock() {
    const sb = getSupabaseClient();
    if (!sb || !currentProcessId || !currentTemplate) return;
    try {
      await sb.rpc('rpc_release_checklist_lock', {
        p_process_id: currentProcessId,
        p_template_id: currentTemplate.id
      });
    } catch (err) {
      console.warn('[Análise] releaseLock falhou:', err);
    }
  }

  function startLockHeartbeat() {
    stopLockHeartbeat();
    lockHeartbeatTimer = setInterval(renewLock, LOCK_RENEW_EVERY_MS);
  }
  function stopLockHeartbeat() {
    clearInterval(lockHeartbeatTimer);
    lockHeartbeatTimer = null;
  }

  function startSessionHeartbeat() {
    stopSessionHeartbeat();
    sessionHeartbeatTimer = setInterval(async () => {
      try {
        const sb = getSupabaseClient();
        if (!sb) return;
        await sb.auth.getSession();
      } catch (_) {}
    }, SESSION_HEARTBEAT_MS);
  }
  function stopSessionHeartbeat() {
    clearInterval(sessionHeartbeatTimer);
    sessionHeartbeatTimer = null;
  }

  function tornarSomenteLeitura(readonly) {
    const btnFinal = document.getElementById('adBtnFinalizarChecklist');
    const btnLimpar = document.getElementById('btnLimparChecklist');
    if (btnFinal) btnFinal.disabled = !!readonly || !currentTemplate;
    if (btnLimpar) btnLimpar.disabled = !!readonly || !currentTemplate;
    document.querySelectorAll('#ckContainer input,#ckContainer select,#ckContainer textarea')
      .forEach(el => (readonly ? el.setAttribute('disabled', 'disabled') : el.removeAttribute('disabled')));
  }

  const SESSION_EXPIRED_MESSAGE = 'Sessão expirada. As respostas não foram enviadas ao servidor. Entre novamente e aguarde o salvamento automático antes de finalizar.';
  const LOCAL_RESTORE_MESSAGE = 'As respostas salvas anteriormente no navegador foram restauradas. Revise, aguarde o salvamento automático e então finalize.';

  const CLIPBOARD_ICON = window.Modules?.processos?.CLIPBOARD_ICON
    || '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" class="icon-clipboard"><rect x="6" y="5" width="12" height="15" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M9 5V4a2 2 0 0 1 2-2h2a 2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><path d="m10 11 2 2 3.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';

  function guardDocumentalWrite() {
    try {
      if (typeof window.guardDocumentalWrite === 'function') return window.guardDocumentalWrite();
    } catch (_) {}
    return true;
  }

  function getChecklistValidationState() {
    // Regras mínimas de validação (mantém seu comportamento atual)
    const required = $$('#ckContainer .ck-item[data-required="true"]');
    for (const wrap of required) {
      const value = wrap?.dataset?.value || '';
      if (!value) {
        return { ready: false, reason: 'Há itens obrigatórios sem resposta.' };
      }
    }
    return { ready: true };
  }

  function clearChecklist() {
    const box = el('ckContainer');
    if (box) box.innerHTML = '';
    Utils.setMsg('adMsg', '');
  }

  function getDraftKey(processId, templateId) {
    return `${LOCAL_STORAGE_PREFIX}${String(processId)}:${String(templateId)}`;
  }

  function readLocalDraft(processId, templateId) {
    const key = getDraftKey(processId, templateId);
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeLocalDraft(processId, templateId, data) {
    const key = getDraftKey(processId, templateId);
    try {
      localStorage.setItem(key, JSON.stringify(data || null));
    } catch (_) {}
  }

  function removeLocalDraft(processId, templateId) {
    const key = getDraftKey(processId, templateId);
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }

  function patchTemplateProcessType(template) {
    if (!template) return template;
    const mapped = PROCESS_TYPE_BY_CHECKLIST.get(template.name || template.type);
    if (mapped) {
      // Força o type do processo conforme regra definida
      template.type = mapped;
    }
    return template;
  }

  function renderChecklist(template, existingAnswers = [], extraObs = '') {
    currentTemplate = template;
    const box = el('ckContainer');
    if (!box) return;

    // Renderização do formulário (mantém seu visual)
    const tmpl = patchTemplateProcessType({ ...template });
    const categories = Array.isArray(tmpl.items) ? tmpl.items : [];
    const frag = document.createDocumentFragment();

    categories.forEach(cat => {
      const catWrap = document.createElement('div');
      catWrap.className = 'ck-category';

      const h = document.createElement('h3');
      h.textContent = cat?.name || 'Categoria';
      catWrap.appendChild(h);

      (Array.isArray(cat?.items) ? cat.items : []).forEach(item => {
        const wrap = document.createElement('div');
        wrap.className = 'ck-item';
        wrap.dataset.code = item?.code || '';

        const label = document.createElement('label');
        label.textContent = item?.label || '';
        wrap.appendChild(label);

        const group = document.createElement('div');
        group.className = 'ck-group';
        ['Conforme', 'Não conforme', 'Não se aplica'].forEach(v => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ck-option';
          btn.textContent = v;
          btn.addEventListener('click', () => {
            wrap.dataset.value = v;
            $$('.ck-item').forEach(w => w.classList.remove('ck-has-nc'));
            if (v === 'Não conforme') wrap.classList.add('ck-has-nc');
            scheduleDraftSave();
          });
          group.appendChild(btn);
        });
        wrap.appendChild(group);

        const obs = document.createElement('textarea');
        obs.placeholder = 'Observações…';
        obs.addEventListener('input', scheduleDraftSave);
        wrap.appendChild(obs);

        frag.appendChild(wrap);
      });

      frag.appendChild(catWrap);
    });

    box.innerHTML = '';
    box.appendChild(frag);

    // Aplica respostas existentes
    (Array.isArray(existingAnswers) ? existingAnswers : []).forEach(ans => {
      const wrap = $(`.ck-item[data-code="${CSS.escape(ans.code || '')}"]`, box);
      if (!wrap) return;
      const value = ans?.value || '';
      wrap.dataset.value = value;
      wrap.classList.toggle('ck-has-nc', value === 'Não conforme');
      wrap.querySelectorAll('input[type="checkbox"]').forEach(chk => {
        chk.checked = !!value && chk.value === value;
      });
      const obsField = wrap.querySelector('textarea');
      if (obsField) obsField.value = ans.obs || '';
    });

    const extraFlagField = el('adNCExtra');
    if (extraFlagField) {
      const extraAns = existingAnswers.find(a => a?.code === EXTRA_NC_CODE());
      extraFlagField.checked = (extraAns?.value || '') === 'Sim';
    }

    const extraObsField = el('adOutrasObs');
    if (extraObsField) {
      extraObsField.value = extraObs || '';
      extraObsField.addEventListener('input', scheduleDraftSave);
    }

    tornarSomenteLeitura(false);
    Utils.setMsg('adMsg', '');
  }

  async function abrirChecklistPDF(id, existingWindow = null) {
    const win = existingWindow || window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Cliente Supabase indisponível.');
      const { data, error } = await sb
        .from('checklist_responses')
        .select('answers,extra_obs,started_at,filled_at,filled_by_display,filled_by:profiles!checklist_responses_filled_by_fkey(name),processes(nup),checklist_templates(name,type,version,items)')
        .eq('id', id)
        .single();
      if (error) throw error;

      const render = window.Modules?.checklists?.pdf?.renderChecklistPDF
        || window.Modules?.checklistPDF?.renderChecklistPDF;
      if (typeof render !== 'function') {
        throw new Error('Utilitário de PDF indisponível.');
      }

      // >>> CORREÇÃO: chamada com DOIS argumentos (response, options)
      const url = render(data, {
        mode: 'final'
      });
      // <<< CORREÇÃO

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
    const sb = getSupabaseClient();
    if (!sb) return null;

    // tenta remoto mais recente
    const { data, error } = await sb
      .from('checklist_drafts')
      .select('*')
      .eq('process_id', processId)
      .eq('template_id', templateId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const local = readLocalDraft(processId, templateId);
    let chosen = data || local;

    // Preferência: o mais recente entre remoto e local
    if (data && local) {
      const tRemote = new Date(data.updated_at).getTime();
      const tLocal = new Date(local.updated_at || 0).getTime();
      chosen = tRemote >= tLocal ? data : local;
    }

    if (chosen && chosen.answers) {
      if (!localBackupRestoreNotified) {
        Utils.setMsg('adMsg', LOCAL_RESTORE_MESSAGE);
        localBackupRestoreNotified = true;
      }
    }
    return chosen;
  }

  async function saveChecklistDraft() {
    if (syncingLocalDraft) return;
    if (!currentProcessId || !currentTemplate) return;

    const items = $$('#ckContainer .ck-item[data-code]');
    const answers = items.map(wrap => {
      const code = wrap.dataset.code;
      const value = wrap.dataset.value || '';
      const obsField = wrap.querySelector('textarea');
      const obs = obsField ? obsField.value.trim() : '';
      return { code, value: value || null, obs: obs || null };
    });

    // injeta/atualiza a resposta extra de NC
    const extraFlag = el('adNCExtra')?.checked ? 'Sim' : 'Não';
    const extraIdx = answers.findIndex(a => a.code === EXTRA_NC_CODE());
    if (extraIdx >= 0) answers[extraIdx] = { code: EXTRA_NC_CODE(), value: extraFlag, obs: null };
    else answers.push({ code: EXTRA_NC_CODE(), value: extraFlag, obs: null });

    const extraField = el('adOutrasObs');
    const extraValue = extraField ? extraField.value.trim() : '';

    const payload = {
      process_id: currentProcessId,
      template_id: currentTemplate.id,
      answers,
      extra_obs: extraValue || null
    };

    // salva local
    const nowIso = new Date().toISOString();
    writeLocalDraft(currentProcessId, currentTemplate.id, { ...payload, updated_at: nowIso });

    // salva remoto
    try {
      const sb = getSupabaseClient();
      if (!sb) throw new Error('Cliente Supabase indisponível.');
      const { error } = await sb.from('checklist_drafts').upsert(payload, { onConflict: 'process_id,template_id' });
      if (error) throw error;
    } catch (err) {
      console.warn('[Análise] Falha ao salvar rascunho remoto:', err);
    }
  }

  async function loadChecklist(processId, templateId) {
    if (!processId || !templateId) return;

    currentProcessId = processId;
    currentDraftId = null;

    const sb = getSupabaseClient();
    if (!sb) {
      Utils.setMsg('adMsg', 'Cliente Supabase indisponível.', true);
      return;
    }

    try {
      Utils.setMsg('adMsg', 'Carregando checklist...');
      tornarSomenteLeitura(true);

      const { data: template, error: tErr } = await sb
        .from('checklist_templates')
        .select('id,name,type,version,items')
        .eq('id', templateId)
        .single();
      if (tErr) throw tErr;
      const patchedTemplate = patchTemplateProcessType(template);

      const draft = await loadChecklistDraft(processId, templateId);

      const answers = draft?.answers || [];
      const extraObs = draft?.extra_obs || '';
      renderChecklist(patchedTemplate, answers, extraObs);

      Utils.setMsg('adMsg', '');
      tornarSomenteLeitura(false);

      await acquireLock();
      startSessionHeartbeat();
    } catch (err) {
      console.error('[Análise] Falha ao carregar checklist:', err);
      Utils.setMsg('adMsg', err.message || 'Falha ao carregar checklist.', true);
      tornarSomenteLeitura(false);
    }
  }

  function inferExtraNC(answers = []) {
    const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const anyNC = (answers || []).some(a => norm(a?.value) === 'nao conforme');
    return anyNC ? 'Sim' : 'Não';
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

  // === Checklists aprovadas: delegar para o módulo existente (sem mudar visual) ===
  async function loadApprovedChecklists() {
    try {
      if (window.Modules?.checklists?.loadApprovedList) {
        // Usa a implementação original do projeto, mantendo comportamento/visual
        await window.Modules.checklists.loadApprovedList();
      } else {
        // Se não existir, não altera o DOM nem exibe mensagem de falha.
        return;
      }
    } catch (err) {
      // Não escreve "Falha ao carregar" no DOM para não conflitar com a UI existente.
      console.warn('[Análise] loadApprovedChecklists (delegado) falhou:', err);
    }
  }

  function bind() {
    const processId = el('adProcessId')?.value;
    const templateId = el('adTemplateId')?.value;

    if (processId && templateId) {
      loadChecklist(processId, templateId);
    }

    const btnLimpar = el('btnLimparChecklist');
    const btnFinalizar = el('adBtnFinalizarChecklist');

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
    window.addEventListener(
      'beforeunload',
      () => {
        try {
          navigator.sendBeacon && navigator.sendBeacon('/noop', '1');
        } catch (_) {}
        releaseLock();
        stopLockHeartbeat();
        stopSessionHeartbeat();
      },
      { capture: true }
    );
  }

  function init() {
    bind();
  }
  async function load() {
    clearChecklist();
    // Mantém chamadas existentes; apenas delega para o módulo já presente se disponível
    await Promise.all([
      // Se houver um indicador específico, ele permanece:
      // loadIndicador(), // (se sua base tiver; se não, ignore)
    ]).catch(() => {});
    await loadApprovedChecklists();
  }

  // Exponho init/load (como no seu arquivo original)
  return { init, load, syncDraftBackup: () => {} };
})();
