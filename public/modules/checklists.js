// public/modules/checklists.js
window.Modules = window.Modules || {};
window.Modules.checklists = (() => {
  let selected = null;
  let selectedRowEl = null;
  let templates = [];
  const CARD_MSG_ID = 'ckManageMsg';

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

  function addItem(container, catEl, item = {}) {
    const row = document.createElement('div');
    row.className = 'ck-item';
    row.innerHTML = `
      <input class="item-code" placeholder="Código" value="${item.code || ''}" required>
      <textarea class="item-req" placeholder="Requisito" rows="2" required></textarea>
      <textarea class="item-txt" placeholder="Texto sugerido" rows="3"></textarea>
      <button type="button" class="del-item">×</button>
    `;
    const req = row.querySelector('.item-req');
    const txt = row.querySelector('.item-txt');
    req.value = item.requisito || item.text || '';
    txt.value = item.texto_sugerido || '';
    row.querySelector('.del-item').addEventListener('click', () => row.remove());
    catEl.querySelector('.ck-items').appendChild(row);
    [req, txt].forEach(setupAutoResize);
  }

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

  function openChecklistDialog(row = selected) {
    const dlg = getDialog();
    const form = getForm();
    const catsContainer = getCatsContainer();
    Utils.setMsg('ckMsg', '');
    form.reset();
    if (row) {
      selected = row;
      form.querySelector('#ckId').value = row.id;
      // category -> type
      form.querySelector('#ckCat').value = row.type || '';
      renderCats(catsContainer, row.items || []);
    } else {
      selected = null;
      renderCats(catsContainer);
      highlightRow(null);
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
      { key: 'name', label: 'Nome' },
      // category -> type
      { key: 'type', label: 'Tipo' },
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
      // category -> type
      .select('id,name,type,version,items,created_at,approved_at')
      .order('created_at', { ascending: false });
    if (error) { Utils.setMsg('ckMsg', error.message, true); return; }
    templates = (data || []);
    selected = null;
    highlightRow(null);
    updateActionButtons();
    renderList();
  }

  function bindForm() {
    const dlg = getDialog();
    const catsContainer = getCatsContainer();

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
      // category -> type
      const type = form.querySelector('#ckCat').value.trim();
      if (!type || !items.length) return Utils.setMsg('ckMsg', 'Preencha todos os campos.', true);
      const u = await getUser();
      if (!u) return Utils.setMsg('ckMsg', 'Sessão expirada.', true);
      const name = selected?.name?.trim() || type;
      let version = 1;
      if (selected) {
        version = (selected.version || 1) + 1;
      } else {
        const max = Math.max(0, ...templates.filter(t => t.type === type).map(t => t.version || 0));
        version = max + 1;
      }
      // category -> type
      const { error } = await sb.from('checklist_templates').insert({ name, type, items, version, created_by: u.id });
      if (error) return Utils.setMsg('ckMsg', error.message, true);
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
