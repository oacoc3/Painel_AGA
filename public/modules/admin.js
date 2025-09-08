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
          const wrap = document.createElement('div');
          const btnEdit = document.createElement('button');
          btnEdit.type = 'button';
          btnEdit.textContent = 'Editar';
          btnEdit.addEventListener('click', () => onEditUser(r));
          const btnDel = document.createElement('button');
          btnDel.type = 'button';
          btnDel.textContent = 'Excluir';
          btnDel.className = 'danger';
          btnDel.addEventListener('click', () => onDeleteUser(r));
          wrap.appendChild(btnEdit);
          wrap.appendChild(btnDel);
          return wrap;
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

  async function onEditUser(row) {
    const id = row?.id;
    if (!id) return;
    const name = prompt('Nome', row.name || '')?.trim();
    if (name === null) return;
    const email = prompt('E-mail', row.email || '')?.trim();
    if (email === null) return;
    const role = prompt('Perfil', row.role || '')?.trim();
    if (role === null) return;

    Utils.setMsg('adminMsg', 'Atualizando usuário...');

    const session = await getSession();
    const token = session && session.access_token;
    if (!token) {
      return Utils.setMsg('adminMsg', 'Sessão inválida. Faça login novamente.', true);
    }

    const res = await Utils.callFn('update-user', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { id, name, email, role }
    });
    if (!res.ok) {
      const msg = (res.data && res.data.error) || 'Falha ao atualizar usuário.';
      return Utils.setMsg('adminMsg', msg, true);
    }
    Utils.setMsg('adminMsg', 'Usuário atualizado.');
    await loadUsers();
  }

  async function getMyRole() {
    // Tenta via JWT (user_metadata.role); se ausente, cai para tabela profiles
    const u = await getUser();
    if (!u) return null;
    const roleFromJwt = (u.user_metadata && u.user_metadata.role) || null;
    if (roleFromJwt) return roleFromJwt;

    const { data, error } = await sb.from('profiles').select('role').eq('id', u.id).single();
    if (error) {
      console.warn('[admin] Falha ao obter role do banco:', error);
      return null;
    }
    return data?.role || null;
  }

  function bindForm() {
    el('btnCreateUser').addEventListener('click', async (ev) => {
      ev.preventDefault();

      Utils.setMsg('adminMsg', '');
      const role = await getMyRole();
      if (role !== 'Administrador') {
        return Utils.setMsg('adminMsg', 'Apenas Administrador pode criar usuários.', true);
      }
      const email = el('adEmail').value.trim();
      const name = el('adName').value.trim();
      const roleSel = el('adRole').value;
      if (!email || !name || !roleSel) {
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
        body: { email, name, role: roleSel }
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
    const role = await getMyRole();
    if (role !== 'Administrador') {
      Utils.setMsg('adminMsg', 'Acesso restrito a Administrador.', true);
      return;
    }
    await loadUsers();
  }

  return { init, load };
})();
