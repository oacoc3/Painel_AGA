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
  // ... (todo o conteúdo original permanece)
  // ---- Fim: suporte a auditoria de sessão/uso ----

  const state = {
    session: null,
    profile: null,
    route: (() => {
      const file = location.pathname.split('/').pop() || 'index.html';
      // ... (código original)
      return (file.replace('.html', '') || 'index');
    })(),
    audit: {
      clientSessionId: null,
      loginRecorded: false,
      recordedUserId: null,
      lastModuleKey: null,
    },
  };

  // ... (todas as funções originais mantidas)

  function bindNav() {
    const nav = document.getElementById('topNav');
    if (!nav) return;
    // Navegação via dropdown
    const sel = document.getElementById('moduleSelect');
    if (sel) {
      // Ajusta seleção atual conforme rota
      try { sel.value = state.route || sel.value; } catch (_) {}
      sel.addEventListener('change', (ev) => {
        const r = ev.target.value;
        const page = ROUTE_TO_PAGE[r] || 'dashboard.html';
        window.location.href = page;
      });
    }
    // (Compat) ainda responde a cliques em botões se existirem
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
    const oa = document.getElementById('optAdmin'); if (oa) oa.hidden = !isAdmin;
    const sel = document.getElementById('moduleSelect'); if (sel) { try { sel.value = state.route || sel.value; } catch (_) {} }
    return data;
  }

  // ... (restante do arquivo original inalterado, incluindo ensureAuthAndUI, bootModules, setActiveNav etc.)

  function setActiveNav() {
    const r = state.route;
    document.querySelectorAll('#topNav button[data-route]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.route === r);
    });
  }

  // ... (demais utilitários e init)
  document.addEventListener('DOMContentLoaded', init);
})();
