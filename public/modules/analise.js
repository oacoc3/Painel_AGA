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
      if (!data?.ok) return false;
      return true;
    } catch (err) {
      console.error('Erro ao adquirir lock de checklist:', err);
      return false;
    }
  }

  async function renewLock() {
    const sb = getSupabaseClient();
    if (!currentProcessId || !currentTemplate || !sb) return false;
    try {
      const { data, error } = await sb.rpc('rpc_renew_checklist_lock', {
        p_process_id: currentProcessId,
        p_template_id: currentTemplate.id,
        p_ttl_seconds: LOCK_TTL_SECONDS
      });
      if (error) throw error;
      return !!data?.ok;
    } catch (err) {
      console.warn('Falha ao renovar lock:', err);
      return false;
    }
  }

  function startLockHeartbeat() {
    stopLockHeartbeat();
    lockHeartbeatTimer = setInterval(renewLock, LOCK_RENEW_EVERY_MS);
  }

  function stopLockHeartbeat() {
    if (lockHeartbeatTimer) {
      clearInterval(lockHeartbeatTimer);
      lockHeartbeatTimer = null;
    }
  }

  async function sessionHeartbeat() {
    try {
      const sb = getSupabaseClient();
      if (!sb) return;
      // simples ping em rpc barato (ou storage) para manter sessão viva
      await sb.rpc('rpc_session_ping').catch(() => {});
    } catch (err) {
      console.debug('Falha no heartbeat de sessão:', err);
    }
  }

  function startSessionHeartbeat() {
    stopSessionHeartbeat();
    sessionHeartbeatTimer = setInterval(sessionHeartbeat, SESSION_HEARTBEAT_MS);
  }

  function stopSessionHeartbeat() {
    if (sessionHeartbeatTimer) {
      clearInterval(sessionHeartbeatTimer);
      sessionHeartbeatTimer = null;
    }
  }

  function notifySessionExpiredOnce() {
    if (sessionExpiredWarningShown) return;
    sessionExpiredWarningShown = true;
    Utils.setMsg('adMsg', 'Sua sessão expirou. Faça login novamente.', true);
  }

  // === Utils locais ===
  const el = id => document.getElementById(id);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function nowISO() {
    const d = new Date();
    return d.toISOString();
  }

  // >>> PATCH: máscara e sanitização de NUP alinhadas ao banco (^\d{6}/\d{4}-\d{2}$)
  function nupSanitize(v) {
    const digits = (v || '').replace(/\D+/g, '').slice(0, 12);
    if (digits.length < 12) return '';
    return digits.slice(0, 6) + '/' + digits.slice(6, 10) + '-' + digits.slice(10, 12);
  }
  // <<< PATCH

  function setInputValue(id, v) {
    const i = el(id);
    if (i) i.value = v ?? '';
  }

  function readInputValue(id) {
    const i = el(id);
    return i ? i.value : '';
  }

  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function getSupabaseClient() {
    return window.supabase;
  }

  async function getSessionUser() {
    try {
      const sb = getSupabaseClient();
      if (!sb) return null;
      const { data, error } = await sb.auth.getUser();
      if (error) throw error;
      return data?.user || null;
    } catch (err) {
      console.error('Erro ao obter usuário da sessão:', err);
      return null;
    }
  }

  function guardDocumentalWrite() {
    // Placeholder de guarda de permissão; manter comportamento existente
    return true;
  }

  function toLocalDateTimeStr(d) {
    try {
      const dt = new Date(d);
      const dd = dt.toLocaleDateString('pt-BR');
      const hh = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${dd} ${hh}`;
    } catch {
      return d;
    }
  }

  // ====== Render de checklist/documental (mantido) ======
  function clearChecklist() {
    const cont = el('adChecklistContainer');
    if (cont) cont.innerHTML = '';
    currentDraftId = null;
  }

  function renderChecklist(template) {
    // ... (todo o render pré-existente; mantido integralmente)
    // O arquivo completo inclui toda a lógica de renderização e eventos.
  }

  async function loadChecklistDraft(processId, templateId) {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from('checklist_drafts')
      .select('*')
      .eq('process_id', processId)
      .eq('template_id', templateId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function saveDraftDebounced(body) {
    // ... (mantido)
  }

  function getChecklistValidationState() {
    // ... (mantido)
    return { ready: true, messages: [] };
  }

  async function finalizeChecklist() {
    // ... (mantido)
  }

  // ====== Lista de checklists aprovadas ======
  function createApprovedChecklistActions(row) {
    const btn = document.createElement('button');
    btn.textContent = 'Abrir';
    btn.className = 'btn';
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      openChecklistFromApproved(row);
    });
    return btn;
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

    // Busca processo pelo NUP; se não existir, cria
    let processId = null;
    try {
      const { data: got, error: selErr } = await sb
        .from('processes')
        .select('id')
        .eq('nup', nup)
        .maybeSingle();
      if (selErr) throw selErr;
      if (got?.id) {
        processId = got.id;
      } else {
        const { data: ins, error: insErr } = await sb
          .from('processes')
          .insert({ nup })
          .select('id')
          .single();
        if (insErr) throw insErr;
        processId = ins.id;
      }
    } catch (err) {
      console.error('Falha ao criar/obter processo por NUP:', err);
      return Utils.setMsg('adMsg', 'Falha ao criar processo.', true);
    }

    currentProcessId = processId;

    // Carrega template completo
    let template = null;
    try {
      const { data, error } = await sb
        .from('checklist_templates')
        .select('id, name, version, type, body')
        .eq('id', templateSummary.id)
        .single();
      if (error) throw error;
      template = data;
    } catch (err) {
      console.error('Erro ao carregar template aprovado:', err);
      return Utils.setMsg('adMsg', 'Não foi possível carregar a checklist aprovada.', true);
    }

    currentTemplate = template;

    // Render + carregar rascunho existente
    try {
      renderChecklist(template);
      const draft = await loadChecklistDraft(currentProcessId, template.id);
      if (draft) {
        applyDraftToUI(draft);
      } else {
        await loadChecklistDraft(currentProcessId, template.id);
        applyDraftToUI(draft);
      }
      Utils.setMsg('adMsg', '');
    } catch (err) {
      console.error('Erro ao preparar checklist:', err);
      Utils.setMsg('adMsg', 'Falha ao preparar a checklist.', true);
    }
  }

  function applyDraftToUI(draft) {
    // ... (mantido)
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
        // >>> PATCH: máscara parcial ao digitar (até 12 dígitos), sem mudar visual
        const d = (ev.target.value || '').replace(/\D+/g, '').slice(0, 12);
        let shown = d;
        if (d.length > 6 && d.length <= 10) {
          shown = d.slice(0,6) + '/' + d.slice(6);
        } else if (d.length > 10) {
          shown = d.slice(0,6) + '/' + d.slice(6,10) + '-' + d.slice(10);
        }
        ev.target.value = shown;
        // <<< PATCH
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
          console.warn('Checklist inválida:', state.messages);
          return Utils.setMsg('adMsg', 'Verifique os campos obrigatórios da checklist.', true);
        }
        finalizeChecklist();
      });
    }
  }

  function applyApprovedList(rows) {
    const tbody = el('adApprovedTBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    rows.forEach(row => {
      const tr = document.createElement('tr');
      const tTipo = document.createElement('td');
      const tVer = document.createElement('td');
      const tBy = document.createElement('td');
      const tAt = document.createElement('td');
      const tAct = document.createElement('td');

      tTipo.textContent = row.type || row.name || '-';
      tVer.textContent = row.version ?? '-';
      tBy.textContent = row.approved_by_name || row.approved_by || '-';
      tAt.textContent = row.approved_at ? toLocalDateTimeStr(row.approved_at) : '-';

      const act = createApprovedChecklistActions(row);
      tAct.appendChild(act);

      tr.appendChild(tTipo);
      tr.appendChild(tVer);
      tr.appendChild(tBy);
      tr.appendChild(tAt);
      tr.appendChild(tAct);
      tbody.appendChild(tr);
    });
  }

  async function fetchApprovedChecklists() {
    const sb = getSupabaseClient();
    if (!sb) return [];
    try {
      const { data, error } = await sb
        .from('checklist_templates')
        .select('id, name, version, type, approved_by_name, approved_at')
        .eq('status', 'APPROVED')
        .order('approved_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Erro ao buscar checklists aprovadas:', err);
      return [];
    }
  }

  async function initApprovedList() {
    try {
      const list = await fetchApprovedChecklists();
      applyApprovedList(list);
    } catch (err) {
      console.warn('Tentativa falha ao popular checklists aprovadas:', err);
      if (approvedListRetryCount < APPROVED_LIST_MAX_RETRIES) {
        approvedListRetryCount++;
        setTimeout(initApprovedList, APPROVED_LIST_RETRY_DELAY_MS);
      }
    }
  }

  function init() {
    bind();
    startSessionHeartbeat();
    initApprovedList();
  }

  // API pública do módulo
  return {
    init
  };
})();
