window.Modules = window.Modules || {};
window.Modules.analise = (() => {
  let currentTemplate = null;

  async function loadTemplatesFor(tipo) {
    // Convenção: category = tipo de processo (PDIR/Inscrição/Alteração/Exploração/OPEA)
    const { data, error } = await sb.from('checklist_templates')
      .select('id,name,category,items')
      .eq('category', tipo)
      .not('approved_by', 'is', null)
      .order('name');
    if (error) return [];
    return data || [];
  }

  function renderChecklist(template) {
    currentTemplate = template || null;
    const box = el('ckContainer');
    box.innerHTML = '';
    if (!template) { box.innerHTML = '<div class="msg">Nenhuma checklist aprovada encontrada para este tipo.</div>'; return; }

    // items: [{code,text,options?}, ...]
    const frag = document.createDocumentFragment();
    (template.items || []).forEach(item => {
      const wrap = document.createElement('div');
      wrap.style.margin = '6px 0';
      const label = document.createElement('label');
      label.innerHTML = `${item.code ? `<strong>${item.code}</strong> — ` : ''}${item.text || ''}`;
      if (Array.isArray(item.options) && item.options.length) {
        const sel = document.createElement('select');
        sel.name = item.code || item.text;
        item.options.forEach(op => {
          const o = document.createElement('option'); o.value = op; o.textContent = op; sel.appendChild(o);
        });
        wrap.appendChild(label);
        wrap.appendChild(sel);
      } else {
        // Padrão: select simples [Conforme|Não conforme|N/A] + observação opcional
        wrap.appendChild(label);
        const sel = document.createElement('select');
        sel.name = (item.code || item.text) + '::val';
        ['Conforme','Não conforme','N/A'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
        const obs = document.createElement('input'); obs.placeholder = 'Observação (opcional)'; obs.name = (item.code || item.text) + '::obs';
        wrap.appendChild(sel); wrap.appendChild(obs);
      }
      frag.appendChild(wrap);
    });
    box.appendChild(frag);
  }

  async function refreshTemplate() {
    const tipo = el('adTipo').value;
    const list = await loadTemplatesFor(tipo);
    // Critério simples: usa a primeira (ou única)
    renderChecklist(list[0]);
  }

  async function finalizarExportar() {
    const nup = el('adNUP').value.trim();
    const tipo = el('adTipo').value;
    if (!nup) return Utils.setMsg('adMsg', 'Informe um NUP.', true);
    if (!currentTemplate) return Utils.setMsg('adMsg', 'Nenhuma checklist aprovada para este tipo.', true);

    // resolve processo
    const pid = await (async () => {
      const { data } = await sb.from('processes').select('id').eq('nup', nup).maybeSingle();
      return data?.id || null;
    })();
    if (!pid) return Utils.setMsg('adMsg', 'Processo não encontrado para o NUP informado.', true);

    // Coleta respostas
    const answers = [];
    $$('#ckContainer select').forEach(sel => {
      if (sel.name.endsWith('::val')) {
        const base = sel.name.replace('::val','');
        const obs = $(`#ckContainer input[name="${base}::obs"]`)?.value || null;
        answers.push({ code: base, value: sel.value, obs });
      } else {
        answers.push({ code: sel.name, value: sel.value });
      }
    });

    const u = await getUser();
    Utils.setMsg('adMsg', 'Gravando e gerando PDF...');
    const { data, error } = await sb.from('checklist_responses').insert({
      process_id: pid,
      template_id: currentTemplate.id,
      answers,
      filled_by: u.id
    }).select('id,filled_at').single();
    if (error) return Utils.setMsg('adMsg', error.message, true);

    // Gera PDF (jsPDF já está carregado)
    generatePDF(nup, tipo, currentTemplate, answers, data.filled_at);
    Utils.setMsg('adMsg', 'Checklist concluída. PDF gerado para download.');
    await loadIndicador();
  }

  function generatePDF(nup, tipo, template, answers, filledAt) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFont('helvetica','');
    doc.setFontSize(14);
    doc.text('Análise Documental', 14, 16);
    doc.setFontSize(10);
    doc.text(`NUP: ${nup}`, 14, 24);
    doc.text(`Tipo do Processo: ${tipo}`, 14, 30);
    doc.text(`Checklist: ${template.name}`, 14, 36);
    doc.text(`Data/hora conclusão: ${Utils.fmtDateTime(filledAt)}`, 14, 42);

    let y = 52;
    answers.forEach((a, idx) => {
      const line = `${idx+1}. ${a.code}: ${a.value}${a.obs ? ' — Obs: ' + a.obs : ''}`;
      doc.text(line, 14, y);
      y += 6;
      if (y > 280) { doc.addPage(); y = 16; }
    });

    const fname = `AD_${nup.replace(/[^\d]/g,'')}_${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(fname);
  }

  async function loadIndicador() {
    const { data } = await sb.from('checklist_responses')
      .select('filled_at,process_id,processes(nup),template_id,checklist_templates(name)')
      .order('filled_at',{ ascending:false }).limit(50);
    const rows = (data||[]).map(r => ({
      nup: r.processes?.nup || '',
      checklist: r.checklist_templates?.name || '',
      filled_at: Utils.fmtDateTime(r.filled_at)
    }));
    Utils.renderTable('listaAD', [
      { key: 'nup', label: 'NUP' },
      { key: 'checklist', label: 'Checklist' },
      { key: 'filled_at', label: 'Concluída em' }
    ], rows);
  }

  function bind() {
    el('adTipo').addEventListener('change', refreshTemplate);
    el('btnFinalizarAD').addEventListener('click', (ev) => { ev.preventDefault(); finalizarExportar(); });
  }

  function init() { bind(); }
  async function load() { await refreshTemplate(); await loadIndicador(); }

  // Dashboard rings / speed (módulo rápido aqui)
  window.Modules.dashboard = {
    init(){ 
      el('btnDashFilter').addEventListener('click', this.load.bind(this));
    },
    async load(){
      // Filtro por intervalo na 1ª entrada
      const from = el('dashFrom').value || null;
      const to = el('dashTo').value || null;
      let q = sb.from('processes').select('status,first_entry_date');
      if (from) q = q.gte('first_entry_date', from);
      if (to) q = q.lte('first_entry_date', to);
      const { data } = await q;
      // Rings: contagem por status
      const counts = {};
      (data||[]).forEach(p => { counts[p.status] = (counts[p.status]||0)+1; });
      const items = Object.keys(counts).map(k => ({ label: k, count: counts[k] }));
      Utils.renderRings('rings', items);

      // Velocidade média "dias/processo" = média de (hoje - first_entry_date) por status
      const agg = {};
      (data||[]).forEach(p => {
        const d = Utils.daysBetween(p.first_entry_date);
        agg[p.status] = agg[p.status] || { sum:0, n:0 };
        agg[p.status].sum += d; agg[p.status].n += 1;
      });
      const rows = Object.keys(agg).map(s => ({
        status: s, avg: (agg[s].sum / agg[s].n).toFixed(1)
      }));
      Utils.renderTable('speedTable', [
        { key: 'status', label: 'Status' },
        { key: 'avg', label: 'Dias/processo' }
      ], rows);
    }
  };

  return { init, load };
})();
