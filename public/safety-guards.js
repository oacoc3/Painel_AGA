// public/safety-guards.js
// Guardas de segurança para a SPA (sem alterações visuais).
// 1) Garante type="button" em botões não-submissão.
// 2) Evita submit tradicional de <form> "AJAX" (marcados com data-ajax).
// 3) Loga erros globais (evita falhas “silenciosas”).
// 4) Ao voltar o foco para a aba, tenta recarregar listas (F5 “leve”).

(() => {
  function fixButtonTypes(root = document) {
    root.querySelectorAll('button:not([type])').forEach(b => { b.type = 'button'; });
    // proteção extra para inputs submit em forms AJAX
    root.querySelectorAll('form[data-ajax] input[type="submit"]').forEach(inp => {
      inp.addEventListener('click', ev => { ev.preventDefault(); });
    });
  }

  function preventAjaxFormSubmit() {
    document.addEventListener('submit', (ev) => {
      const f = ev.target;
      if (f && f.matches('form[data-ajax]')) ev.preventDefault();
    });
  }

  function onVisibilityRefresh(cb) {
    let lastHidden = document.hidden;
    document.addEventListener('visibilitychange', () => {
      if (lastHidden && !document.hidden) {
        try { cb?.(); } catch (e) { console.error(e); }
      }
      lastHidden = document.hidden;
    });
  }

  function askReload(message) {
    if (confirm(message)) location.reload();
  }

  function installGlobalErrorTrap() {
    window.addEventListener('error', (e) => {
      console.error('Erro não tratado:', e.error || e.message, e.filename, e.lineno);
      askReload('Ocorreu um erro. Recarregar a página?');
    });
    window.addEventListener('unhandledrejection', (e) => {
      console.error('Promise rejeitada sem catch:', e.reason);
      askReload('Ocorreu um erro. Recarregar a página?');
    });
    window.addEventListener('offline', () => {
      askReload('Sem conexão com a internet. Recarregar a página?');
    });
    window.addEventListener('online', () => {
      askReload('Conexão restabelecida. Recarregar a página?');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    fixButtonTypes();
    preventAjaxFormSubmit();
    installGlobalErrorTrap();

    // Ao voltar para a aba, força recarregamento no módulo de processos
    onVisibilityRefresh(() => {
     if (document.body?.dataset.route === 'processos') location.reload();
    });

    // Ao retornar via histórico (bfcache), recarrega a lista de processos
    window.addEventListener('pageshow', (ev) => {
      if (ev.persisted && document.body?.dataset.route === 'processos') {
        try { window.Modules.processos?.reloadLists?.(); } catch (e) { console.error(e); }
      }
    });
  });

  // Expor utilidades p/ serem chamadas após renders dinâmicos:
  window.SafetyGuards = { fixButtonTypes, askReload };
})();
