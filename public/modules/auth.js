// public/modules/auth.js
window.Modules = window.Modules || {};
window.Modules.auth = (function () {
  function bindLogin() {
    var formLogin = document.getElementById('loginForm');

    if (formLogin) {
      formLogin.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var emailEl = document.getElementById('loginEmail');
        var email = emailEl ? (emailEl.value || '').trim() : '';
        Utils.setMsg('loginMsg', 'Enviando link de acesso...');
        try {
          var _a = await sb.auth.signInWithOtp({ email: email }),
            error = _a.error;
          if (error) Utils.setMsg('loginMsg', error.message, true);
          else Utils.setMsg('loginMsg', 'Verifique seu e-mail para acessar.');
        } catch (e) {
          Utils.setMsg('loginMsg', (e && e.message) ? e.message : String(e), true);
        }
      });
    }
  }

  function init() { bindLogin(); }
  return { init: init };
})();

