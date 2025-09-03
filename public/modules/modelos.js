window.Modules = window.Modules || {};
window.Modules.modelos = (() => {
  let selectedId = null;

  async function loadModelos() {
    const { data, error } = await sb.from('models')
      .select('id,category,title,content,updated_at')
      .order('updated_at', { ascending: false });
    if (error) { Utils.setMsg('mdlMsg', error.message, true); return; }
    const { tbody } = Utils.renderTable('listaModelos', [
      { key: 'category', label: 'Categoria' },
      { key: 'title', label: 'Título' },
      { key: 'updated_at', label: 'Atualizado em', value: r => Utils.fmtDateTime(r.updated_at) }
    ], data);

    tbody?.addEventListener('click', ev => {
      const tr = ev.target.closest('tr'); if (!tr) return;
      const row = JSON.parse(tr.dataset.row);
      selectedId = row.id;
      el('mdlId').value = row.id;
      el('mdlCat').value = row.category;
      el('mdlTit').value = row.title;
      el('mdlTxt').value = row.content;
      Utils.setMsg('mdlMsg', `Carregado: ${row.title}`);
    });
  }

  function bindForm() {
    el('btnSalvarModelo').addEventListener('click', async (ev) => {
      ev.preventDefault();
      const category = el('mdlCat').value.trim();
      const title = el('mdlTit').value.trim();
      const content = el('mdlTxt').value;
      if (!category || !title || !content) return Utils.setMsg('mdlMsg', 'Preencha todos os campos.', true);
      const u = await getUser();
      if (!u) return Utils.setMsg('mdlMsg', 'Sessão expirada.', true);
      if (!selectedId) {
        const { error } = await sb.from('models').insert({ category, title, content, created_by: u.id });
        if (error) return Utils.setMsg('mdlMsg', error.message, true);
      } else {
        const { error } = await sb.from('models').update({ category, title, content }).eq('id', selectedId);
        if (error) return Utils.setMsg('mdlMsg', error.message, true);
      }
      Utils.setMsg('mdlMsg', 'Salvo.');
      selectedId = null; el('formModelo').reset();
      await loadModelos();
    });

    el('btnExcluirModelo').addEventListener('click', async () => {
      if (!selectedId) return Utils.setMsg('mdlMsg', 'Selecione um modelo antes de excluir.', true);
      const { error } = await sb.from('models').delete().eq('id', selectedId);
      if (error) return Utils.setMsg('mdlMsg', error.message, true);
      Utils.setMsg('mdlMsg', 'Excluído.');
      selectedId = null; el('formModelo').reset();
      await loadModelos();
    });

    // Copiar conteúdo ao clicar numa linha (duplo-clique)
    el('listaModelos').addEventListener('dblclick', (ev) => {
      const tr = ev.target.closest('tr'); if (!tr) return;
      const row = JSON.parse(tr.dataset.row);
      navigator.clipboard.writeText(row.content || '').then(() => {
        Utils.setMsg('mdlMsg', 'Conteúdo copiado para a área de transferência.');
      });
    });
  }

  function init() { bindForm(); }
  async function load() { await loadModelos(); }

  return { init, load };
})();
