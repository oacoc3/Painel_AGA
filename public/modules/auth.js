// public/modules/auth.js
window.Modules = window.Modules || {};
window.Modules.auth = (function () {
  function bindLogin() {
    var btnDoLogin = document.getElementById('btnDoLogin');
    var btnForgot = document.getElementById('btnForgot');
    var btnSetNewPass = document.getElementById('btnSetNewPass');

    // LOGIN
    if (btnDoLogin) {
      btnDoLogin.addEventListener('click', async function (ev) {
        ev.preventDefault();
        var emailEl = document.getElementById('loginEmail');
        var passEl = document.getElementById('loginPassword');
        var email = emailEl ? (emailEl.value || '').trim() : '';
        var password = passEl ? passEl.value : '';
        Utils.setMsg('loginMsg', 'Entrando...');
        var out = await sb.auth.signInWithPassword({ email: email, password: password });
        if (out.error) Utils.setMsg('loginMsg', out.error.message, true);
        else Utils.setMsg('loginMsg', '');
      });
    }

    // ESQUECI A SENHA
    if (btnForgot) {
      btnForgot.addEventListener('click', async function (ev) {
        ev.preventDefault();
        var emailEl = document.getElementById('loginEmail');
        var email = emailEl ? (emailEl.value || '').trim() : '';
        if (!email) {
          Utils.setMsg('loginMsg', 'Informe seu e-mail para recuperar a senha.', true);
          return;
        }
        Utils.setMsg('loginMsg', 'Enviando e-mail de recuperação...');
        try {
          var redirectTo = location.origin + '/reset-password';
          var res = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
          if (res.error) Utils.setMsg('loginMsg', res.error.message, true);
          else Utils.setMsg('loginMsg', 'Verifique seu e-mail para redefinir a senha.');
        } catch (e) {
          Utils.setMsg('loginMsg', (e && e.message) ? e.message : String(e), true);
        }
      });
    }

    // SALVAR NOVA SENHA (fluxo de recuperação)
    if (btnSetNewPass) {
      btnSetNewPass.addEventListener('click', async function (ev) {
        ev.preventDefault();
        var p1 = document.getElementById('newPass1').value;
        var p2 = document.getElementById('newPass2').value;
        if (!p1 || p1 !== p2) {
          Utils.setMsg('mustChangeMsg', 'As senhas não coincidem.', true);
          return;
        }
        Utils.setMsg('mustChangeMsg', 'Atualizando senha...');

        var s = await getSession();
        if (!s) {
          Utils.setMsg('mustChangeMsg', 'Sessão de recuperação não encontrada. Abra novamente o link do e-mail.', true);
          return;
        }

        var upd = await sb.auth.updateUser({ password: p1 });
        if (upd.error) {
          Utils.setMsg('mustChangeMsg', upd.error.message, true);
          return;
        }

        await sb.auth.refreshSession();

        var u = await getUser();
        if (u) {
          var prof = await sb.from('profiles').update({ must_change_password: false }).eq('id', u.id);
          if (prof.error) {
            Utils.setMsg('mustChangeMsg', prof.error.message, true);
            return;
          }
          if (App.state && App.state.profile) App.state.profile.must_change_password = false;
        }

        try {
          var cleanUrl = location.origin + location.pathname + location.search;
          history.replaceState({}, document.title, cleanUrl);
        } catch (e) {}

        window.__FORCE_RECOVERY = false;
        Utils.setMsg('mustChangeMsg', 'Senha atualizada!');
        await App.refreshSessionUI(undefined, 'USER_UPDATED');
        App.setRoute('dashboard');
      });
    }
  }

  function init() { bindLogin(); }
  return { init: init };
})();
