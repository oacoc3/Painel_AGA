window.Modules = window.Modules || {};
window.Modules.admin = (() => {
  async function loadUsers() {
    const { data, error } = await sb.from('profiles')
      .select('id,email,name,role,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (error) return Utils.setMsg('adminMsg', error.message, true);
    Utils.renderTable('listaUsers', [
      { key: 'name', label: 'Identificação' },
      { key: 'email', label: 'E-mail' },
      { key: 'role', label: 'Perfil' },
      { key: 'created_at', label: 'Criado em', value: r => Utils.fmtDateTime(r.created_at) }
    ], data || []);
  }

  function bindForm() {
    el('btnCreateUser').addEventListener('click', async (ev) => {
      ev.preventDefault();
      Utils.setMsg('adminMsg', '');
      const profile = App.state.profile;
      if (!profile || profile.role !== 'Administrador') {
        return Utils.setMsg('adminMsg', 'Apenas Administrador pode criar usuários.', true);
      }
      const email = el('adEmail').value.trim();
      const password = el('adPass').value;
      const name = el('adName').value.trim();
      const role = el('adRole').value;
      if (!email || !password || !name || !role) {
        return Utils.setMsg('adminMsg', 'Preencha todos os campos.', true);
      }
      Utils.setMsg('adminMsg', 'Criando usuário...');
      const res = await Utils.callFn('create-user', {
        method: 'POST',
        body: { email, password, name, role }
      });
      if (!res.ok) return Utils.setMsg('adminMsg', (res.data && res.data.error) || 'Falha ao criar usuário.', true);
      Utils.setMsg('adminMsg', 'Usuário criado com sucesso. O primeiro acesso exigirá troca de senha.');
      el('formUser').reset();
      await loadUsers();
    });
  }

  function init() {
    bindForm();
  }

  async function load() {
    // Só deixa abrir se perfil for Admin
    const p = App.state.profile;
    if (!p || p.role !== 'Administrador') {
      Utils.setMsg('adminMsg', 'Acesso restrito a Administrador.', true);
      return;
    }
    await loadUsers();
  }

  return { init, load };
})();
