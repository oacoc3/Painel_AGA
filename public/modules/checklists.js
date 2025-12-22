// public/modules/checklists.js
window.Modules = window.Modules || {};
window.Modules.checklists = (() => {
  let selected = null;
  let selectedRowEl = null;
  let templates = [];
  const CARD_MSG_ID = 'ckManageMsg';

  // --- (NOVO) Opções de tipos de checklist + aliases/canônicos ---
  const CHECKLIST_TYPE_OPTIONS = [
    {
      value: 'OPEA - Documental',
      label: 'OPEA - Documental',
      dbValue: 'OPEA - Documental'
    },
    {
      value: 'AD/HEL - Documental',
      label: 'AD/HEL - Documental',
      dbValue: 'AD/HEL - Documental'
    }
  ];

  const TYPE_ALIAS_MAP = new Map();
  CHECKLIST_TYPE_OPTIONS.forEach(opt => {
    const register = (alias) => {
      if (!alias) return;
      TYPE_ALIAS_MAP.set(alias, opt.value);
      TYPE_ALIAS_MAP.set(alias.toLowerCase(), opt.value);
    };
    register(opt.value);
    (opt.variants || []).forEach(register);
  });

  const TYPE_LABEL_MAP = CHECKLIST_TYPE_OPTIONS.reduce((map, opt) => {
    map[opt.value] = opt.label;
    return map;
  }, {});

  const CANONICAL_TYPES = new Set(CHECKLIST_TYPE_OPTIONS.map(opt => opt.value));

  const TYPE_DB_VALUE_MAP = CHECKLIST_TYPE_OPTIONS.reduce((map, opt) => {
    map[opt.value] = opt.dbValue || opt.value;
    return map;
  }, {});

  function canonicalizeChecklistType(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    return TYPE_ALIAS_MAP.get(trimmed) || TYPE_ALIAS_MAP.get(trimmed.toLowerCase()) || trimmed;
  }
  // ----------------------------------------------------------------

  function setCardMsg(message, isError = false) {
    Utils.setMsg(CARD_MSG_ID, message, isError);
  }

  const getDialog = () => el('ckFormDialog');
  const getForm = () => el('formChecklist');
  const getCatsContainer = () => getDialog().querySelector('#ckCats');

  function setupAutoResize(textarea) {
    const minRows = parseInt(textarea.getAttribute('rows') || '2', 10);
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 18;
    const minHeight = lineHeight * minRows;
    const resize = () => {
      textarea.style.height = 'auto';
      const next = Math.max(minHeight, textarea.scrollHeight);
      textarea.style.height = `${next}px`;
    };
    textarea.addEventListener('input', resize);
    resize();
  }

  // >>> ALTERADO PELO PATCH: suporte a inserir item "abaixo" do atual
  function addItem(container, catEl, item = {}, options = {}) {
    const row = document.createElement('div');
    row.className = 'ck-item';
    row.innerHTML = `
      <input class="item-code" placeholder="Código" value="${item.code || ''}" required>
      <textarea class="item-req" placeholder="Requisito" rows="2" required></textarea>
      <textarea class="item-txt" placeholder="Texto(s) sugerido(s) (não conformidade / não aplicação)" rows="3"></textarea>
      <div class="ck-item-actions">
        <button type="button" class="insert-item" title="Adicionar item abaixo">+</button>
        <button type="button" class="del-item" title="Excluir item">×</button>
      </div>
    `;
    const req = row.querySelector('.item-req');
    const txt = row.querySelector('.item-txt');
    req.value = item.requisito || item.text || '';
    txt.value = item.texto_sugerido || '';

    row.querySelector('.del-item')?.addEventListener('click', () => row.remove());
    row.querySelector('.insert-item')?.addEventListener('click', () => {
      addItem(container, catEl, {}, { insertAfter: row });
    });

    const itemsContainer = catEl.querySelector('.ck-items');
    if (options.insertAfter && itemsContainer?.contains(options.insertAfter)) {
      itemsContainer.insertBefore(row, options.insertAfter.nextSibling);
    } else {
      itemsContainer?.appendChild(row);
    }
    [req, txt].forEach(setupAutoResize);
  }
  // <<< FIM DO PATCH

  function addCategory(container, cat = {}) {
    const box = document.createElement('div');
    box.className = 'ck-category';
    box.innerHTML = `
      <input class="cat-name" placeholder="Categoria" value="${cat.categoria || ''}" required>
      <div class="ck-items"></div>
      <button type="button" class="add-item">Adicionar item</button>
      <button type="button" class="del-cat">Excluir categoria</button>
    `;
    box.querySelector('.add-item').addEventListener('click', () => addItem(container, box));
    box.querySelector('.del-cat').addEventListener('click', () => box.remove());
    (cat.itens || []).forEach(it => addItem(container, box, it));
    container.appendChild(box);
  }

  function renderCats(container, items = []) {
    container.innerHTML = '';
    if (!items.length) addCategory(container);
    else items.forEach(cat => addCategory(container, cat));
  }

  function collectItems(container) {
    const cats = [];
    container.querySelectorAll('.ck-category').forEach(catEl => {
      const categoria = catEl.querySelector('.cat-name').value.trim();
      const itens = [];
      catEl.querySelectorAll('.ck-item').forEach(itEl => {
        const code = itEl.querySelector('.item-code').value.trim();
        const requisito = itEl.querySelector('.item-req').value.trim();
        const texto = itEl.querySelector('.item-txt').value.trim();
        if (code && requisito) itens.push({ code, requisito, texto_sugerido: texto || null });
      });
      if (categoria && itens.length) cats.push({ categoria, itens });
    });
    return cats;
  }

  function highlightRow(tr) {
    if (selectedRowEl && selectedRowEl.isConnected) {
      selectedRowEl.classList.remove('ck-selected');
    }
    selectedRowEl = tr || null;
    if (selectedRowEl) selectedRowEl.classList.add('ck-selected');
  }

  function updateActionButtons() {
    const hasSelection = !!selected;
    const btnEdit = el('btnEditChecklist');
    if (btnEdit) btnEdit.disabled = !hasSelection;
    const btnDelete = el('btnDeleteChecklist');
    if (btnDelete) btnDelete.disabled = !hasSelection;
    const btnDialogDelete = el('btnExcluirChecklist');
    if (btnDialogDelete) btnDialogDelete.disabled = !hasSelection;
    const btnApprove = el('btnAprovarChecklist');
    if (btnApprove) btnApprove.disabled = !hasSelection;
  }

  // Verifica/renova a sessão antes de operações (evita falhas por sessão expirada).
  async function ensureSessionActive(targetMsg) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session) return true;
      const { data: refreshed, error } = await sb.auth.refreshSession();
      if (error || !refreshed.session) throw error || new Error('no-session');
      return true;
    } catch (err) {
      const message = 'Sessão expirada. Recarregue a página ou faça login novamente.';
      if (targetMsg) Utils.setMsg(targetMsg, message, true);
      console.warn('[checklists] sessão expirada', err);
      return false;
    }
  }

  function openChecklistDialog(row = selected) {
    const dlg = getDialog();
    const form = getForm();
    const catsContainer = getCatsContainer();
    Utils.setMsg('ckMsg', '');
    form.reset();
    const typeField = form.querySelector('#ckCat');

    if (row) {
      selected = row;
      form.querySelector('#ckId').value = row.id;
      if (typeField) typeField.value = canonicalizeChecklistType(row.type || '');
      renderCats(catsContainer, row.items || []);
    } else {
      selected = null;
      renderCats(catsContainer);
      highlightRow(null);
      if (typeField) typeField.value = CHECKLIST_TYPE_OPTIONS[0]?.value || '';
    }
    updateActionButtons();
    dlg.showModal();
    form.querySelector('#ckCat').focus();
  }

  function closeChecklistDialog() {
    const dlg = getDialog();
    const form = getForm();
    const catsContainer = getCatsContainer();
    form.reset();
    renderCats(catsContainer);
    if (dlg.open) dlg.close();
  }

  function renderList() {
    const rows = templates;
    const { tbody } = Utils.renderTable('listaCk', [
      { key: 'type', label: 'Tipo', value: r => TYPE_LABEL_MAP[r.type] || r.type || '' },
      { key: 'version', label: 'Versão', align: 'center' },
      { key: 'created_at', label: 'Criado em', value: r => Utils.fmtDateTime(r.created_at) },
      { key: 'approved_at', label: 'Aprovada em', value: r => r.approved_at ? Utils.fmtDateTime(r.approved_at) : '' }
    ], rows);
    tbody?.addEventListener('click', ev => {
      const tr = ev.target.closest('tr'); if (!tr) return;
      const row = JSON.parse(tr.dataset.row);
      selected = row;
      highlightRow(tr);
      updateActionButtons();
      setCardMsg('');
    });
    tbody?.addEventListener('dblclick', ev => {
      const tr = ev.target.closest('tr'); if (!tr) return;
      const row = JSON.parse(tr.dataset.row);
      selected = row;
      highlightRow(tr);
      updateActionButtons();
      setCardMsg('');
      openChecklistDialog(row);
    });
  }

  async function deleteSelectedChecklist(context = 'dialog') {
    const targetMsg = context === 'card' ? CARD_MSG_ID : 'ckMsg';
    if (!selected) {
      Utils.setMsg(targetMsg, 'Selecione um checklist antes de excluir.', true);
      return;
    }
    if (context === 'card') {
      setCardMsg('');
      const confirmed = window.confirm('Deseja excluir o checklist selecionado?');
      if (!confirmed) return;
    }
    const { error } = await sb.from('checklist_templates').delete().eq('id', selected.id);
    if (error) {
      let message = error.message || 'Falha ao excluir checklist.';
      if (error.code === '23503') {
        message = 'Não é possível excluir: existe checklist preenchida vinculada a esta versão.';
      }
      Utils.setMsg(targetMsg, message, true);
      return;
    }
    Utils.setMsg(targetMsg, 'Excluído.');
    selected = null;
    highlightRow(null);
    closeChecklistDialog();
    updateActionButtons();
    await loadTemplates();
  }

  async function loadTemplates() {
    const { data, error } = await sb.from('checklist_templates')
      .select('id,name,type,version,items,created_at,approved_at')
      .order('created_at', { ascending: false });
    if (error) { Utils.setMsg('ckMsg', error.message, true); return; }

    templates = (data || [])
      .map(row => ({
        ...row,
        // Normaliza para canônico em memória (ex.: 'OPEA - Documental' -> 'OPEA')
        type: canonicalizeChecklistType(row.type || '')
      }))
      .filter(row => CANONICAL_TYPES.has(row.type));

    selected = null;
    highlightRow(null);
    updateActionButtons();
    renderList();
  }

  function bindForm() {
    const dlg = getDialog();
    const catsContainer = getCatsContainer();
    const form = getForm();

    // (NOVO) Popular <select id="ckCat"> com opções canônicas
    const typeSelect = form?.querySelector('#ckCat');
    if (typeSelect) {
      typeSelect.innerHTML = CHECKLIST_TYPE_OPTIONS
        .map(opt => `<option value="${opt.value}">${opt.label}</option>`)
        .join('');
    }

    el('btnAddCat').addEventListener('click', () => addCategory(catsContainer));
    el('btnCloseChecklist').addEventListener('click', () => closeChecklistDialog());
    el('btnNewChecklist').addEventListener('click', () => {
      setCardMsg('');
      openChecklistDialog();
    });
    el('btnEditChecklist').addEventListener('click', () => {
      if (!selected) return;
      setCardMsg('');
      openChecklistDialog(selected);
    });
    el('btnDeleteChecklist').addEventListener('click', () => deleteSelectedChecklist('card'));

    dlg.addEventListener('cancel', ev => {
      ev.preventDefault();
      closeChecklistDialog();
    });

    renderCats(catsContainer);
    updateActionButtons();

    el('adminBtnSalvarChecklist').addEventListener('click', async ev => {
      ev.preventDefault();
      const form = getForm();
      const items = collectItems(catsContainer);

      // Normaliza e valida o tipo
      const rawType = form.querySelector('#ckCat')?.value || '';
      const type = canonicalizeChecklistType(rawType);
      const dbType = TYPE_DB_VALUE_MAP[type] || type;
      if (!type || !CANONICAL_TYPES.has(type) || !items.length) {
        return Utils.setMsg('ckMsg', 'Preencha todos os campos.', true);
      }

      const sessionOk = await ensureSessionActive('ckMsg');
      if (!sessionOk) return;
      const u = await getUser();
      if (!u) return Utils.setMsg('ckMsg', 'Sessão expirada.', true);

      const name = selected?.name?.trim() || TYPE_LABEL_MAP[type] || type;
      const isEditingApproved = !!selected?.approved_at;

      if (selected && !isEditingApproved) {
        const { error } = await sb.from('checklist_templates')
          .update({ name, type: dbType, items })
          .eq('id', selected.id);
        if (error) return Utils.setMsg('ckMsg', error.message, true);
      } else {
        // Busca a última versão diretamente na base para evitar conflitos de chave única
        // em casos de cache desatualizado ou alterações concorrentes.
        const { data: lastVersionRows, error: lastVersionError } = await sb.from('checklist_templates')
          .select('version')
          .eq('name', name)
          .order('version', { ascending: false })
          .limit(1);
        if (lastVersionError) return Utils.setMsg('ckMsg', lastVersionError.message, true);

        const lastVersion = lastVersionRows?.[0]?.version || 0;
        const version = lastVersion + 1;
        const payload = {
          name,
          type: dbType,
          items,
          version,
          created_by: u.id,
          approved_by: null,
          approved_at: null
        };
        const { error } = await sb.from('checklist_templates')
          .insert(payload);
        if (error) return Utils.setMsg('ckMsg', error.message, true);
      }

      Utils.setMsg('ckMsg', 'Salvo.');
      selected = null;
      highlightRow(null);
      closeChecklistDialog();
      updateActionButtons();
      await loadTemplates();
    });

    el('btnExcluirChecklist').addEventListener('click', () => deleteSelectedChecklist('dialog'));

    el('btnAprovarChecklist').addEventListener('click', async () => {
      if (!selected) return Utils.setMsg('ckMsg', 'Selecione um checklist antes de aprovar.', true);
      const sessionOk = await ensureSessionActive('ckMsg');
      if (!sessionOk) return;
      const u = await getUser();
      if (!u) return Utils.setMsg('ckMsg', 'Sessão expirada.', true);
      const { error } = await sb.from('checklist_templates')
        .update({ approved_by: u.id, approved_at: new Date().toISOString() })
        .eq('id', selected.id);
      if (error) return Utils.setMsg('ckMsg', error.message, true);
      Utils.setMsg('ckMsg', 'Checklist aprovada.');
      await loadTemplates();
    });
  }

  function init() { bindForm(); }
  async function load() { await loadTemplates(); }

  return { init, load, openChecklistDialog, closeChecklistDialog };
})();
