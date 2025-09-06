// public/mpa.js
// Inicialização e navegação para MPA (Multi-Page Application)
// Mantém o visual e os módulos existentes; apenas substitui o roteamento da SPA.

(() => {
  const ROUTE_TO_PAGE = {
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
    route: document.body?.dataset?.route || 'login'
  };

  function renderFooterVersion() {
    const ver = String(window.APP_CONFIG?.VERSION || '').trim();
    const tgt = document.getElementById('footBuild');
    if (tgt) tgt.textContent = ver ? `versão ${ver}` : 'versão (defina em config.js)';
  }

  function renderHeaderStamp() {
    if (state.profile?.name && state.profile?.role) {
      const s = [state.profile.name, state.profile.role, Utils.fmtDate(new Date())].join(' • ');
      Utils.setText('buildInfo', s);
    } else {
      Utils.setText('buildInfo', '');
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
    if (nav) {
      nav.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-route]');
        if (!btn) return;
        const r = btn.dataset.route;
        const page = ROUTE_TO_PAGE[r] || 'dashboard.html';
        if (location.pathname.endsWith(page)) return; // já está
        window.location.href = page;
      });
    }
    const logout = document.getElementById('btnLogout');
    if (logout) {
      logout.addEventListener('click', async () => {
        await sb.auth.signOut();
        window.location.href = 'index.html';
      });
    }
  }

  async function loadProfile() {
    const u = await getUser();
    if (!u) {
      state.profile = null;
      renderHeaderStamp();
      const a = document.getElementById('btnAdmin'); if (a) a.classList.add('hidden');
      return null;
    }
    const { data, error } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
    if (error) {
      console.error(error);
      state.profile = null;
      renderHeaderStamp();
      const a = document.getElementById('btnAdmin'); if (a) a.classList.add('hidden');
      return null;
    }
    state.profile = data;
    renderHeaderStamp();
    const isAdmin = data.role === 'Administrador';
    const a = document.getElementById('btnAdmin'); if (a) a.classList.toggle('hidden', !isAdmin);
    return data;
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
    startClock();
    // Mostra barras exceto na tela de login
    document.getElementById('topNav')?.classList.toggle('hidden', onLogin);
    document.getElementById('userBox')?.classList.toggle('hidden', onLogin);
    if (onLogin) {
      window.location.replace('dashboard.html');
      return false;
    }
    setActiveNav();
    return true;
  }

  function bootModules() {
    // init() de todos os módulos (preserva comportamento)
    Object.values(window.Modules || {}).forEach(m => m.init?.());
    // load() do módulo específico por página
    switch (state.route) {
      case 'dashboard':  window.Modules.dashboard?.load?.(); break;
      case 'processos':  window.Modules.processos?.load?.(); break;
      case 'prazos':     window.Modules.prazos?.load?.(); break;
      case 'modelos':    window.Modules.modelos?.load?.(); break;
      case 'analise':    window.Modules.analise?.load?.(); break;
      case 'admin':      window.Modules.admin?.load?.(); window.Modules.checklists?.load?.(); break;
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
