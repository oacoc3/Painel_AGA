// public/modules/checklists.js
window.Modules = window.Modules || {};
window.Modules.checklists = (() => {
  let selected = null;
  let templates = [];

  function addItem(catEl, item = {}) {
    const row = document.createElement('div');
    row.className = 'ck-item';
    row.innerHTML = `
      <input class="item-code" placeholder="Código" value="${item.code || ''}" required>
      <input class="item-req" placeholder="Requisito" value="${item.requisito || item.text || ''}" required>
      <input class="item-txt" placeholder="Texto sugerido" value="${item.texto_sugerido || ''}">
      <button type="button" class="del-item">×</button>
    `;
    row.querySelector('.del-item').addEventListener('click', () => row.remove());
    catEl.querySelector('.ck-items').appendChild(row);
  }

  function addCategory(cat = {}) {
    const box = document.createElement('div');
    box.className = 'ck-category';
    box.innerHTML = `
      <input class="cat-name" placeholder="Categoria" value="${cat.categoria || ''}" required>
      <div class="ck-items"></div>
      <button type="button" class="add-item">Adicionar item</button>
      <button type="button" class="del-cat">Excluir categoria</button>
    `;
    box.querySelector('.add-item').addEventListener('click', () => addItem(box));
    box.querySelector('.del-cat').addEventListener('click', () => box.remove());
    (cat.itens || []).forEach(it => addItem(box, it));
    el('ckCats').appendChild(box);
  }

  function renderCats(items = []) {
    el('ckCats').innerHTML = '';
    if (!items.length) addCategory();
    else items.forEach(cat => addCategory(cat));
  }

  function collectItems() {
    const cats = [];
    $$('#ckCats .ck-category').forEach(catEl => {
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

  function renderList() {
    const rows = templates;
    const { tbody } = Utils.renderTable('listaCk', [
      { key: 'name', label: 'Nome' },
      { key: 'category', label: 'Categoria' },
      { key: 'version', label: 'Versão', align: 'center' },
      { key: 'created_at', label: 'Criado em', value: r => Utils.fmtDateTime(r.created_at) },
      { key: 'approved_at', label: 'Aprovada em', value: r => r.approved_at ? Utils.fmtDateTime(r.approved_at) : '' }
    ], rows);
    tbody?.addEventListener('click', ev => {
      const tr = ev.target.closest('tr'); if (!tr) return;
      const row = JSON.parse(tr.dataset.row);
      selected = row;
      el('ckId').value = row.id;
      el('ckName').value = row.name;
      el('ckCat').value = row.category;
      renderCats(row.items);
      Utils.setMsg('ckMsg', `Carregado: ${row.name} v${row.version}`);
    });
  }

  async function loadTemplates() {
    const { data, error } = await sb.from('checklist_templates')
      .select('id,name,category,version,items,created_at,approved_at')
      .order('created_at', { ascending: false });
    if (error) { Utils.setMsg('ckMsg', error.message, true); return; }
    templates = (data || []);
    renderList();
  }

  function bindForm() {
    el('btnAddCat').addEventListener('click', () => addCategory());

    el('adminBtnSalvarChecklist').addEventListener('click', async ev => {
      ev.preventDefault();
      const name = el('ckName').value.trim();
      const category = el('ckCat').value.trim();
      const items = collectItems();
      if (!name || !category || !items.length) return Utils.setMsg('ckMsg', 'Preencha todos os campos.', true);
      const u = await getUser();
      if (!u) return Utils.setMsg('ckMsg', 'Sessão expirada.', true);
      let version = 1;
      if (selected) {
        version = (selected.version || 1) + 1;
      } else {
        const max = Math.max(0, ...templates.filter(t => t.name === name).map(t => t.version || 0));
        version = max + 1;
      }
      const { error } = await sb.from('checklist_templates').insert({ name, category, items, version, created_by: u.id });
      if (error) return Utils.setMsg('ckMsg', error.message, true);
      Utils.setMsg('ckMsg', 'Salvo.');
      selected = null;
      el('formChecklist').reset();
      renderCats();
      await loadTemplates();
    });

    el('btnExcluirChecklist').addEventListener('click', async () => {
      if (!selected) return Utils.setMsg('ckMsg', 'Selecione um checklist antes de excluir.', true);
      const { error } = await sb.from('checklist_templates').delete().eq('id', selected.id);
      if (error) return Utils.setMsg('ckMsg', error.message, true);
      Utils.setMsg('ckMsg', 'Excluído.');
      selected = null;
      el('formChecklist').reset();
      renderCats();
      await loadTemplates();
    });

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

  function init() { bindForm(); renderCats(); }
  async function load() { await loadTemplates(); }

  return { init, load };
})();
