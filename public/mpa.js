// public/mpa.js
// Inicialização e navegação para MPA (Multi-Page Application)
// Mantém o visual e os módulos existentes; apenas substitui o roteamento da SPA.

(() => {
  const ROUTE_TO_PAGE = {
    login: 'index.html',
    dashboard: 'dashboard.html',
    processos: 'processos.html',
    prazos: 'prazos.html',
    modelos: 'modelos.html',
    analise: 'analise.html',
    adhel: 'adhel.html',
    pessoal: 'pessoal.html',
    admin: 'admin.html'
  };

  // ---- Início: suporte a auditoria de sessão/uso ----
  const AUDIT_SESSION_KEY = 'auditSessionId';
  const AUDIT_LOGIN_FLAG_KEY = 'auditLoginLogged';
  const AUDIT_LOGIN_UID_KEY = 'auditLoginUserId';

  function readAuditStorage(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (err) {
      console.warn('[audit] Falha ao ler sessionStorage:', err);
      return null;
    }
  }

  function writeAuditStorage(key, value) {
    try {
      if (value == null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch (err) {
      console.warn('[audit] Falha ao gravar sessionStorage:', err);
    }
  }

  function generateAuditSessionId() {
    try {
      if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
      }
    } catch (_) {}
    // Fallback RFC4122-ish
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  // ---- Fim: suporte a auditoria de sessão/uso ----

  const state = {
    session: null,
    profile: null,
    route: (() => {
      const file = location.pathname.split('/').pop() || 'index.html';
      const name = file.replace('.html', '');
      return (name === '' || name === 'index') ? 'login' : name;
    })(),
    // ---- Estado de auditoria ----
    audit: {
      clientSessionId: readAuditStorage(AUDIT_SESSION_KEY),
      loginRecorded: readAuditStorage(AUDIT_LOGIN_FLAG_KEY) === '1',
      recordedUserId: readAuditStorage(AUDIT_LOGIN_UID_KEY),
      lastModuleKey: null,
    },
  };

  function clearAuditState() {
    state.audit.clientSessionId = null;
    state.audit.loginRecorded = false;
    state.audit.recordedUserId = null;
    state.audit.lastModuleKey = null;
    writeAuditStorage(AUDIT_SESSION_KEY, null);
    writeAuditStorage(AUDIT_LOGIN_FLAG_KEY, null);
    writeAuditStorage(AUDIT_LOGIN_UID_KEY, null);
  }

  function ensureClientSessionId() {
    if (state.audit.clientSessionId) return state.audit.clientSessionId;
    const stored = readAuditStorage(AUDIT_SESSION_KEY);
    if (stored) {
      state.audit.clientSessionId = stored;
      return stored;
    }
    const generated = generateAuditSessionId();
    state.audit.clientSessionId = generated;
    writeAuditStorage(AUDIT_SESSION_KEY, generated);
    return generated;
  }

  async function recordAuditEvent(eventType, moduleName = null, { session, metadata } = {}) {
    try {
      const client = window.sb;
      if (!client?.from) return false;
      const currentSession = session || state.session || await getSession();
      const userId = currentSession?.user?.id;
      if (!userId) return false;
      const clientSessionId = ensureClientSessionId();
      const payload = {
        profile_id: userId,
        event_type: eventType,
        event_module: moduleName || null,
        client_session_id: clientSessionId,
      };
      if (metadata && typeof metadata === 'object' && Object.keys(metadata).length) {
        payload.event_metadata = metadata;
      }
      const { error } = await client.from('user_audit_events').insert(payload);
      if (error) {
        console.warn('[audit] Falha ao registrar evento', eventType, error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[audit] Erro ao registrar evento', eventType, err);
      return false;
    }
  }

  // Torna o registrador de auditoria disponível globalmente (p. ex., para módulos chamarem manualmente).
  window.AppAudit = window.AppAudit || {};
  window.AppAudit.recordEvent = recordAuditEvent;

  async function recordLoginEvent(session) {
    if (!session?.user?.id) return false;
    const uid = session.user.id;
    const already = state.audit.loginRecorded && state.audit.recordedUserId === uid;
    if (already) return false;
    const ok = await recordAuditEvent('login', null, { session });
    if (ok) {
      state.audit.loginRecorded = true;
      state.audit.recordedUserId = uid;
      writeAuditStorage(AUDIT_LOGIN_FLAG_KEY, '1');
      writeAuditStorage(AUDIT_LOGIN_UID_KEY, uid);
    }
    return ok;
  }

  async function recordLogoutEvent() {
    const ok = await recordAuditEvent('logout');
    if (ok) {
      state.audit.loginRecorded = false;
      state.audit.recordedUserId = null;
      writeAuditStorage(AUDIT_LOGIN_FLAG_KEY, null);
      writeAuditStorage(AUDIT_LOGIN_UID_KEY, null);
    }
    return ok;
  }

  async function recordModuleAccess(route) {
    if (!route || route === 'login') return false;
    const session = state.session || await getSession();
    if (!session?.user?.id) return false;
    const sessionId = ensureClientSessionId();
    const key = `${route}|${sessionId}|${session.user.id}`;
    if (state.audit.lastModuleKey === key) return false;
    const ok = await recordAuditEvent('module_access', route, {
      metadata: { path: window.location?.pathname || '', title: document.title || '' }
    });
    if (ok) {
      state.audit.lastModuleKey = key;
    }
    return ok;
  }

  function renderFooterVersion() {
    const e = document.getElementById('footBuild');
    if (!e) return;
    const x = window.BUILD_INFO || {};
    const parts = [];
    if (x.commit) parts.push(x.commit.slice(0,7));
    if (x.time) parts.push(new Date(x.time).toLocaleString());
    e.textContent = parts.join(' • ');
  }

  function renderHeaderStamp() {
    const p = state.profile;
    const userLbl = document.getElementById('userName');
    const roleLbl = document.getElementById('userRole');
    const buildLbl = document.getElementById('buildInfo');

    if (userLbl) userLbl.textContent = p ? (p.name || p.email || '') : '';
    if (roleLbl) roleLbl.textContent = p ? (p.role || '') : '';

    const bi = window.BUILD_INFO || {};
    if (buildLbl && (bi.deploy_id || bi.commit)) {
      const s = [bi.deploy_id || '', (bi.commit || '').slice(0,7), new Date().toLocaleString()].join(' • ');
      buildLbl.textContent = s;
    } else if (buildLbl) {
      buildLbl.textContent = '';
    }
  }

  function setActiveNav() {
    const r = state.route;
    document.querySelectorAll('#topNav button[data-route]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.route === r);
    });
  }

  // ---- Novo: limpeza local de sessão Supabase (fallback de segurança) ----
  function clearSupabaseStoredSession(client) {
    let cleared = false;
    try {
      const auth = client?.auth;
      if (!auth) return false;
      const storage = auth.storage || window.localStorage;
      if (!storage || typeof storage.removeItem !== 'function') return false;
      const knownKeys = [
        auth.storageKey,
        auth.persistSessionKey,
        auth.recoverSessionKey,
        auth.multiTabKey,
      ].filter((key) => typeof key === 'string' && key.length);
      knownKeys.forEach((key) => {
        try {
          storage.removeItem(key);
          cleared = true;
        } catch (err) {
          console.warn(`[mpa] Falha ao remover chave de sessão Supabase ${key}:`, err);
        }
      });
      if (!cleared && typeof storage.length === 'number' && typeof storage.key === 'function') {
        const candidateKeys = [];
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (key && key.startsWith('sb-')) {
            candidateKeys.push(key);
          }
        }
        candidateKeys.forEach((key) => {
          try {
            storage.removeItem(key);
            cleared = true;
          } catch (err) {
            console.warn(`[mpa] Falha ao remover chave Supabase derivada ${key}:`, err);
          }
        });
      }
    } catch (err) {
      console.warn('[mpa] Falha ao limpar sessão local do Supabase:', err);
    }
    return cleared;
  }

  // ---- Novo: reforço de signOut local + limpeza de storage Supabase ----
  async function forceSupabaseSignOut(client) {
    if (!client?.auth?.signOut) {
      return false;
    }

    let changed = false;

    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) {
        console.warn('[mpa] SignOut local forçado falhou:', error);
      } else {
        changed = true;
      }
    } catch (err) {
      console.warn('[mpa] Erro ao executar signOut local forçado:', err);
    }

    if (clearSupabaseStoredSession(client)) {
      changed = true;
    }

    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch (_) {}

    return changed;
  }

  // Trata o logout e atualiza a UI antes de redirecionar
  async function handleLogout() {
    let stayOnLogin = false;
    let shouldReload = true;
    let sessionCleared = false;
    let primarySignOutError = null;

    try {
      await recordLogoutEvent();
    } catch (err) {
      console.warn('[mpa] Falha ao registrar logout:', err);
    }

    const client = window.sb;
    if (client?.auth?.signOut) {
      try {
        const { error } = await client.auth.signOut();
        if (error) {
          primarySignOutError = error;
        }
      } catch (err) {
        primarySignOutError = err;
        console.error('[mpa] Erro inesperado ao encerrar sessão:', err);
      }
    } else {
      primarySignOutError = new Error('Supabase auth.signOut indisponível');
    }

    if (primarySignOutError) {
      console.warn('[mpa] Falha no signOut padrão, tentando fallback local:', primarySignOutError);
      let fallbackSucceeded = false;
      try {
        fallbackSucceeded = await forceSupabaseSignOut(client);
      } catch (err) {
        console.warn('[mpa] Erro inesperado ao reforçar signOut local:', err);
      }
      if (!fallbackSucceeded) {
        console.warn('[mpa] Não foi possível limpar sessão local do Supabase.');
      }
    }

    let finalSession = null;
    let sessionCheckFailed = false;

    const refreshSessionStatus = async () => {
      try {
        const session = await getSession();
        finalSession = session;
        sessionCleared = !session?.user;
        sessionCheckFailed = false;
      } catch (err) {
        sessionCheckFailed = true;
        sessionCleared = false;
        console.error('[mpa] Falha ao verificar sessão após logout:', err);
      }
    };

    await refreshSessionStatus();

    const maxForcedAttempts = 3;
    let attempt = 0;

    while (!sessionCheckFailed && finalSession?.user && attempt < maxForcedAttempts) {
      attempt += 1;
      console.warn(`[mpa] Sessão Supabase ainda ativa; reforçando logout (tentativa ${attempt}/${maxForcedAttempts}).`);
      try {
        await forceSupabaseSignOut(client);
      } catch (err) {
        console.warn('[mpa] Falha inesperada durante tentativa adicional de logout:', err);
      }
      await refreshSessionStatus();
      if (!sessionCheckFailed && finalSession?.user) {
        console.warn(`[mpa] Sessão Supabase permanece após tentativa ${attempt}.`);
      }
    }

    if (!sessionCheckFailed) {
      state.session = finalSession;
    }

    if (!sessionCheckFailed && finalSession?.user) {
      shouldReload = false;
      console.error('[mpa] Sessão Supabase permanece ativa após tentativas de logout forçado.');
      try {
        window.alert('Não foi possível encerrar a sessão. A página não será recarregada.');
      } catch (err) {
        console.warn('[mpa] Falha ao exibir alerta de erro de logout:', err);
      }
      return { stayOnLogin: false, shouldReload, sessionCleared };
    }

    clearAuditState();

    try {
      stayOnLogin = await ensureAuthAndUI();
    } catch (err) {
      console.error('[mpa] Erro ao atualizar interface após logout:', err);
    }

    if (!stayOnLogin) {
      window.location.replace('index.html');
    }

    return { stayOnLogin, shouldReload, sessionCleared };
  }

  function bindNav() {
    const nav = document.getElementById('topNav');
    if (!nav) return;
    nav.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-route]');
      if (!btn) return;
      const r = btn.dataset.route;
      const page = ROUTE_TO_PAGE[r] || 'dashboard.html';
      window.location.href = page;
    });

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
      btnLogout.addEventListener('click', async (ev) => {
        ev.preventDefault();
        let shouldReload = false;
        try {
          const result = await handleLogout();
          shouldReload = result?.shouldReload === true;
        } catch (err) {
          console.error('[mpa] Falha inesperada ao processar logout:', err);
          shouldReload = false;
        }
        if (shouldReload) {
          try {
            window.location.reload();
          } catch (err) {
            console.warn('[mpa] Falha ao recarregar após logout:', err);
            window.location.replace('index.html');
          }
        }
      });
    }
  }

  async function loadProfile() {
    const u = await getUser();
    if (!u) {
      state.profile = null;
      window.APP_PROFILE = null;
      renderHeaderStamp();
      const a = document.getElementById('btnAdmin'); if (a) a.classList.add('hidden');
      return null;
    }
    const { data, error } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
    if (error) {
      console.error(error);
      state.profile = null;
      window.APP_PROFILE = null;
      renderHeaderStamp();
      const a = document.getElementById('btnAdmin'); if (a) a.classList.add('hidden');
      return null;
    }
    state.profile = data;
    window.APP_PROFILE = data;
    renderHeaderStamp();
    const isAdmin = data.role === 'Administrador';
    const a = document.getElementById('btnAdmin'); if (a) a.classList.toggle('hidden', !isAdmin);
    return data;
  }

  // Garante que o JWT (JSON Web Token) contenha 'role' e 'name' iguais ao perfil.
  async function ensureJwtMetadataFromProfile() {
    const u = await getUser();
    if (!u) return false;
    const roleJwt = (u.user_metadata && u.user_metadata.role) || null;
    const nameJwt = (u.user_metadata && u.user_metadata.name) || null;

    // Usa o profile carregado no estado ou recarrega se necessário
    const p = state.profile || (await sb.from('profiles').select('*').eq('id', u.id).maybeSingle()).data;
    if (!p) return false;

    const needUpdate = (roleJwt !== p.role) || (!nameJwt && p.name);
    if (!needUpdate) return false;

    try {
      await sb.auth.updateUser({ data: { role: p.role, name: p.name } });
      // Força refresh para que o novo JWT (com role) passe nas RLS imediatamente
      await sb.auth.refreshSession();
      return true;
    } catch (e) {
      console.warn('[mpa] Falha ao sincronizar JWT metadata:', e);
      return false;
    }
  }

  let clockTimer = null;
  function startClock() {
    stopClock();
    clockTimer = setInterval(() => renderHeaderStamp(), 60_000);
  }
  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  async function ensureAuthAndUI() {
    state.session = await getSession();
    const onLogin = state.route === 'login';

    if (!state.session) {
      clearAuditState();
      stopClock();
      if (onLogin) {
        // Esconde barras
        document.getElementById('topNav')?.classList.add('hidden');
        document.getElementById('userBox')?.classList.add('hidden');
        return true; // permanecer na tela de login
      } else {
        // redireciona para login
        window.location.replace('index.html');
        return false;
      }
    }

    await loadProfile();
    await ensureJwtMetadataFromProfile();
    state.session = await getSession(); // reobtém sessão após possível refresh
    ensureClientSessionId();
    startClock();
    // Mostra barras exceto na tela de login
    document.getElementById('topNav')?.classList.toggle('hidden', onLogin);
    document.getElementById('userBox')?.classList.toggle('hidden', onLogin);
    if (onLogin) {
      window.location.replace('dashboard.html');
      return false;
    }
    if (state.route === 'admin' && state.profile?.role !== 'Administrador') {
      window.location.replace('dashboard.html');
      return false;
    }
    setActiveNav();
    return true;
  }

  function bootModules() {
    const onLogin = state.route === 'login';
    if (onLogin && !state.session) {
      window.Modules?.auth?.init?.();
      return;
    }
    Object.values(window.Modules || {}).forEach(m => m.init?.());
    const isAdmin = (state.profile?.role || window.APP_PROFILE?.role) === 'Administrador';
    switch (state.route) {
      case 'dashboard':  window.Modules.dashboard?.load?.(); break;
      case 'processos':  window.Modules.processos?.load?.(); break;
      case 'prazos':     window.Modules.prazos?.load?.(); break;
      case 'modelos':    window.Modules.modelos?.load?.(); break;
      case 'analise':    window.Modules.analise?.load?.(); break;
      case 'adhel':      window.Modules.adhel?.load?.(); break;
      case 'pessoal':    window.Modules.pessoal?.load?.(); break;
      case 'admin':      if (isAdmin) { window.Modules.admin?.load?.(); window.Modules.checklists?.load?.(); } break;
    }

    // Auditoria de acesso ao módulo
    recordModuleAccess(state.route).catch(err => {
      console.warn('[mpa] Falha ao registrar acesso ao módulo:', err);
    });
  }

  async function init() {
    renderFooterVersion();
    bindNav();
    const ok = await ensureAuthAndUI();
    if (!ok) return;
    ['procNUP','opNUP','ntNUP','sgNUP','adNUP'].forEach(Utils.bindNUPMask);
    bootModules();

    // Listener de autenticação para registrar login/logout e manter UI atualizada
    sb.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === 'SIGNED_IN') {
          clearAuditState();
          await recordLoginEvent(session);
        } else if (event === 'INITIAL_SESSION') {
          if (session?.user?.id) {
            state.audit.clientSessionId = state.audit.clientSessionId || readAuditStorage(AUDIT_SESSION_KEY);
            const uid = session.user.id;
            if (!state.audit.loginRecorded || state.audit.recordedUserId !== uid) {
              await recordLoginEvent(session);
            } else {
              state.audit.recordedUserId = uid;
            }
          } else {
            clearAuditState();
          }
        } else if (event === 'SIGNED_OUT') {
          clearAuditState();
        }
      } catch (err) {
        console.error('[mpa] Erro ao tratar evento de autenticação:', err);
      }
      try {
        await ensureAuthAndUI();
      } catch (err) {
        console.error('[mpa] Falha ao atualizar UI após evento auth:', err);
      }
    });
  }

  // Always wait for DOMContentLoaded to ensure all modules (e.g. auth) have loaded
  // before running the initialization routine. This avoids race conditions where
  // scripts loaded later via <script defer> are not yet available when init() runs.
  document.addEventListener('DOMContentLoaded', init);
})();
