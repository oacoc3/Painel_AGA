import { showRoute, fillSelect, STATUS, fmtDate, fmtDateTime } from './ui.js';

let currentProcId = null;

export async function renderProcessos(){
  // Preenche combobox de status
  fillSelect(document.getElementById('proc-status'), STATUS.map(s => ({ value:s })));

  // Observa alterações para habilitar "Salvar"
  const form = document.getElementById('form-processo');
  const btnSalvar = document.getElementById('btn-proc-salvar');
  form.addEventListener('input', () => { btnSalvar.disabled = false; });

  // Ações
  document.getElementById('btn-proc-novo').onclick = () => resetProcForm();
  document.getElementById('form-processo').onsubmit = onSaveProcess;

  // sub-módulos
  document.getElementById('btn-par-solicitar').onclick = onParSolicitar;
  document.getElementById('btn-par-receber').onclick = onParReceber;

  document.getElementById('btn-not-solicitar').onclick = onNotSolicitar;
  document.getElementById('btn-not-ler').onclick = onNotLer;

  document.getElementById('btn-sig-solicitar').onclick = onSigSolicitar;
  document.getElementById('btn-sig-expedir').onclick = onSigExpedir;
  document.getElementById('btn-sig-receber').onclick = onSigReceber;

  // Carrega lista
  await reloadProcessList();
  showRoute('route-processos');
}

function resetProcForm(){
  currentProcId = null;
  document.getElementById('form-processo').reset();
  document.getElementById('btn-proc-salvar').disabled = true;
}

async function onSaveProcess(e){
  e.preventDefault();
  const msg = document.getElementById('proc-msg');
  msg.textContent = '';

  const payload = {
    nup: document.getElementById('proc-nup').value.trim(),
    type: document.getElementById('proc-tipo').value,
    obra_concluida: document.getElementById('proc-obra-concluida').value === 'true',
    obra_termino_date: document.getElementById('proc-obra-termino').value || null,
    primeira_entrada: document.getElementById('proc-entrada').value,
    status: document.getElementById('proc-status').value
  };

  let res;
  if (currentProcId){
    res = await supabase.from('processes').update(payload).eq('id', currentProcId).select().single();
  } else {
    res = await supabase.from('processes').insert(payload).select().single();
  }
  if (res.error){ msg.textContent = res.error.message; return; }
  currentProcId = res.data.id;
  msg.textContent = 'Salvo.';
  document.getElementById('btn-proc-salvar').disabled = true;
  await reloadProcessList();
}

async function reloadProcessList(){
  // View de lista agrega os indicadores exigidos
  const { data, error } = await supabase.from('vw_process_list').select('*').order('primeira_entrada', { ascending:false });
  if (error){ console.error(error); return; }
  const tbody = document.getElementById('proc-list');
  tbody.innerHTML = '';
  (data || []).forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><a href="#" data-id="${p.id}" class="pick">${p.nup}</a></td>
      <td>${p.type}</td>
      <td>${p.status}</td>
      <td>${fmtDate(p.primeira_entrada)}</td>
      <td>${p.dias_desde_entrada}</td>
      <td>${p.tem_parecer_solic ? 'Sim':'Não'}</td>
      <td>${p.tem_notif_solic ? 'Sim':'Não'}</td>
      <td>${p.tem_sig_exped ? 'Sim':'Não'}</td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('a.pick').forEach(a => a.onclick = (e) => { e.preventDefault(); pickProcess(a.getAttribute('data-id')); });
}

async function pickProcess(id){
  currentProcId = id;
  const { data: p } = await supabase.from('processes').select('*').eq('id', id).single();
  document.getElementById('proc-id').value = p.id;
  document.getElementById('proc-nup').value = p.nup;
  document.getElementById('proc-tipo').value = p.type;
  document.getElementById('proc-obra-concluida').value = String(p.obra_concluida);
  document.getElementById('proc-obra-termino').value = p.obra_termino_date || '';
  document.getElementById('proc-entrada').value = p.primeira_entrada;
  document.getElementById('proc-status').value = p.status;
  document.getElementById('btn-proc-salvar').disabled = true;

  await reloadHistory(id);
}

