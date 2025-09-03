// Roteamento e integração geral da SPA

window.App = (() => {
  const state = {
    session: null,
    profile: null,
    route: 'login' // login | mustchange | dashboard | processos | prazos | modelos | analise | admin
  };

  let clockTimer = null; // atualiza data/hora do cabeçalho a cada minuto

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

  // ----- Renderizações pedidas -----

  // Cabeçalho: "<Nome> • <Perfil> • <data e hora>"
  function renderHeaderStamp() {
    if (state.profile?.name && state.profile?.role) {
      const s = [state.profile.name, state.profile.role, Utils.fmtDateTime(new Date())].join(' • ');
      Utils.setText('buildInfo', s);
    } else {
      // Sem usuário logado, não exibe nada no local do cabeçalho
      Utils.setText('buildInfo', '');
    }
  }

  // Rodapé: "versão X" (manual do config.js)
  function renderFooterVersion() {
    const ver = String(window.APP_CONFIG?.VERSION || '').trim();
    Utils.setText('footBuild', ver ? `versão ${ver}` : 'versão (defina em config.js)');
  }

  function startClock() {
    // Atualiza o relógio do cabeçalho a cada minuto
    if (clockTimer) clearInterval(clockTimer);
    renderHeaderStamp();
    clockTimer = setInterval(renderHeaderStamp, 60 * 1000);
  }
  function stopClock() {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }

  // ----- Navegação/rotas -----
  function setRoute(r) {
    state.route = r;
    Object.values(views).forEach(id => Utils.hide(id));
    Utils.show(views[r]);

    const logged = !!state.session;
    const showBars = logged && r !== 'login';
    el('topNav').classList.toggle('hidden', !showBars);
    el('userBox').classList.toggle('hidden', !showBars);

    switch (r) {
      case 'dashboard': window.Modules.dashboard?.load(); break;
      case 'processos': window.Modules.processos?.load(); break;
      case 'prazos': window.Modules.prazos?.load(); break;
      case 'modelos': window.Modules.modelos?.load(); break;
      case 'analise': window.Modules.analise?.load(); break;
      case 'admin': window.Modules.admin?.load(); break;
    }
  }

  // Carrega perfil do usuário e ajusta UI
  async function loadProfile() {
    const u = await getUser();
    if (!u) { state.profile = null; renderHeaderStamp(); return null; }
    const { data, error } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
    if (error) { console.error(error); state.profile = null; renderHeaderStamp(); return null; }
    state.profile = data || null;

    if (state.profile) {
      Utils.setText('userIdentity', `${state.profile.name} (${state.profile.role})`);
      const btnAdmin = el('btnAdmin');
      if (btnAdmin) btnAdmin.classList.toggle('hidden', state.profile.role !== 'Administrador');
    }

    renderHeaderStamp();
    startClock();
    return state.profile;
  }

  async function refreshSessionUI() {
    state.session = await getSession();
    if (!state.session) {
      setRoute('login');
      Utils.setText('userIdentity', '');
      stopClock();
      renderHeaderStamp();   // limpa cabeçalho
      renderFooterVersion(); // mantém versão no rodapé
      return;
    }
    await loadProfile();
    if (state.profile?.must_change_password) setRoute('mustchange');
    else setRoute('dashboard');
  }

  async function init() {
    // Rodapé sempre mostra a versão manual
    renderFooterVersion();

    // Navegação topo
    $$('#topNav button').forEach(btn => btn.addEventListener('click', () => setRoute(btn.dataset.route)));

    // Logout
    el('btnLogout').addEventListener('click', async () => {
      await sb.auth.signOut();
      state.session = null; state.profile = null;
      Utils.setText('userIdentity', '');
      setRoute('login');
      stopClock();
      renderHeaderStamp();
      renderFooterVersion();
    });

    // Eventos de auth
    sb.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') await refreshSessionUI();
      if (event === 'PASSWORD_RECOVERY') setRoute('mustchange');
      if (event === 'SIGNED_OUT') {
        setRoute('login');
        stopClock();
        renderHeaderStamp();
        renderFooterVersion();
      }
    });

    // Fluxo de recuperação
    if (location.hash.includes('type=recovery')) setRoute('mustchange');
    else await refreshSessionUI();

    // Inicializa módulos
    window.Modules.auth?.init();
    window.Modules.processos?.init();
    window.Modules.prazos?.init();
    window.Modules.modelos?.init();
    window.Modules.analise?.init();
    window.Modules.admin?.init();
    window.Modules.dashboard?.init?.();
  }

  return { init, setRoute, state, loadProfile, refreshSessionUI };
})();

document.addEventListener('DOMContentLoaded', App.init);
