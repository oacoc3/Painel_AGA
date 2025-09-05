// public/modules/analise_documental.js
window.Modules = window.Modules || {};
window.Modules.analise = (() => {
  let currentTemplate = null;

  async function loadTemplatesFor(tipo) {
    // Convenção: category = tipo de processo (PDIR/Inscrição/Alteração/Exploração/OPEA)
    const { data, error } = await sb
      .from('checklist_templates')
      .select('id,name,category,version,items')
      .eq('category', tipo)
      .not('approved_by', 'is', null)
      .order('name')
      .order('version', { ascending: false });
    if (error) return [];
    const uniq = [];
    const seen = new Set();
    (data || []).forEach(t => {
      if (!seen.has(t.name)) { seen.add(t.name); uniq.push(t); }
    });
    return uniq;
  }

  function renderChecklist(template) {
    currentTemplate = template || null;
    const box = el('ckContainer');
    box.innerHTML = '';
    if (!template) {
      box.innerHTML = '<div class="msg">Nenhuma checklist aprovada encontrada para este tipo.</div>';
      return;
    }

    // items: [{categoria, itens:[{code,requisito,texto_sugerido}]}]
    const frag = document.createDocumentFragment();
    (template.items || []).forEach(cat => {
      const catDiv = document.createElement('div');
      const h = document.createElement('h3');
      h.textContent = cat.categoria || '';
      catDiv.appendChild(h);

      (cat.itens || []).forEach(item => {
        const wrap = document.createElement('div');
        wrap.style.margin = '6px 0';

        const label = document.createElement('label');
        label.innerHTML = `${item.code ? `<strong>${item.code}</strong> — ` : ''}${item.requisito || ''}`;
        wrap.appendChild(label);

        const sel = document.createElement('select');
        sel.name = item.code;
        ['Conforme', 'Não conforme', 'N/A'].forEach(v => {
          const o = document.createElement('option');
          o.value = v;
          o.textContent = v;
          sel.appendChild(o);
        });

        const obs = document.createElement('input');
        obs.placeholder = 'Observação (opcional)';
        obs.name = item.code + '::obs';

        const hint = document.createElement('div');
        hint.className = 'hint';
        hint.textContent = item.texto_sugerido || '';
        hint.style.display = 'none';

        sel.addEventListener('change', () => {
          hint.style.display = sel.value === 'Não conforme' && item.texto_sugerido ? 'block' : 'none';
        });

        wrap.appendChild(sel);
        wrap.appendChild(obs);
        wrap.appendChild(hint);
        catDiv.appendChild(wrap);
      });

      frag.appendChild(catDiv);
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
      const code = sel.name;
      const obs = $(`#ckContainer input[name="${code}::obs"]`)?.value || null;
      answers.push({ code, value: sel.value, obs });
    });

    const u = await getUser();
    Utils.setMsg('adMsg', 'Gravando e gerando PDF...');
    const { data, error } = await sb
      .from('checklist_responses')
      .insert({
        process_id: pid,
        template_id: currentTemplate.id,
        answers,
        filled_by: u.id
      })
      .select('id,filled_at')
      .single();
    if (error) return Utils.setMsg('adMsg', error.message, true);

    // Gera PDF (jsPDF já está carregado)
    generatePDF(nup, tipo, currentTemplate, answers, data.filled_at);
    Utils.setMsg('adMsg', 'Checklist concluída. PDF gerado para download.');
    await loadIndicador();
  }

  function generatePDF(nup, tipo, template, answers, filledAt) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFont('helvetica', '');
    doc.setFontSize(14);
    doc.text('Análise Documental', 14, 16);
    doc.setFontSize(10);
    doc.text(`NUP: ${nup}`, 14, 24);
    doc.text(`Tipo do Processo: ${tipo}`, 14, 30);
    doc.text(`Checklist: ${template.name}`, 14, 36);
    doc.text(`Data/hora conclusão: ${Utils.fmtDateTime(filledAt)}`, 14, 42);

    let y = 52;
    answers.forEach((a, idx) => {
      const line = `${idx + 1}. ${a.code}: ${a.value}${a.obs ? ' — Obs: ' + a.obs : ''}`;
      doc.text(line, 14, y);
      y += 6;
      if (y > 280) {
        doc.addPage();
        y = 16;
      }
    });

    const fname = `AD_${nup.replace(/[^\d]/g, '')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fname);
  }

  async function loadIndicador() {
    const { data } = await sb
      .from('checklist_responses')
      .select('filled_at,process_id,processes(nup),template_id,checklist_templates(name)')
      .order('filled_at', { ascending: false })
      .limit(50);
    const rows = (data || []).map(r => ({
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
    el('btnFinalizarAD').addEventListener('click', ev => { ev.preventDefault(); finalizarExportar(); });
  }

  function init() { bind(); }
  async function load() { await refreshTemplate(); await loadIndicador(); }

  // Dashboard velocímetros / velocidade (módulo rápido aqui)
  const DASHBOARD_STATUSES = ['CONFEC','REV-OACO','APROV','ICA-PUB','EDICAO','AGD-LEIT','ANADOC','ANATEC-PRE','ANATEC','ANAICA','SOB-DOC','SOB-TEC','SOB-PDIR','SOB-EXPL','ARQ'];

  window.Modules.dashboard = {
    init() {
      el('btnDashFilter').addEventListener('click', this.load.bind(this));
    },
    async load() {
      // Filtro por intervalo na 1ª entrada
      const from = el('dashFrom').value || null;
      const to = el('dashTo').value || null;
      let q = sb.from('processes').select('id,status,first_entry_date');
      if (from) q = q.gte('first_entry_date', from);
      if (to) q = q.lte('first_entry_date', to);
      const { data: procs } = await q;

      // Velocímetros: contagem por status (sempre mostra todos)
      const countMap = {};
      DASHBOARD_STATUSES.forEach(s => { countMap[s] = 0; });
      (procs || []).forEach(p => { countMap[p.status] = (countMap[p.status] || 0) + 1; });
      const items = DASHBOARD_STATUSES.map(s => ({ label: s, count: countMap[s] }));
      Utils.renderVelocimetros('velocimetros', items);

      // Velocidade média considerando todas as passagens por status
      const ids = (procs || []).map(p => p.id);
      let logs = [];
      if (ids.length) {
        const { data: logData } = await sb.from('audit_log')
          .select('entity_id,occurred_at,details')
          .eq('entity_type','processes')
          .in('entity_id', ids)
          .order('occurred_at');
        logs = logData || [];
      }
      const byProc = {};
      logs.forEach(l => {
        const det = l.details || {};
        if (!det.status || !det.status_since) return;
        const pid = l.entity_id;
        byProc[pid] = byProc[pid] || [];
        byProc[pid].push({ status: det.status, start: det.status_since });
      });

      const agg = {};
      const now = new Date();
      Object.values(byProc).forEach(list => {
        list.sort((a,b) => new Date(a.start) - new Date(b.start));
        for (let i = 0; i < list.length; i++) {
          const cur = list[i];
          const next = list[i+1];
          if (i > 0 && cur.start === list[i-1].start && cur.status === list[i-1].status) continue;
          const end = next ? new Date(next.start) : now;
          const days = Utils.daysBetween(cur.start, end);
          agg[cur.status] = agg[cur.status] || { sum: 0, n: 0 };
          agg[cur.status].sum += days;
          agg[cur.status].n += 1;
        }
      });

      const rows = Object.keys(agg).map(s => ({
        status: s,
        avg: (agg[s].sum / agg[s].n).toFixed(1)
      }));
      Utils.renderTable('speedTable', [
        { key: 'status', label: 'Status' },
        { key: 'avg', label: 'Dias/processo' }
      ], rows);
    }
  };

  return { init, load };
})();
