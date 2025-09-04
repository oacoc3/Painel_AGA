// public/modules/auth.js
window.Modules = window.Modules || {};
window.Modules.auth = (() => {
  function bindLogin() {
    el('btnDoLogin').addEventListener('click', async () => {
      const email = el('loginEmail').value.trim();
      const password = el('loginPassword').value;
      Utils.setMsg('loginMsg', 'Entrando...');
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return Utils.setMsg('loginMsg', error.message, true);
      // Perfil é carregado pelo App via onAuthStateChange
      Utils.setMsg('loginMsg', '');
    });

    el('btnForgot').addEventListener('click', async () => {
      const email = el('loginEmail').value.trim();
      if (!email) return Utils.setMsg('loginMsg', 'Informe seu e-mail para recuperar a senha.', true);
      Utils.setMsg('loginMsg', 'Enviando e-mail de recuperação...');

      // Redireciona para uma âncora dedicada; garante que o evento PASSWORD_RECOVERY seja consistente
      const redirectTo = `${location.origin}/#recovery`;
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) return Utils.setMsg('loginMsg', error.message, true);
      Utils.setMsg('loginMsg', 'Verifique seu e-mail para redefinir a senha.');
    });

    el('btnSetNewPass').addEventListener('click', async () => {
      const p1 = el('newPass1').value;
      const p2 = el('newPass2').value;
      if (!p1 || p1 !== p2) return Utils.setMsg('mustChangeMsg', 'As senhas não coincidem.', true);
      Utils.setMsg('mustChangeMsg', 'Atualizando senha...');

      // 1) Atualiza a senha do usuário (sessão de recuperação)
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) return Utils.setMsg('mustChangeMsg', error.message, true);

      // 2) Sincroniza esta aba com a sessão nova
      await sb.auth.refreshSession();

      // 3) Marca must_change_password = false no perfil
      const u = await getUser();
      if (u) {
        const { error: profErr } = await sb
          .from('profiles')
          .update({ must_change_password: false })
          .eq('id', u.id);
        if (profErr) return Utils.setMsg('mustChangeMsg', profErr.message, true);
      }

      // 4) Limpa o hash de recuperação da URL para não “prender” a app em PASSWORD_RECOVERY
      try {
        const cleanUrl = location.origin + location.pathname + location.search;
        history.replaceState({}, document.title, cleanUrl);
      } catch { /* ignore */ }

      // 5) Atualiza UI e navega
      Utils.setMsg('mustChangeMsg', 'Senha atualizada!');
      // Evento simbólico para deixar claro que já saímos do modo de recuperação
      await App.refreshSessionUI(undefined, 'USER_UPDATED');
      App.setRoute('dashboard');
    });
  }

  function init() {
    bindLogin();
  }

  return { init };
})();
