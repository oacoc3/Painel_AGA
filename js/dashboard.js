import { fmtDate, daysBetween } from './ui.js';

export async function renderDashboard(){
  // Filtro por data de 1ª entrada
  const from = document.getElementById('dash-from').value || null;
  const to = document.getElementById('dash-to').value || null;

  // View consolidada para métricas (criada nos SQL helpers)
  const { data, error } = await supabase.rpc('vw_status_metrics', { p_from: from, p_to: to });
  if (error){ console.error(error); }

  const rings = document.getElementById('rings');
  rings.innerHTML = '';
  const body = document.getElementById('dash-table');
  body.innerHTML = '';

  (data || []).forEach(row => {
    // Ring por status
    const d = document.createElement('div');
    d.className = 'ring';
    d.innerHTML = `<div class="big">${row.count}</div><div class="label">${row.status}</div>`;
    rings.appendChild(d);

    // Linha na tabela
    const tr = document.createElement('tr');
    const vel = row.avg_days === null ? '-' : row.avg_days.toFixed(1);
    tr.innerHTML = `<td>${row.status}</td><td>${row.count}</td><td>${vel}</td>`;
    body.appendChild(tr);
  });

  document.getElementById('dash-apply').onclick = renderDashboard;
}
