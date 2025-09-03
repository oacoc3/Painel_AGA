export async function renderPrazos(){
  const pl = (id) => document.getElementById(id);
  // As listas provêm de views (SQL helpers)
  const [atm, dt, cgna, ext, obra, mon, doaga] = await Promise.all([
    supabase.from('vw_prazo_parecer_atm').select('*'),
    supabase.from('vw_prazo_parecer_dt').select('*'),
    supabase.from('vw_prazo_parecer_cgna').select('*'),
    supabase.from('vw_prazo_sigadaer_externos').select('*'),
    supabase.from('vw_prazo_termino_obra').select('*'),
    supabase.from('vw_monitorar_tramitacao').select('*'),
    supabase.from('vw_prazo_do_aga').select('*')
  ]);

  function fill(tbody, rows, render){
    const el = pl(tbody); el.innerHTML = '';
    (rows.data || []).forEach(r => {
      const tr = document.createElement('tr'); tr.innerHTML = render(r); el.appendChild(tr);
    });
  }

  fill('pl-atm', atm, r => `<td>${r.nup}</td><td>${r.prazo}</td><td>${r.restam_dias}</td>`);
  fill('pl-dt', dt, r => `<td>${r.nup}</td><td>${r.prazo}</td><td>${r.restam_dias}</td>`);
  fill('pl-cgna', cgna, r => `<td>${r.nup}</td><td>${r.prazo}</td><td>${r.restam_dias}</td>`);
  fill('pl-externos', ext, r => `<td>${r.nup}</td><td>${r.prazo}</td><td>${r.restam_dias}</td>`);
  fill('pl-obra', obra, r => `<td>${r.nup}</td><td>${r.prazo}</td><td>${r.restam}</td><td>${r.obs||''}</td>`);
  fill('pl-monitor', mon, r => `<td>${r.nup}</td><td>${r.type}</td><td>${r.status}</td>`);
  fill('pl-doaga', doaga, r => `<td>${r.nup}</td><td>${r.status_atual}</td><td>${r.prazo_ou_status}</td><td>${r.restam_dias ?? '-'}</td>`);
}
