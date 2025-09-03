// Análise Documental: carrega checklist aprovada por tipo, permite preencher e exportar PDF
const el = (id) => document.getElementById(id);

export async function renderAnalise(){
  el('ad-msg').textContent = '';
  el('ad-checklist').innerHTML = '';
  el('ad-checklist').classList.add('hidden');
  el('ad-actions').classList.add('hidden');

  el('ad-carregar').onclick = async () => {
    const nup = el('ad-nup').value.trim();
    const tipo = el('ad-tipo').value;
    if (!nup){ alert('Informe o NUP.'); return; }

    // Busca processo
    const { data: proc } = await supabase.from('processes').select('id,nup,type').eq('nup', nup).single();
    if (!proc){ alert('NUP não encontrado. Cadastre o processo antes.'); return; }

    // Template aprovado por tipo
    const { data: tpl } = await supabase.from('checklist_templates').select('id,name').eq('type', tipo).eq('active', true).single();
    if (!tpl){ alert('Nenhuma checklist aprovada para este tipo.'); return; }

    const { data: items } = await supabase.from('checklist_template_items').select('*').eq('template_id', tpl.id).order('ord');

    const cont = el('ad-checklist'); cont.innerHTML = '';
    (items||[]).forEach(it => {
      const row = document.createElement('div'); row.className='row';
      row.innerHTML = `
        <label style="flex:1">${it.label}
          <select data-id="${it.id}" class="ans">
            <option value="SIM">SIM</option>
            <option value="NAO">NÃO</option>
            <option value="NA">N/A</option>
          </select>
        </label>
        <label style="flex:1">Observação
          <input type="text" data-id="${it.id}" class="obs" placeholder="">
        </label>`;
      cont.appendChild(row);
    });
    cont.classList.remove('hidden');
    el('ad-actions').classList.remove('hidden');

    el('ad-finalizar').onclick = async () => {
      const ans = [];
      cont.querySelectorAll('.ans').forEach(a => ans.push({ item_id: +a.dataset.id, resp: a.value }));
      cont.querySelectorAll('.obs').forEach(o => { const x = ans.find(z => z.item_id === +o.dataset.id); if (x) x.obs = o.value; });
      const payload = {
        process_id: proc.id, template_id: tpl.id, filled_at: new Date().toISOString(), answers: ans
      };
      const { data, error } = await supabase.from('checklists_filled').insert(payload).select().single();
      if (error){ alert(error.message); return; }

      // Gera PDF simples
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFont('courier','normal');
      doc.text(`Análise Documental - ${tipo}`, 14, 14);
      doc.text(`NUP: ${proc.nup}`, 14, 22);
      doc.text(`Data/Hora: ${new Date().toLocaleString('pt-BR')}`, 14, 30);
      let y = 40;
      (items||[]).forEach(it => {
        const r = ans.find(a => a.item_id === it.id);
        const line = `${it.ord}. ${it.label}  [${r?.resp||''}]  ${r?.obs||''}`;
        doc.text(line.substring(0, 95), 14, y); y += 7; if (y > 280){ doc.addPage(); y = 20; }
      });
      doc.save(`analise_${proc.nup}.pdf`);

      alert('Análise finalizada. A lista de processos passa a indicar checklist disponível.');
      el('ad-actions').classList.add('hidden');
    };

    el('ad-cancelar').onclick = () => {
      el('ad-checklist').classList.add('hidden');
      el('ad-actions').classList.add('hidden');
    };
  };
}
