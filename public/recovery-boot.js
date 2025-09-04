// public/recovery-boot.js
// Garante sessão quando a página é aberta por link "Reset Password" (type=recovery).

(function () {
  try {
    const hash = location.hash || '';
    if (!hash.includes('type=recovery')) return;

    // Ex.: #access_token=...&refresh_token=...&type=recovery
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const access_token = params.get('access_token') || '';
    const refresh_token = params.get('refresh_token') || '';

    // Flag global para o app saber que entrou via recuperação
    window.__FORCE_RECOVERY = true;

    // Se vieram tokens, já cria a sessão local de forma determinística
    if (access_token && refresh_token) {
      // sb é definido em public/supabaseClient.js
      window.__RECOVERY_BOOT = (async () => {
        try {
          await sb.auth.setSession({ access_token, refresh_token });
          // Limpa o fragmento da URL imediatamente (evita reprocessar/compartilhar token)
          try {
            const clean = location.origin + location.pathname + location.search;
            history.replaceState({}, document.title, clean);
          } catch { /* ignore */ }
        } catch (e) {
          // Mesmo se falhar, a flag __FORCE_RECOVERY ainda levará à tela de troca
          console.error('Recovery boot setSession error:', e);
        }
      })();
    } else {
      // Sem tokens (caso raro), ainda assim marcar a intenção de recuperação
      window.__RECOVERY_BOOT = Promise.resolve();
    }
  } catch (e) {
    console.error('Recovery boot error:', e);
  }
})();
