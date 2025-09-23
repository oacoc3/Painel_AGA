// public/modules/admin.js
window.Modules = window.Modules || {};
window.Modules.admin = (() => {
  // Paginação local (RPC admin_list_profiles não aceita range)
  let ADMIN_PAGE = 1;
  const ADMIN_PAGE_SIZE = 50;
  let ADMIN_CACHE = [];

  // --- (NOVO) Auditoria ---
  const AUDIT_LOG_LIMIT = 200;
  const AUDIT_EVENT_LABELS = {
    login: 'Login',
    logout: 'Logout',
    module_access: 'Acesso ao módulo'
  };
  const AUDIT_MODULE_LABELS = {
    dashboard: 'Início',
    processos: 'Processos',
    prazos: 'Prazos',
    modelos: 'Modelos',
    analise: 'Documental',
    admin: 'Administração',
    login: 'Login'
  };

  const el = id => document.getElementById(id);

  function renderUsersPagination({ page, pagesTotal, count }) {
    const box = el('listaUsers');
    if (!box) return;
    let pager = box.querySelector('.pager');
    if (!pager) {
      pager = document.createElement('div');
      pager.className = 'pager';
      box.appendChild(pager);
    }
    const disablePrev = page <= 1;
    const disableNext = page >= pagesTotal;
    pager.innerHTML = `
      <div class="row" style="display:flex;gap:.5rem;align-items:center;justify-content:flex-end;margin-top:.5rem;">
        <button type="button" id="admFirstPage" ${disablePrev ? 'disabled' : ''}>&laquo;</button>
        <button type="button" id="admPrevPage" ${disablePrev ? 'disabled' : ''}>&lsaquo;</button>
        <span id="admPagerInfo">${page} / ${pagesTotal} (${count} itens)</span>
        <button type="button" id="admNextPage" ${disableNext ? 'disabled' : ''}>&rsaquo;</button>
        <button type="button" id="admLastPage" ${disableNext ? 'disabled' : ''}>&raquo;</button>
      </div>`;
    pager.querySelector('#admFirstPage')?.addEventListener('click', () => loadUsers({ page: 1 }));
    pager.querySelector('#admPrevPage')?.addEventListener('click', () => loadUsers({ page: Math.max(1, ADMIN_PAGE - 1) }));
    pager.querySelector('#admNextPage')?.addEventListener('click', () => loadUsers({ page: ADMIN_PAGE + 1 }));
    pager.querySelector('#admLastPage')?.addEventListener('click', () => {
      const pages = Math.max(1, Math.ceil((ADMIN_CACHE.length || 0) / ADMIN_PAGE_SIZE));
      loadUsers({ page: pages });
    });
  }

  async function loadUsers({ page = ADMIN_PAGE, pageSize = ADMIN_PAGE_SIZE } = {}) {
    // Usa RPC com SECURITY DEFINER para listar perfis respeitando a autorização de Administrador
    const { data, error } = await sb.rpc('admin_list_profiles');
    if (error) return Utils.setMsg('adminMsg', error.message, true);

    const all = data || [];
    const p = Math.max(1, Number(page) || 1);
    const size = Math.max(1, Number(pageSize) || ADMIN_PAGE_SIZE);
    ADMIN_PAGE = p;
    ADMIN_CACHE = all;
    const pagesTotal = Math.max(1, Math.ceil(all.length / size));
    const from = (p - 1) * size;
    const to = from + size;
    const slice = all.slice(from, to);

    Utils.renderTable('listaUsers', [
      { key: 'name', label: 'Posto/Gad + Nome' },
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
    ], slice);

    renderUsersPagination({ page: p, pagesTotal, count: all.length });
  }

  // --- (NOVO) Helpers de rótulos da auditoria ---
  function getAuditModuleLabel(code) {
    if (!code) return '—';
    return AUDIT_MODULE_LABELS[code] || code;
  }

  function getAuditEventLabel(row) {
    if (!row) return '—';
    const base = AUDIT_EVENT_LABELS[row.event_type] || row.event_type || '—';
    if (row.event_type === 'module_access') return base;
    return base;
  }

  // --- (NOVO) Célula composta com dados do usuário na auditoria ---
  function renderAuditUserCell(row) {
    const wrap = document.createElement('div');
    wrap.className = 'audit-user-cell';
    const name = document.createElement('strong');
    name.textContent = row.name || row.email || '—';
    wrap.appendChild(name);
    if (row.email) {
      const email = document.createElement('div');
      email.className = 'muted';
      email.textContent = row.email;
      wrap.appendChild(email);
    }
    if (row.role) {
      const role = document.createElement('div');
      role.className = 'muted';
      role.textContent = row.role;
      wrap.appendChild(role);
    }
    return wrap;
  }

  // --- (NOVO) Carregamento de logs de auditoria ---
  async function loadAuditLogs({ limit = AUDIT_LOG_LIMIT } = {}) {
    const tableId = 'auditLogTable';
    const msgId = 'auditLogMsg';
    const headers = [
      { label: 'Usuário', render: renderAuditUserCell },
      { key: 'event_label', label: 'Evento' },
      { key: 'module_label', label: 'Módulo' },
      {
        key: 'created_at',
        label: 'Horário',
        value: row => Utils.fmtDateTime(row.created_at),
        align: 'right'
      }
    ];

    Utils.setMsg(msgId, 'Carregando registros...');
    try {
      const { data, error } = await sb.rpc('admin_list_user_audit', { p_limit: limit });
      if (error) {
        Utils.setMsg(msgId, error.message || 'Falha ao carregar registros.', true);
        Utils.renderTable(tableId, headers, []);
        return;
      }

      const rows = Array.isArray(data) ? data.map(row => ({
        ...row,
        event_label: getAuditEventLabel(row),
        module_label: getAuditModuleLabel(row.event_module)
      })) : [];

      if (!rows.length) {
        Utils.setMsg(msgId, 'Nenhum evento registrado.');
      } else {
        Utils.setMsg(msgId, '');
      }

      Utils.renderTable(tableId, headers, rows);
    } catch (err) {
      console.error('[admin] Falha ao carregar auditoria:', err);
      Utils.setMsg(msgId, err?.message || 'Falha ao carregar registros.', true);
      Utils.renderTable(tableId, headers, []);
    }
  }

  function resetForm() {
    const form = el('formUser');
    if (!form) return;
    form.reset();
    delete form.dataset.editing;
    const btn = el('btnCreateUser');
    if (btn) btn.textContent = 'Criar';
  }

  function onEditUser(user) {
    const form = el('formUser');
    if (!form) return;
    form.dataset.editing = user.id;
    el('adEmail').value = user.email || '';
    el('adName').value = user.name || '';
    el('adRole').value = user.role || '';
    const btn = el('btnCreateUser');
    if (btn) btn.textContent = 'Atualizar';
  }

  async function callAdminFn(fn, payload) {
    const session = await getSession();
    const token = session?.access_token || '';
    const res = await fetch(`/.netlify/functions/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload || {})
    });
    try { return await res.json(); }
    catch { return { ok: false, error: 'Resposta inválida' }; }
  }

  async function onDeleteUser(user) {
    if (!confirm('Confirma excluir este usuário?')) return;
    const { ok, error } = await callAdminFn('delete-user', { id: user.id });
    if (!ok) return Utils.setMsg('adminMsg', error || 'Falha ao excluir.', true);
    Utils.setMsg('adminMsg', 'Usuário excluído.');
    await loadUsers({ page: ADMIN_PAGE });
  }

  async function submitUser() {
    const email = el('adEmail').value.trim();
    const name = el('adName').value.trim();
    const role = el('adRole').value;
    if (!email || !name || !role) {
      return Utils.setMsg('adminMsg', 'Preencha todos os campos.', true);
    }
    const form = el('formUser');
    const editing = form?.dataset.editing;
    const fn = editing ? 'update-user' : 'create-user';
    const payload = editing ? { id: editing, email, name, role } : { email, name, role };
    const { ok, error } = await callAdminFn(fn, payload);
    if (!ok) return Utils.setMsg('adminMsg', error || 'Falha ao salvar.', true);
    Utils.setMsg('adminMsg', editing ? 'Usuário atualizado.' : 'Usuário criado.');
    resetForm();
    await loadUsers({ page: ADMIN_PAGE });
  }

  function bindForm() {
    el('btnCreateUser')?.addEventListener('click', ev => {
      ev.preventDefault();
      submitUser();
    });
  }

  // --- (NOVO) Bind de ações da auditoria ---
  function bindAuditActions() {
    el('btnAuditRefresh')?.addEventListener('click', ev => {
      ev.preventDefault();
      loadAuditLogs();
    });
  }

  function init() {
    bindForm();
    bindAuditActions();
  }

  async function load() {
    await loadUsers();
    await loadAuditLogs({ limit: AUDIT_LOG_LIMIT });
  }

  return { init, load };
})();
