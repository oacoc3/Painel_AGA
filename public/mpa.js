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

  const state = {
    session: null,
    profile: null,
    route: (() => {
      const file = location.pathname.split('/').pop() || 'index.html';
      const name = file.replace('.html', '');
      return (name === '' || name === 'index') ? 'login' : name;
    })(),
  };

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
      btnLogout.addEventListener('click', async () => {
        try {
          const client = window.sb;
          if (client?.auth?.signOut) {
            const { error } = await client.auth.signOut();
            if (error) console.error('[mpa] Falha ao encerrar sessão:', error);
          }
        } catch (err) {
          console.error('[mpa] Erro inesperado ao encerrar sessão:', err);
        } finally {
          window.location.href = 'index.html';
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
      case 'admin':      if (isAdmin) { window.Modules.admin?.load?.(); window.Modules.checklists?.load?.(); } break;
    }
  }

  async function init() {
    renderFooterVersion();
    bindNav();
    const ok = await ensureAuthAndUI();
    if (!ok) return;
    ['procNUP','opNUP','ntNUP','sgNUP','adNUP'].forEach(Utils.bindNUPMask);
    bootModules();
    sb.auth.onAuthStateChange(() => ensureAuthAndUI());
  }

  // Always wait for DOMContentLoaded to ensure all modules (e.g. auth) have loaded
  // before running the initialization routine. This avoids race conditions where
  // scripts loaded later via <script defer> are not yet available when init() runs.
  document.addEventListener('DOMContentLoaded', init);
})();
