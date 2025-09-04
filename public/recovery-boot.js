// public/recovery-boot.js
// Processa de forma determinística o retorno do Supabase:
//  - HASH:  #access_token=...&refresh_token=...&type=recovery
//  - QUERY: ?code=...  (PKCE/exchange)
// Em ambos os casos: cria sessão, marca flag de recuperação e limpa a URL.

(function () {
  function cleanUrl() {
    try {
      const clean = location.origin + location.pathname; // remove ? e #
      history.replaceState({}, document.title, clean);
    } catch { /* ignore */ }
  }

  function markRecovery() {
    window.__FORCE_RECOVERY = true;
  }

  try {
    const hash = location.hash || '';
    const query = location.search || '';

    // Caso 1: fluxo clássico com fragmento #…type=recovery
    if (/#/.test(hash) && /(^|&|\?)type=recovery/i.test(hash)) {
      markRecovery();
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const access_token = params.get('access_token') || '';
      const refresh_token = params.get('refresh_token') || '';
      window.__RECOVERY_BOOT = (async () => {
        try {
          if (access_token && refresh_token) {
            await sb.auth.setSession({ access_token, refresh_token });
          }
        } catch (e) {
          console.error('Recovery boot (hash) setSession error:', e);
        } finally {
          cleanUrl();
        }
      })();
      return; // já configurou o boot
    }

    // Caso 2: fluxo por código (?code=...) — cobre variações de retorno
    if (/[?&]code=/.test(query)) {
      markRecovery();
      window.__RECOVERY_BOOT = (async () => {
        try {
          await sb.auth.exchangeCodeForSession(window.location.href);
        } catch (e) {
          console.error('Recovery boot (code) exchange error:', e);
        } finally {
          cleanUrl();
        }
      })();
      return;
    }

    // Caso nenhum: nada a fazer (mas deixa a variável padrão)
    window.__RECOVERY_BOOT = Promise.resolve();
  } catch (e) {
    console.error('Recovery boot error:', e);
    window.__RECOVERY_BOOT = Promise.resolve();
  }
})();
