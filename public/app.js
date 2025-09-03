// Roteamento e integração geral da SPA

window.App = (() => {
  const state = {
    session: null,
    profile: null,
    build: null,   // info da função build-info (inclui version)
    route: 'login' // login | mustchange | dashboard | processos | prazos | modelos | analise | admin
  };

  const views = {
    login: 'viewLogin',
    mustchange: 'viewMustChange',
    dashboard: 'viewDashboard',
    processos: 'viewProcessos',
    prazos: 'viewPrazos',
    modelos: 'viewModelos',
    analise: 'viewAnalise',
    admin: 'viewAdmin'
  };

  // Calcula a versão para exibir:
  // 1) usa state.build.version (Netlify), 2) fallback APP_CONFIG.VERSION (se você quiser forçar),
  // 3) fallback "local".
  function computeVersion() {
    if (state.build?.version) return String(state.build.version);
    const cfgVer = window.APP_CONFIG?.VERSION;
    if (cfgVer && String(cfgVer).trim()) return String(cfgVer).trim();
    return 'local';
  }

  // Renderiza: "versão X • Nome • Perfil • DD/MM/AAAA HH:MM"
  function renderVersionStamp() {
    const ver = computeVersion();
    const now = Utils.fmtDateTime(new Date());
    const parts = [`versão ${ver}`];

    if (state.profile?.name && state.profile?.role) {
      parts.push(state.profile.name, state.profile.role);
    }
    parts.push(now);

    const s = parts.join(' • ');
    Utils.setText('buildInfo', s);
    Utils.setText('footBuild', s);
  }

  function setRoute(r) {
    state.route = r;
    Object.values(views).forEach(id => Utils.hide(id));
    Utils.show(views[r]);

    const logged = !!state.session;
    const nav = el('topNav');
    const userBox = el('userBox');
    if (logged && r !== 'login') {
      nav.classList.remove('hidden');
      userBox.classList.remove('hidden');
    } else {
      nav.classList.add('hidden');
      userBox.classList.add('hidden');
    }

    switch (r) {
      case 'dashboard': window.Modules.dashboard?.load(); break;
      case 'processos': window.Modules.processos?.load(); break;
      case 'prazos': window.Modules.prazos?.load(); break;
      case 'modelos': window.Modules.modelos?.load(); break;
      case 'analise': window.Modules.analise?.load(); break;
      case 'admin': window.Modules.admin?.load(); break;
    }
  }

  async function loadProfile() {
    const u = await getUser();
    if (!u) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
    if (error) { console.error(error); return null; }
    state.profile = data || null;

    if (state.profile) {
      Utils.setText('userIdentity', `${state.profile.name} (${state.profile.role})`);
      const btnAdmin = el('btnAdmin');
      if (btnAdmin) btnAdmin.classList.toggle('hidden', state.profile.role !== 'Administrador');
    }

    renderVersionStamp(); // atualiza após carregar perfil
    return state.profile;
  }

  async function refreshSessionUI() {
    state.session = await getSession();
    if (!state.session) {
      setRoute('login');
      renderVersionStamp();
      return;
    }
    await loadProfile();
    if (state.profile?.must_change_password) {
      setRoute('mustchange');
    } else {
      setRoute('dashboard');
    }
  }

  async function init() {
    // Busca metadados do deploy (inclui version automática)
    try {
      const res = await Utils.callFn('build-info');
      if (res.ok && res.data) state.build = res.data;
    } catch { /* silencioso */ }

    // Carimbo inicial (antes do login, já mostra versão)
    renderVersionStamp();

    // Navegação topo
    $$('#topNav button').forEach(btn => btn.addEventListener('click', () => setRoute(btn.dataset.route)));

    // Logout
    el('btnLogout').addEventListener('click', async () => {
      await sb.auth.signOut();
      state.session = null; state.profile = null;
      Utils.setText('userIdentity', '');
      setRoute('login');
      renderVersionStamp();
    });

    // Eventos de auth
    sb.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        await refreshSessionUI();
      }
      if (event === 'PASSWORD_RECOVERY') setRoute('mustchange');
      if (event === 'SIGNED_OUT') {
        setRoute('login');
        renderVersionStamp();
      }
    });

    // Fluxo de recuperação
    if (location.hash.includes('type=recovery')) {
      setRoute('mustchange');
    } else {
      await refreshSessionUI();
    }

    // Inicializa módulos
    window.Modules.auth?.init();
    window.Modules.processos?.init();
    window.Modules.prazos?.init();
    window.Modules.modelos?.init();
    window.Modules.analise?.init();
    window.Modules.admin?.init();
    window.Modules.dashboard?.init?.();
  }

  return { init, setRoute, state, loadProfile, refreshSessionUI, renderVersionStamp };
})();

document.addEventListener('DOMContentLoaded', App.init);
