// public/modules/analise_documental.js
window.Modules = window.Modules || {};
window.Modules.analise = (() => {
  let currentTemplate = null;
  let currentProcessId = null;

  async function loadTemplatesFor(tipo) {
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

  function updateSaveState() {
    const items = $$('#ckContainer [data-code]');
    let ok = items.length > 0;
    items.forEach(wrap => {
      const val = wrap.dataset.value;
      if (!val) { ok = false; return; }
      if (val !== 'Não aplicável') {
        const obs = wrap.querySelector('input').value.trim();
        if (!obs) ok = false;
      }
    });
    const btnSalvar = el('adBtnSalvarChecklist');
    const btnLimpar = el('btnLimparChecklist');
    if (btnSalvar) btnSalvar.disabled = !ok;
    if (btnLimpar) btnLimpar.disabled = !currentTemplate;
  }

  function clearChecklist() {
    if (currentTemplate) {
      renderChecklist(currentTemplate);
    } else {
      el('ckContainer').innerHTML = '';
    }
    updateSaveState();
  }

  function renderChecklist(template) {
    currentTemplate = template || null;
    const box = el('ckContainer');
    box.innerHTML = '';
    if (!template) {
      box.innerHTML = '<div class="msg">Nenhuma checklist aprovada encontrada para este tipo.</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    (template.items || []).forEach(cat => {
      const catDiv = document.createElement('div');
      const h = document.createElement('h3');
      h.textContent = cat.categoria || '';
      catDiv.appendChild(h);

      (cat.itens || []).forEach(item => {
        const wrap = document.createElement('div');
        wrap.style.margin = '6px 0';
        wrap.dataset.code = item.code;

        const label = document.createElement('label');
        label.innerHTML = `${item.code ? `<strong>${item.code}</strong> — ` : ''}${item.requisito || ''}`;
        wrap.appendChild(label);

        const btns = document.createElement('div');
        btns.className = 'ck-choice';
        ['Conforme', 'Não conforme', 'Não aplicável'].forEach(v => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = v;
          b.dataset.value = v;
          b.addEventListener('click', () => {
            btns.querySelectorAll('button').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            wrap.dataset.value = v;
            hint.style.display = (v === 'Não conforme' && item.texto_sugerido) ? 'block' : 'none';
            updateSaveState();
          });
          btns.appendChild(b);
        });
        wrap.appendChild(btns);

        const obs = document.createElement('input');
        obs.placeholder = 'Observação';
        obs.addEventListener('input', updateSaveState);
        wrap.appendChild(obs);

        const hint = document.createElement('div');
        hint.className = 'hint';
        hint.style.display = 'none';
        if (item.texto_sugerido) {
          const span = document.createElement('span');
          span.textContent = item.texto_sugerido;
          const use = document.createElement('button');
          use.type = 'button';
          use.textContent = 'Utilizar';
          use.addEventListener('click', () => { obs.value = item.texto_sugerido; updateSaveState(); });
          hint.appendChild(span);
          hint.appendChild(use);
        }
        wrap.appendChild(hint);

        catDiv.appendChild(wrap);
      });

      frag.appendChild(catDiv);
    });

    const other = document.createElement('label');
    other.textContent = 'Outras observações do analista';
    const otherInput = document.createElement('textarea');
    otherInput.id = 'adOutrasObs';
    other.appendChild(otherInput);
    frag.appendChild(other);

    box.appendChild(frag);
    updateSaveState();
  }

  async function iniciarChecklist() {
    const nup = el('adNUP').value.trim();
    const tipo = el('adTipo').value;
    if (!nup) return Utils.setMsg('adMsg', 'Informe um NUP.', true);

    const { data: proc } = await sb.from('processes').select('id,type').eq('nup', nup).maybeSingle();
    if (proc) {
      if (proc.type !== tipo) {
        alert('Já existe processo com este NUP e tipo diferente. Verifique as informações.');
        return;
      }
      currentProcessId = proc.id;
    } else {
       const u = await getUser();
      if (!u) return Utils.setMsg('adMsg', 'Sessão expirada.', true);
      const { data, error } = await sb.from('processes')
        .insert({ nup, type: tipo, created_by: u.id })
        .select('id')
        .single();
      if (error) return Utils.setMsg('adMsg', error.message, true);
      currentProcessId = data.id;
      if (window.Modules.processos?.reloadLists) {
        await window.Modules.processos.reloadLists();
      }
    }

    const list = await loadTemplatesFor(tipo);
    renderChecklist(list[0]);
    Utils.setMsg('adMsg', '');
  }

  async function salvarChecklist() {
    if (!currentProcessId || !currentTemplate) return;
    const answers = [];
    $$('#ckContainer [data-code]').forEach(wrap => {
      const code = wrap.dataset.code;
      const value = wrap.dataset.value;
      const obs = wrap.querySelector('input').value.trim();
      answers.push({ code, value, obs: obs || null });
    });
    const extra = el('adOutrasObs')?.value.trim() || null;
    const u = await getUser();
    Utils.setMsg('adMsg', 'Salvando checklist...');
    const { data, error } = await sb.from('checklist_responses')
      .insert({ process_id: currentProcessId, template_id: currentTemplate.id, answers, extra_obs: extra, filled_by: u.id })
      .select('id,filled_at')
      .single();
    if (error) return Utils.setMsg('adMsg', error.message, true);

    await sb.from('audit_log').insert({
      user_id: u.id,
      user_email: u.email,
      action: 'INSERT',
      entity_type: 'checklist_responses',
      entity_id: data.id,
      details: { process_id: currentProcessId, checklist_name: currentTemplate.name, filled_at: data.filled_at }
    });

    Utils.setMsg('adMsg', 'Checklist salva.');
    await loadIndicador();
    if (window.Modules.processos?.reloadLists) {
      await window.Modules.processos.reloadLists();
    }
    clearChecklist();
  }

  function clearForm() {
    el('adNUP').value = '';
    el('adTipo').value = 'PDIR';
    Utils.setMsg('adMsg', '');
    currentProcessId = null;
    currentTemplate = null;
    clearChecklist();
  }

  async function loadIndicador() {
    const { data } = await sb
      .from('checklist_responses')
      .select('id,filled_at,process_id,processes(nup),template_id,checklist_templates(name)')
      .order('filled_at', { ascending: false })
      .limit(50);
    const rows = (data || []).map(r => ({
      id: r.id,
      nup: r.processes?.nup || '',
      checklist: r.checklist_templates?.name || '',
      filled_at: Utils.fmtDateTime(r.filled_at)
    }));
    Utils.renderTable('listaAD', [
      { key: 'nup', label: 'NUP' },
      { key: 'checklist', label: 'Checklist' },
      { key: 'filled_at', label: 'Concluída em' },
      {
        label: 'PDF',
        align: 'center',
        width: '60px',
        render: r => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = 'PDF';
          b.addEventListener('click', () => abrirChecklistPDF(r.id));
          return b;
        }
      }
    ], rows);
  }

  async function abrirChecklistPDF(id) {
    // Abre imediatamente uma aba em branco para evitar bloqueio de pop-up
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const { data, error } = await sb
        .from('checklist_responses')
        .select('answers,extra_obs,filled_at,processes(nup),checklist_templates(name,items)')
        .eq('id', id)
        .single();
      if (error) throw error;

      const doc = new window.jspdf.jsPDF();
      let y = 10;
      doc.setFontSize(12);
      doc.text(`Checklist: ${data.checklist_templates?.name || ''}`, 10, y); y += 6;
      doc.text(`NUP: ${data.processes?.nup || ''}`, 10, y); y += 6;
      doc.text(`Preenchida em: ${Utils.fmtDateTime(data.filled_at)}`, 10, y); y += 10;

      const answers = data.answers || [];
      const cats = data.checklist_templates?.items || [];
      cats.forEach(cat => {
        if (y > 270) { doc.addPage(); y = 10; }
        doc.setFont(undefined, 'bold');
        doc.text(cat.categoria || '', 10, y); y += 6;
        (cat.itens || []).forEach(item => {
          const ans = answers.find(a => a.code === item.code) || {};
          if (y > 270) { doc.addPage(); y = 10; }
          doc.setFont(undefined, 'normal');
          doc.text(`${item.code || ''} - ${item.requisito || ''}`, 10, y); y += 6;
          doc.text(`Resultado: ${ans.value || ''}`, 10, y); y += 6;
          if (ans.obs) { doc.text(`Obs: ${ans.obs}`, 10, y); y += 6; }
          y += 4;
        });
      });

      if (data.extra_obs) {
        if (y > 270) { doc.addPage(); y = 10; }
        doc.setFont(undefined, 'bold');
        doc.text('Outras observações:', 10, y); y += 6;
        doc.setFont(undefined, 'normal');
        doc.text(String(data.extra_obs), 10, y); y += 6;
      }

      const url = doc.output('bloburl');
      if (win) win.location.href = url;
    } catch (err) {
      if (win) win.close();
      alert(err.message || String(err));
    }
  }

  function bind() {
    const btnIniciar = el('btnIniciarAD');
    const btnLimparAD = el('btnLimparAD');
    const btnLimparChecklist = el('btnLimparChecklist');
    const btnSalvarChecklist = el('adBtnSalvarChecklist');

    if (btnIniciar) btnIniciar.addEventListener('click', ev => { ev.preventDefault(); iniciarChecklist(); });
    if (btnLimparAD) btnLimparAD.addEventListener('click', ev => { ev.preventDefault(); clearForm(); });
    if (btnLimparChecklist) btnLimparChecklist.addEventListener('click', ev => { ev.preventDefault(); clearChecklist(); });
    if (btnSalvarChecklist) btnSalvarChecklist.addEventListener('click', ev => { ev.preventDefault(); salvarChecklist(); });
  }

  function init() { bind(); }
  async function load() { clearChecklist(); await loadIndicador(); }

  return { init, load };
})();
