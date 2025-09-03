import { guardRoute } from './auth.js';

export async function renderAdmin(){
  if (!await guardRoute(['ADMIN'])) return;

  // Listar perfis
  await reloadProfiles();

  // Criar usuário
  const form = document.createElement('form');
  form.className = 'card';
  form.innerHTML = `
    <h2>Cadastrar usuário</h2>
    <label>E-mail <input type="email" id="adm-email" required></label>
    <label>Senha inicial <input type="text" id="adm-pass" required minlength="8"></label>
    <label>Identificação <input type="text" id="adm-name" required></label>
    <label>Perfil
      <select id="adm-role">
        <option>ADMIN</option>
        <option>ANAL_OACO</option>
        <option>ANAL_OAGA</option>
        <option>CH_OACO</option>
        <option>CH_OAGA</option>
        <option>CH_AGA</option>
        <option>VISITANTE</option>
      </select>
    </label>
    <button type="submit">Criar</button>
    <div class="msg" id="adm-msg"></div>
  `;
  const route = document.getElementById('route-administracao') || (() => {
    const s = document.createElement('section'); s.id = 'route-administracao'; s.className='route'; document.getElementById('main').appendChild(s); return s;
  })();
  route.innerHTML = '';
  route.appendChild(form);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      email: document.getElementById('adm-email').value.trim(),
      password: document.getElementById('adm-pass').value,
      name: document.getElementById('adm-name').value.trim(),
      role: document.getElementById('adm-role').value
    };
    const r = await fetch('/.netlify/functions/admin-create-user', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    const j = await r.json();
    document.getElementById('adm-msg').textContent = j.error ? j.error : 'Usuário criado.';
    if (!j.error) await reloadProfiles();
  };
}

async function reloadProfiles(){
  const { data, error } = await supabase.from('profiles').select('email,name,role,created_at').order('created_at', { ascending:false });
  if (error) { console.error(error); return; }
  let table = document.getElementById('adm-table');
  if (!table){
    const panel = document.createElement('div'); panel.className='panel';
    panel.innerHTML = `<div class="panel-header"><h2>Usuários</h2></div><div class="panel-body"><div class="table-wrap"><table><thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th>Criado em</th></tr></thead><tbody id="adm-table"></tbody></table></div></div>`;
    document.getElementById('route-administracao').appendChild(panel);
    table = panel.querySelector('#adm-table');
  }else{
    table.innerHTML = '';
  }
  (data||[]).forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.email}</td><td>${u.name}</td><td>${u.role}</td><td>${new Date(u.created_at).toLocaleString('pt-BR')}</td>`;
    table.appendChild(tr);
  });
}
