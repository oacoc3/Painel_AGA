export async function renderModelos(){
  const form = document.getElementById('form-modelo');
  const msg = document.getElementById('modelo-msg');
  const tbody = document.getElementById('modelo-list');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('modelo-id').value || null;
    const payload = {
      category: document.getElementById('modelo-cat').value.trim(),
      title: document.getElementById('modelo-title').value.trim(),
      content: document.getElementById('modelo-content').value
    };
    let res;
    if (id) res = await supabase.from('models').update(payload).eq('id', id).select().single();
    else res = await supabase.from('models').insert(payload).select().single();
    if (res.error){ msg.textContent = res.error.message; return; }
    msg.textContent = 'Salvo.'; form.reset(); await reload();
  };
  document.getElementById('btn-modelo-novo').onclick = () => form.reset();

  async function reload(){
    const { data } = await supabase.from('models').select('*').order('category').order('title');
    tbody.innerHTML = '';
    (data||[]).forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${m.category}</td><td>${m.title}</td>
        <td>
          <button data-id="${m.id}" class="edit">Editar</button>
          <button data-id="${m.id}" class="copy">Copiar</button>
          <button data-id="${m.id}" class="del">Excluir</button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.edit').forEach(b => b.onclick = async () => {
      const { data: m } = await supabase.from('models').select('*').eq('id', b.dataset.id).single();
      document.getElementById('modelo-id').value = m.id;
      document.getElementById('modelo-cat').value = m.category;
      document.getElementById('modelo-title').value = m.title;
      document.getElementById('modelo-content').value = m.content;
    });
    tbody.querySelectorAll('.copy').forEach(b => b.onclick = async () => {
      const { data: m } = await supabase.from('models').select('content').eq('id', b.dataset.id).single();
      await navigator.clipboard.writeText(m.content || '');
      alert('Conteúdo copiado.');
    });
    tbody.querySelectorAll('.del').forEach(b => b.onclick = async () => {
      if (!confirm('Excluir modelo?')) return;
      await supabase.from('models').delete().eq('id', b.dataset.id);
      await reload();
    });
  }
  await reload();
}
