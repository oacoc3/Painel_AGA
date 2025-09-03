// Roteamento e integração geral da SPA

window.App = (() => {
  const state = {
    session: null,
    profile: null,
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

  function setRoute(r) {
    state.route = r;
    // Esconde todas
    Object.values(views).forEach(id => Utils.hide(id));
    // Mostra atual
    Utils.show(views[r]);
    // Ajusta navegação topo
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
    // Lazy load por rota
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
    // Header: identidade e papel
    if (state.profile) {
      Utils.setText('userIdentity', `${state.profile.name} (${state.profile.role})`);
      // Mostra botão Administração só para Administrador
      const btnAdmin = el('btnAdmin');
      if (btnAdmin) btnAdmin.classList.toggle('hidden', state.profile.role !== 'Administrador');
    }
    return state.profile;
  }

  async function refreshSessionUI() {
    state.session = await getSession();
    if (!state.session) {
      setRoute('login');
      return;
    }
    await loadProfile();
    // must_change_password?
    if (state.profile?.must_change_password) {
      setRoute('mustchange');
    } else {
      setRoute('dashboard');
    }
  }

  async function init() {
    // Build info (rodapé e header)
    try {
      const res = await Utils.callFn('build-info');
      if (res.ok && res.data) {
        const b = res.data;
        const s = `commit ${b.commit || 'local'} • ${b.branch || 'local'} • ${b.context || 'dev'} • ${b.site || ''} • ${Utils.fmtDateTime(b.builtAt)}`;
        Utils.setText('buildInfo', s);
        Utils.setText('footBuild', s);
      }
    } catch { /* silencioso */ }

    // Navegação topo
    $$('#topNav button').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = btn.dataset.route;
        setRoute(r);
      });
    });

    // Logout
    el('btnLogout').addEventListener('click', async () => {
      await sb.auth.signOut();
      state.session = null; state.profile = null;
      Utils.setText('userIdentity', '');
      setRoute('login');
    });

    // Evento de auth (inclui fluxo de recuperação)
    sb.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        await refreshSessionUI();
      }
      if (event === 'PASSWORD_RECOVERY') {
        // Supabase sinaliza modo de recuperação → força troca
        setRoute('mustchange');
      }
      if (event === 'SIGNED_OUT') {
        setRoute('login');
      }
    });

    // Hash de recuperação (#access_token=...&type=recovery)
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

  return { init, setRoute, state, loadProfile, refreshSessionUI };
})();

document.addEventListener('DOMContentLoaded', App.init);
