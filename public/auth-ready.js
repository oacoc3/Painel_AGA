// public/auth-ready.js
// Garante que a sessão do Supabase esteja resolvida antes do app iniciar.
// (UMD: usamos o supabase global; JWT = JSON Web Token mantido pelo client)

(() => {
  async function ready() {
    // Usa o client já criado em supabaseClient.js
    const client = window.sb;
    if (!client) {
      console.error('Supabase client indisponível (window.sb). Verifique supabaseClient.js.');
      return null;
    }
    try {
      // Resolve a sessão atual antes de qualquer load inicial
      const { data: { session } } = await client.auth.getSession();
      return session || null;
    } catch (err) {
      console.error('Falha ao obter sessão Supabase:', err);
      return null;
    }
  }

  window.AuthReady = { ready };
})();
