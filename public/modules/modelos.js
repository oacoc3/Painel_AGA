// public/modules/modelos.js
window.Modules = window.Modules || {};
window.Modules.modelos = (() => {
  let selectedId = null;
  let modelos = [];

  function checkModeloFields() {
    const cat = el('mdlCat').value.trim();
    const tit = el('mdlTit').value.trim();
    const txt = el('mdlTxt');
    if (cat && tit) {
      const mdl = modelos.find(m => m.category === cat && m.title === tit);
      if (mdl) {
        selectedId = mdl.id;
        el('mdlId').value = mdl.id;
        txt.value = mdl.content || '';
        txt.disabled = false;
        Utils.setMsg('mdlMsg', `Carregado: ${mdl.title}`);
      } else {
        selectedId = null;
        el('mdlId').value = '';
        txt.disabled = false;
        Utils.setMsg('mdlMsg', '');
      }
    } else {
      selectedId = null;
      el('mdlId').value = '';
      txt.value = '';
      txt.disabled = true;
    }
  }

  function renderModelos() {
    const cat = el('mdlFiltroCat')?.value || '';
    let rows = modelos;
    if (cat) rows = rows.filter(m => m.category === cat);
    const { tbody } = Utils.renderTable('listaModelos', [
      { key: 'category', label: 'Categoria' },
      { key: 'title', label: 'Título' },
      { key: 'updated_at', label: 'Atualizado em', value: r => Utils.fmtDateTime(r.updated_at) },
      {
        label: 'Ações',
        render: (r) => {
          const box = document.createElement('div');
          box.className = 'actions';

          const bEd = document.createElement('button');
          bEd.type = 'button';
          bEd.textContent = 'Editar';
          bEd.addEventListener('click', ev => {
            ev.stopPropagation();
            selectedId = r.id;
            el('mdlId').value = r.id;
            el('mdlCat').value = r.category;
            el('mdlTit').value = r.title;
            el('mdlTxt').disabled = false;
            el('mdlTxt').value = r.content;
            Utils.setMsg('mdlMsg', `Carregado: ${r.title}`);
          });

          const bDel = document.createElement('button');
          bDel.type = 'button';
          bDel.className = 'danger';
          bDel.textContent = 'Excluir';
          bDel.addEventListener('click', async ev => {
            ev.stopPropagation();
            const { error } = await sb.from('models').delete().eq('id', r.id);
            if (error) return Utils.setMsg('mdlMsg', error.message, true);
            Utils.setMsg('mdlMsg', 'Excluído.');
            if (selectedId === r.id) {
              selectedId = null;
              el('formModelo').reset();
              el('mdlTxt').disabled = true;
            }
            await loadModelos();
          });

          box.appendChild(bEd);
          box.appendChild(bDel);
          return box;
        }
      }
    ], rows);

    tbody?.addEventListener('click', ev => {
      const tr = ev.target.closest('tr'); if (!tr) return;
      const row = JSON.parse(tr.dataset.row);
      selectedId = row.id;
      el('mdlId').value = row.id;
      el('mdlCat').value = row.category;
      el('mdlTit').value = row.title;
      el('mdlTxt').disabled = false;
      el('mdlTxt').value = row.content;
      Utils.setMsg('mdlMsg', `Carregado: ${row.title}`);
    });
  }

  function renderCategorias() {
    const sel = el('mdlFiltroCat');
    if (!sel) return;
    const cats = Array.from(new Set(modelos.map(m => m.category).filter(Boolean))).sort();
    sel.innerHTML = '<option value="">Todas</option>' + cats.map(c => `<option>${c}</option>`).join('');
  }

  async function loadModelos() {
    const { data, error } = await sb.from('models')
      .select('id,category,title,content,updated_at')
      .order('updated_at', { ascending: false });
    if (error) { Utils.setMsg('mdlMsg', error.message, true); return; }
    modelos = data || [];
    renderCategorias();
    renderModelos();
  }

  function bindForm() {
    el('mdlTxt').disabled = true;
    el('mdlCat').addEventListener('input', checkModeloFields);
    el('mdlTit').addEventListener('input', checkModeloFields);

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
      el('mdlTxt').disabled = true;
      await loadModelos();
    });

    el('btnCopiarModelo').addEventListener('click', async (ev) => {
      ev.preventDefault();
      const txt = el('mdlTxt').value;
      if (!txt) return Utils.setMsg('mdlMsg', 'Nada para copiar.', true);
      try {
        await navigator.clipboard.writeText(txt);
        Utils.setMsg('mdlMsg', 'Conteúdo copiado para a área de transferência.');
      } catch {
        Utils.setMsg('mdlMsg', 'Falha ao copiar o conteúdo.', true);
      }
    });

    el('btnLimparModelo').addEventListener('click', (ev) => {
      ev.preventDefault();
      selectedId = null;
      el('formModelo').reset();
      el('mdlTxt').disabled = true;
      Utils.setMsg('mdlMsg', '');
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

  function init() { bindForm(); el('mdlFiltroCat')?.addEventListener('change', renderModelos); }
  async function load() { await loadModelos(); }

  return { init, load };
})();
