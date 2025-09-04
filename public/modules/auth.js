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

      // ⚠️ NÃO use hash (#) aqui — o Supabase precisa anexar #access_token&type=recovery
      const redirectTo = `${location.origin}/reset-password`;
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) return Utils.setMsg('loginMsg', error.message, true);
      Utils.setMsg('loginMsg', 'Verifique seu e-mail para redefinir a senha.');
    });

    el('btnSetNewPass').addEventListener('click', async () => {
  const p1 = el('newPass1').value;
  const p2 = el('newPass2').value;
  if (!p1 || p1 !== p2) return Utils.setMsg('mustChangeMsg', 'As senhas não coincidem.', true);
  Utils.setMsg('mustChangeMsg', 'Atualizando senha...');

  // Garante que a sessão de recuperação existe
  const s = await getSession();
  if (!s) {
    return Utils.setMsg('mustChangeMsg', 'Sessão de recuperação não encontrada. Abra novamente o link do e-mail.', true);
  }

  const { error } = await sb.auth.updateUser({ password: p1 });
  if (error) return Utils.setMsg('mustChangeMsg', error.message, true);

  await sb.auth.refreshSession();

  const u = await getUser();
  if (u) {
    const { error: profErr } = await sb
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', u.id);
    if (profErr) return Utils.setMsg('mustChangeMsg', profErr.message, true);
    if (App.state?.profile) App.state.profile.must_change_password = false;
  }

  try {
    const cleanUrl = location.origin + location.pathname + location.search;
    history.replaceState({}, document.title, cleanUrl);
  } catch {}

  // Sai do modo "forçado" de recuperação
  window.__FORCE_RECOVERY = false;

  Utils.setMsg('mustChangeMsg', 'Senha atualizada!');
  await App.refreshSessionUI(undefined, 'USER_UPDATED');
  App.setRoute('dashboard');
});


  function init() { bindLogin(); }
  return { init };
})();