async function reloadHistory(process_id){
  const { data, error } = await supabase.from('audit_log').select('created_at, user_email, action').eq('entity_id', process_id).order('created_at', { ascending:false });
  const tbody = document.getElementById('hist-list'); tbody.innerHTML = '';
  (data || []).forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${fmtDateTime(h.created_at)}</td><td>${h.user_email||'-'}</td><td>${h.action}</td>`;
    tbody.appendChild(tr);
  });
}

/* === Pareceres internos === */
async function onParSolicitar(){
  if (!currentProcId) return alert('Selecione/salve um processo primeiro.');
  const tipo = document.getElementById('par-tipo').value;
  const solicitado = document.getElementById('par-solicitado').value || new Date().toISOString();
  const { error } = await supabase.from('internal_opinions').insert({ process_id: currentProcId, type: tipo, requested_at: solicitado });
  if (error) alert(error.message); else { alert('Parecer cadastrado.'); await reloadProcessList(); }
}
async function onParReceber(){
  if (!currentProcId) return alert('Selecione/salve um processo primeiro.');
  const tipo = document.getElementById('par-tipo').value;
  const { data, error } = await supabase.from('internal_opinions').update({ received_at: new Date().toISOString() })
    .eq('process_id', currentProcId).eq('type', tipo).is('received_at', null).select();
  if (error || !data?.length) alert(error?.message || 'Nenhum SOLICITADO encontrado.');
  else { alert('Marcado como RECEBIDO.'); await reloadProcessList(); }
}

/* === Notificações === */
async function onNotSolicitar(){
  if (!currentProcId) return alert('Selecione/salve um processo primeiro.');
  const tipo = document.getElementById('not-tipo').value;
  const solicitada = document.getElementById('not-solicitada').value || new Date().toISOString();
  const { error } = await supabase.from('notifications').insert({ process_id: currentProcId, type: tipo, requested_at: solicitada });
  if (error) alert(error.message); else { alert('Notificação cadastrada.'); await reloadProcessList(); }
}
async function onNotLer(){
  if (!currentProcId) return alert('Selecione/salve um processo primeiro.');
  const tipo = document.getElementById('not-tipo').value;
  const { data, error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('process_id', currentProcId).eq('type', tipo).is('read_at', null).select();
  if (error || !data?.length) alert(error?.message || 'Nenhuma SOLICITADA encontrada.');
  else { alert('Marcada como LIDA.'); await reloadProcessList(); }
}

/* === SIGADAER === */
function parseNumeros(text){
  if (!text) return [];
  return text.split(',').map(s => s.trim()).filter(Boolean);
}
async function onSigSolicitar(){
  if (!currentProcId) return alert('Selecione/salve um processo primeiro.');
  const payload = {
    process_id: currentProcId,
    type: document.getElementById('sig-tipo').value,
    requested_at: document.getElementById('sig-solicitado').value || new Date().toISOString(),
    numbers: parseNumeros(document.getElementById('sig-numeros').value),
    obs: document.getElementById('sig-obs').value || null
  };
  const { error } = await supabase.from('sigadaer').insert(payload);
  if (error) alert(error.message); else { alert('SIGADAER cadastrado.'); await reloadProcessList(); }
}
async function onSigExpedir(){
  if (!currentProcId) return alert('Selecione/salve um processo primeiro.');
  const tipo = document.getElementById('sig-tipo').value;
  const { data, error } = await supabase.from('sigadaer').update({ expedition_at: new Date().toISOString() })
    .eq('process_id', currentProcId).eq('type', tipo).is('expedition_at', null).select();
  if (error || !data?.length) alert(error?.message || 'Nenhum SOLICITADO encontrado.');
  else { alert('Marcado como EXPEDIDO.'); await reloadProcessList(); }
}
async function onSigReceber(){
  if (!currentProcId) return alert('Selecione/salve um processo primeiro.');
  const tipo = document.getElementById('sig-tipo').value;
  const { data, error } = await supabase.from('sigadaer').update({ received_at: new Date().toISOString() })
    .eq('process_id', currentProcId).eq('type', tipo).not('expedition_at','is', null).is('received_at', null).select();
  if (error || !data?.length) alert(error?.message || 'Nenhum EXPEDIDO encontrado, ou já RECEBIDO.');
  else { alert('Marcado como RECEBIDO.'); await reloadProcessList(); }
}
