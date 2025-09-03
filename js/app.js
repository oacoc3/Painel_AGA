import { initAuth } from './auth.js';
import { showRoute } from './ui.js';
import { renderDashboard } from './dashboard.js';
import { renderAdmin } from './admin.js';
import { renderProcessos } from './processos.js';
import { renderPrazos } from './prazos.js';
import { renderModelos } from './modelos.js';
import { renderAnalise } from './analise_ad.js';

const routes = {
  '#/login': () => showRoute('route-login'),
  '#/dashboard': renderDashboard,
  '#/administracao': renderAdmin,
  '#/processos': renderProcessos,
  '#/prazos': renderPrazos,
  '#/modelos': renderModelos,
  '#/analise-documental': renderAnalise
};

function handleRoute(){
  const r = location.hash || '#/dashboard';
  (routes[r] || routes['#/dashboard'])();
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('load', async () => {
  await initAuth();
  // Navegação por botões
  document.querySelectorAll('#main-nav [data-route]').forEach(b => b.onclick = () => { location.hash = b.getAttribute('data-route'); });
  handleRoute();
});
