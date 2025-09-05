// public/modules/checklists.js
window.Modules = window.Modules || {};
window.Modules.checklists = (() => {
  let selected = null;
  let templates = [];

  function renderList() {
    const rows = templates;
    const { tbody } = Utils.renderTable('listaCk', [
      { key: 'name', label: 'Nome' },
      { key: 'category', label: 'Categoria' },
      { key: 'version', label: 'Versão', align: 'center' },
      { key: 'created_at', label: 'Criado em', value: r => Utils.fmtDateTime(r.created_at) }
    ], rows);
    tbody?.addEventListener('click', ev => {
      const tr = ev.target.closest('tr'); if (!tr) return;
      const row = JSON.parse(tr.dataset.row);
      selected = row;
      el('ckId').value = row.id;
      el('ckName').value = row.name;
      el('ckCat').value = row.category;
      el('ckItems').value = JSON.stringify(row.items, null, 2);
      Utils.setMsg('ckMsg', `Carregado: ${row.name} v${row.version}`);
    });
  }

  async function loadTemplates() {
    const { data, error } = await sb.from('checklist_templates')
      .select('id,name,category,version,items,created_at')
      .order('created_at', { ascending: false });
    if (error) { Utils.setMsg('ckMsg', error.message, true); return; }
    templates = data || [];
    renderList();
  }

  function bindForm() {
    el('btnSalvarChecklist').addEventListener('click', async ev => {
      ev.preventDefault();
      const name = el('ckName').value.trim();
      const category = el('ckCat').value.trim();
      let items;
      try { items = JSON.parse(el('ckItems').value); }
      catch { return Utils.setMsg('ckMsg', 'Itens inválidos (JSON).', true); }
      if (!name || !category) return Utils.setMsg('ckMsg', 'Preencha todos os campos.', true);
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
      await loadTemplates();
    });

    el('btnExcluirChecklist').addEventListener('click', async () => {
      if (!selected) return Utils.setMsg('ckMsg', 'Selecione um checklist antes de excluir.', true);
      const { error } = await sb.from('checklist_templates').delete().eq('id', selected.id);
      if (error) return Utils.setMsg('ckMsg', error.message, true);
      Utils.setMsg('ckMsg', 'Excluído.');
      selected = null;
      el('formChecklist').reset();
      await loadTemplates();
    });
  }

  function init() { bindForm(); }
  async function load() { await loadTemplates(); }

  return { init, load };
})();
