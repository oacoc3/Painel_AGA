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
    writeAuditStorage(AUDIT_SESSION_KEY, null);
    writeAuditStorage(AUDIT_LOGIN_FLAG_KEY, null);
    writeAuditStorage(AUDIT_LOGIN_UID_KEY, null);
  }

  function ensureClientSessionId() {
    if (state.audit.clientSessionId) return state.audit.clientSessionId;
    try {
      const stored = readAuditStorage(AUDIT_SESSION_KEY);
      if (stored) {
        state.audit.clientSessionId = stored;
        return stored;
      }
    } catch (_) {}
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
      console.warn('[audit] Erro inesperado no recordAuditEvent:', err);
      return false;
    }
  }

  async function recordLoginEvent(session) {
    try {
      const s = session || state.session || await getSession();
      const uid = s?.user?.id;
      if (!uid) return false;
      const ok = await recordAuditEvent('login', null, { session: s });
      if (ok) {
        state.audit.loginRecorded = true;
        state.audit.recordedUserId = uid;
        writeAuditStorage(AUDIT_LOGIN_FLAG_KEY, '1');
        writeAuditStorage(AUDIT_LOGIN_UID_KEY, uid);
      }
      return ok;
    } catch (err) {
      console.warn('[audit] Falha ao registrar login:', err);
      return false;
    }
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
    try {
      const footBuild = document.getElementById('footBuild');
      const bi = window.BUILD_INFO || {};
      if (!footBuild) return;
      if (bi.deploy_id || bi.commit) {
        footBuild.textContent = `build: ${bi.deploy_id || ''} ${bi.commit ? '(' + (bi.commit.slice(0,7)) + ')' : ''}`;
      } else {
        footBuild.textContent = '';
      }
    } catch (_) {}
  }

  function renderHeaderStamp() {
    const userLbl = document.getElementById('userName');
    const roleLbl = document.getElementById('userRole');
    const buildLbl = document.getElementById('buildInfo');
    const p = state.profile || window.APP_PROFILE || null;

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
        auth.debug,
      ].filter(Boolean);
      knownKeys.forEach((key) => {
        try {
          storage.removeItem(key);
          cleared = true;
        } catch (err) {
          console.warn(`[mpa] Falha ao remover chave Supabase ${key}:`, err);
        }
      });
      // tentativa adicional: remove quaisquer chaves sb-*
      try {
        const candidateKeys = [];
        if (storage && typeof storage.length === 'number') {
          for (let i = 0; i < storage.length; i++) {
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
        console.warn('[mpa] Falha ao listar chaves derivadas do Supabase:', err);
      }
    } catch (err) {
      console.warn('[mpa] Falha ao limpar sessão local do Supabase:', err);
    }
    return cleared;
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
        const { error } = await client.auth.signOut({ scope: 'global' });
        if (error) {
          primarySignOutError = error;
          console.warn('[mpa] signOut global retornou erro, tentando local:', error);
        }
      } catch (err) {
        primarySignOutError = err;
        console.warn('[mpa] Exceção durante signOut global, tentando local:', err);
      }

      // fallback: signOut local
      if (primarySignOutError) {
        let fallbackSucceeded = false;
        try {
          const { error: localError } = await client.auth.signOut({ scope: 'local' });
          if (localError) {
            console.warn('[mpa] SignOut local também falhou:', localError);
          } else {
            fallbackSucceeded = true;
          }
        } catch (err) {
          console.warn('[mpa] Erro ao tentar signOut local:', err);
        }
        if (!fallbackSucceeded) {
          fallbackSucceeded = clearSupabaseStoredSession(client);
        }
        if (!fallbackSucceeded) {
          console.warn('[mpa] Não foi possível limpar sessão local do Supabase.');
        }
      }
    }

    let finalSession = null;
    let sessionCheckFailed = false;
    try {
      finalSession = await getSession();
      if (finalSession?.user) {
        sessionCleared = false;
      } else {
        sessionCleared = true;
      }
    } catch (err) {
      sessionCheckFailed = true;
      sessionCleared = false;
    }

    try {
      const nav = document.getElementById('topNav');
      const ub = document.getElementById('userBox');
      if (nav) nav.classList.add('hidden');
      if (ub) ub.classList.add('hidden');
    } catch (_) {}

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

  function getClient() {
    return window.sb || window.supabase || null;
  }
  async function getSession() {
    const client = getClient();
    if (!client?.auth?.getSession) return null;
    const { data, error } = await client.auth.getSession();
    if (error) {
      console.warn('[mpa] getSession retornou erro:', error);
      return null;
    }
    return data?.session || null;
  }
  async function getUser() {
    const s = state.session || await getSession();
    return s?.user || null;
  }

  async function loadProfile() {
    const sb = getClient();
    if (!sb?.from) return null;
    const u = await getUser();
    if (!u) {
      state.profile = null;
      window.APP_PROFILE = null;
      renderHeaderStamp();
      const a = document.getElementById('btnAdmin'); if (a) a.classList.add('hidden');
      const oa = document.getElementById('optAdmin'); if (oa) oa.hidden = true;
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

    try {
      if (roleJwt !== p.role || nameJwt !== (p.name || null)) {
        // Apenas exibe no console; atualização real do user_metadata é feita em outro fluxo administrativo
        console.info('[mpa] JWT metadata difere do profile (role/name).');
      }
    } catch (err) {
      console.warn('[mpa] Falha ao verificar metadados do JWT:', err);
    }
    return true;
  }

  let clockTimer = null;
  function startClock() {
    stopClock();
    clockTimer = setInterval(() => {
      try {
        renderHeaderStamp();
      } catch (_) {}
    }, 60 * 1000);
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
    if (!onLogin) {
      document.getElementById('topNav')?.classList.remove('hidden');
      document.getElementById('userBox')?.classList.remove('hidden');
    }
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

    const client = getClient();
    try {
      client?.auth?.onAuthStateChange?.(async (event, session) => {
        try {
          state.session = session || null;
          if (session?.user?.id) {
            renderHeaderStamp();
            const uid = session.user.id;
            if (!state.audit.loginRecorded || state.audit.recordedUserId !== uid) {
              const logged = await recordLoginEvent(session);
              if (!logged) {
                clearAuditState();
              } else {
                state.audit.recordedUserId = uid;
              }
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
        bootModules();
      } catch (err) {
        console.error('[mpa] Falha ao atualizar UI após evento auth:', err);
      }
    });
  }

  // Always wait for DOMContentLoaded to ensure all modules (e.g. auth) have loaded
  // before running the initialization routine. This avoids race conditions where
  // scripts loaded later via <script defer> are not yet available when init() runs.

  // Exponibiliza init no escopo global para handlers legados
  window.init = init;

  document.addEventListener('DOMContentLoaded', init);
})();
