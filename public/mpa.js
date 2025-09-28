// public/mpa.js
// Inicialização e navegação para MPA (Multi-Page Application)
// Mantém o visual e os módulos existentes; apenas adiciona navegação via dropdown no cabeçalho.

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
    try { return sessionStorage.getItem(key); }
    catch (err) { console.warn('[audit] Falha ao ler sessionStorage:', err); return null; }
  }
  function writeAuditStorage(key, value) {
    try { if (value == null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); }
    catch (err) { console.warn('[audit] Falha ao gravar sessionStorage:', err); }
  }
  function generateAuditSessionId() {
    try { if (window.crypto?.randomUUID) return window.crypto.randomUUID(); } catch (_) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8); return v.toString(16);
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
    const stored = readAuditStorage(AUDIT_SESSION_KEY);
    if (stored) { state.audit.clientSessionId = stored; return stored; }
    const gen = generateAuditSessionId(); state.audit.clientSessionId = gen; writeAuditStorage(AUDIT_SESSION_KEY, gen); return gen;
  }

  async function recordAuditEvent(eventType, moduleName = null, { session, metadata } = {}) {
    try {
      const client = window.sb;
      if (!client?.from) return false;
      const currentSession = session || state.session || await getSession();
      const userId = currentSession?.user?.id; if (!userId) return false;
      const payload = {
        profile_id: userId,
        event_type: eventType,
        event_module: moduleName || null,
        client_session_id: ensureClientSessionId(),
      };
      if (metadata && typeof metadata === 'object' && Object.keys(metadata).length) payload.event_metadata = metadata;
      const { error } = await client.from('user_audit_events').insert(payload);
      if (error) { console.warn('[audit] Falha ao registrar evento', eventType, error); return false; }
      return true;
    } catch (err) { console.warn('[audit] Erro inesperado no recordAuditEvent:', err); return false; }
  }
  async function recordLoginEvent(session) {
    try {
      const s = session || state.session || await getSession();
      const uid = s?.user?.id; if (!uid) return false;
      const ok = await recordAuditEvent('login', null, { session: s });
      if (ok) {
        state.audit.loginRecorded = true;
        state.audit.recordedUserId = uid;
        writeAuditStorage(AUDIT_LOGIN_FLAG_KEY, '1');
        writeAuditStorage(AUDIT_LOGIN_UID_KEY, uid);
      }
      return ok;
    } catch (err) { console.warn('[audit] Falha ao registrar login:', err); return false; }
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
    const ok = await recordAuditEvent('module_access', route, { metadata: { path: location.pathname || '', title: document.title || '' } });
    if (ok) state.audit.lastModuleKey = key;
    return ok;
  }

  function renderFooterVersion() {
    try {
      const footBuild = document.getElementById('footBuild');
      const bi = window.BUILD_INFO || {};
      if (!footBuild) return;
      if (bi.deploy_id || bi.commit) footBuild.textContent = `build: ${bi.deploy_id || ''} ${bi.commit ? '(' + (bi.commit.slice(0,7)) + ')' : ''}`;
      else footBuild.textContent = '';
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
    if (buildLbl && (bi.deploy_id || bi.commit)) buildLbl.textContent = [bi.deploy_id || '', (bi.commit || '').slice(0,7), new Date().toLocaleString()].join(' • ');
    else if (buildLbl) buildLbl.textContent = '';
  }
  function setActiveNav() {
    const r = state.route;
    document.querySelectorAll('#topNav button[data-route]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.route === r);
    });
    const sel = document.getElementById('moduleSelect');
    if (sel) { try { sel.value = r; } catch(_) {} }
  }

  // ---- Limpeza local de sessão (fallback) ----
  function clearSupabaseStoredSession(client) {
    let cleared = false;
    try {
      const auth = client?.auth; if (!auth) return false;
      const storage = auth.storage || window.localStorage; if (!storage?.removeItem) return false;
      [auth.storageKey, auth.persistSessionKey, auth.debug].filter(Boolean).forEach(key => { try { storage.removeItem(key); cleared = true; } catch(e) { console.warn('[mpa] rm key', key, e); } });
      try {
        const ks = []; for (let i=0;i<storage.length;i++){ const k = storage.key(i); if (k?.startsWith('sb-')) ks.push(k); }
        ks.forEach(k => { try { storage.removeItem(k); cleared = true; } catch(e){ console.warn('[mpa] rm derived', k, e); } });
      } catch(e) { console.warn('[mpa] list derived keys failed', e); }
    } catch (err) { console.warn('[mpa] Falha ao limpar sessão local do Supabase:', err); }
    return cleared;
  }

  async function handleLogout() {
    let shouldReload = true;
    try { await recordLogoutEvent(); } catch (e) { console.warn('[mpa] audit logout:', e); }
    const client = window.sb;
    if (client?.auth?.signOut) {
      let primaryErr = null;
      try { const { error } = await client.auth.signOut({ scope: 'global' }); if (error) primaryErr = error; }
      catch (e) { primaryErr = e; }
      if (primaryErr) {
        try { await client.auth.signOut({ scope: 'local' }); }
        catch (e) { if (!clearSupabaseStoredSession(client)) console.warn('[mpa] não limpou sessão local:', e); }
      }
    }
    try {
      document.getElementById('topNav')?.classList.add('hidden');
      document.getElementById('userBox')?.classList.add('hidden');
    } catch(_) {}
    window.location.replace('index.html');
    return { shouldReload, sessionCleared: true };
  }

  function bindNav() {
    const nav = document.getElementById('topNav');
    if (!nav) return;

    // 1) Suporte ao DROPDOWN de módulos
    const sel = document.getElementById('moduleSelect');
    if (sel) {
      // reflete rota atual
      try { sel.value = state.route; } catch(_) {}
      sel.addEventListener('change', (ev) => {
        const r = ev.target.value;
        const page = ROUTE_TO_PAGE[r] || 'dashboard.html';
        window.location.href = page;
      });
    }

    // 2) Compat com botões antigos (se ainda existirem)
    nav.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-route]');
      if (!btn) return;
      const r = btn.dataset.route;
      const page = ROUTE_TO_PAGE[r] || 'dashboard.html';
      window.location.href = page;
    });

    // 3) Logout
    document.getElementById('btnLogout')?.addEventListener('click', async (ev) => {
      ev.preventDefault();
      try {
        const r = await handleLogout();
        if (r?.shouldReload) { try { window.location.reload(); } catch { window.location.replace('index.html'); } }
      } catch (err) { console.error('[mpa] logout:', err); }
    });
  }

  function getClient(){ return window.sb || window.supabase || null; }
  async function getSession(){ const c=getClient(); if(!c?.auth?.getSession) return null; const {data,error}=await c.auth.getSession(); if(error){console.warn('[mpa] getSession erro:',error); return null;} return data?.session||null; }
  async function getUser(){ const s=state.session||await getSession(); return s?.user||null; }

  async function loadProfile() {
    const sb = getClient(); if (!sb?.from) return null;
    const u = await getUser();
    if (!u) {
      state.profile = null; window.APP_PROFILE = null; renderHeaderStamp();
      document.getElementById('btnAdmin')?.classList.add('hidden');
      document.getElementById('optAdmin')?.setAttribute('hidden','');
      return null;
    }
    const { data, error } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
    if (error) { console.error(error); state.profile=null; window.APP_PROFILE=null; renderHeaderStamp(); document.getElementById('btnAdmin')?.classList.add('hidden'); return null; }
    state.profile = data; window.APP_PROFILE = data; renderHeaderStamp();
    const isAdmin = data.role === 'Administrador';
    const a = document.getElementById('btnAdmin'); if (a) a.classList.toggle('hidden', !isAdmin);
    const oa = document.getElementById('optAdmin'); if (oa) { if (isAdmin) oa.removeAttribute('hidden'); else oa.setAttribute('hidden',''); }
    // também mantém o valor do select coerente com a rota
    const sel = document.getElementById('moduleSelect'); if (sel) { try { sel.value = state.route; } catch(_){} }
    return data;
  }

  async function ensureJwtMetadataFromProfile() {
    const u = await getUser(); if (!u) return false;
    const roleJwt = u.user_metadata?.role ?? null;
    const nameJwt = u.user_metadata?.name ?? null;
    const p = state.profile; if (!p) return true;
    try { if (roleJwt !== p.role || nameJwt !== (p.name || null)) console.info('[mpa] JWT metadata difere do profile (role/name).'); }
    catch (err) { console.warn('[mpa] Verif JWT falhou:', err); }
    return true;
  }

  let clockTimer = null;
  function startClock(){ stopClock(); clockTimer = setInterval(()=>{ try{ renderHeaderStamp(); }catch(_){}} , 60000); }
  function stopClock(){ if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } }

  async function ensureAuthAndUI() {
    state.session = await getSession();
    const onLogin = state.route === 'login';

    if (!state.session) {
      clearAuditState(); stopClock();
      if (onLogin) { document.getElementById('topNav')?.classList.add('hidden'); document.getElementById('userBox')?.classList.add('hidden'); return true; }
      window.location.replace('index.html'); return false;
    }

    await loadProfile();
    await ensureJwtMetadataFromProfile();
    state.session = await getSession(); // refresco
    ensureClientSessionId(); startClock();

    if (!onLogin) {
      document.getElementById('topNav')?.classList.remove('hidden');
      document.getElementById('userBox')?.classList.remove('hidden');
    }
    return true;
  }

  function bootModules() {
    const onLogin = state.route === 'login';
    if (onLogin && !state.session) { window.Modules?.auth?.init?.(); return; }

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

    recordModuleAccess(state.route).catch(err => console.warn('[mpa] audit módulo:', err));
  }

  async function init() {
    renderFooterVersion();
    bindNav();
    const ok = await ensureAuthAndUI();
    if (!ok) return;
    // aplica máscara de NUP (se existirem esses IDs na página)
    ['procNUP','opNUP','ntNUP','sgNUP','adNUP'].forEach(Utils?.bindNUPMask);

    const client = getClient();
    client?.auth?.onAuthStateChange?.(async (event, session) => {
      try {
        state.session = session || null;
        if (session?.user?.id) {
          renderHeaderStamp();
          const uid = session.user.id;
          if (!state.audit.loginRecorded || state.audit.recordedUserId !== uid) {
            const logged = await recordLoginEvent(session);
            if (!logged) clearAuditState(); else state.audit.recordedUserId = uid;
          } else {
            state.audit.recordedUserId = uid;
          }
        } else {
          clearAuditState();
        }
        if (event === 'SIGNED_OUT') clearAuditState();
      } catch (err) {
        console.error('[mpa] evento auth:', err);
      }
      try {
        await ensureAuthAndUI();
        bootModules();
      } catch (err) {
        console.error('[mpa] pós-auth UI:', err);
      }
    });

    setActiveNav();
    bootModules();
  }

  // Compat: alguns handlers legados chamam init() global
  window.init = init;

  document.addEventListener('DOMContentLoaded', init);
})();
