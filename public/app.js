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
    if (error) { console.error(error); sta
