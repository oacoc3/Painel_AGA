// public/modules/admin.js
window.Modules = window.Modules || {};
window.Modules.admin = (() => {
  async function loadUsers() {
    // Usa RPC com SECURITY DEFINER para listar perfis respeitando a autorização de Administrador
    const { data, error } = await sb.rpc('admin_list_profiles');
    if (error) return Utils.setMsg('adminMsg', error.message, true);

    Utils.renderTable('listaUsers', [
      { key: 'name', label: 'Identificação' },
      { key: 'email', label: 'E-mail' },
      { key: 'role', label: 'Perfil' },
      { key: 'created_at', label: 'Criado em', value: r => Utils.fmtDateTime(r.created_at) },
      {
        label: '',
        render: (r) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'Excluir';
          btn.className = 'danger';
          btn.addEventListener('click', () => onDeleteUser(r));
          return btn;
        }
      }
    ], data || []);
  }

  async function onDeleteUser(row) {
    const id = row?.id;
    if (!id) return;
    if (!confirm('Excluir usuário?')) return;
    Utils.setMsg('adminMsg', 'Excluindo usuário...');

    const session = await getSession();
    const token = session && session.access_token;
    if (!token) {
      return Utils.setMsg('adminMsg', 'Sessão inválida. Faça login novamente.', true);
    }

    const res = await Utils.callFn('delete-user', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { id }
    });
    if (!res.ok) {
      const msg = (res.data && res.data.error) || 'Falha ao excluir usuário.';
      return Utils.setMsg('adminMsg', msg, true);
    }
    Utils.setMsg('adminMsg', 'Usuário excluído.');
    await loadUsers();
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
      const name = el('adName').value.trim();
      const role = el('adRole').value;
      if (!email || !name || !role) {
        return Utils.setMsg('adminMsg', 'Preencha todos os campos.', true);
      }

      Utils.setMsg('adminMsg', 'Criando usuário...');

      const session = await getSession();
      const token = session && session.access_token;
      if (!token) {
        return Utils.setMsg('adminMsg', 'Sessão inválida. Faça login novamente.', true);
      }

      const res = await Utils.callFn('create-user', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { email, name, role }
      });
      if (!res.ok) {
        const msg = (res.data && res.data.error) || 'Falha ao criar usuário.';
        return Utils.setMsg('adminMsg', msg, true);
      }
      Utils.setMsg('adminMsg', 'Usuário criado com sucesso.');
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
