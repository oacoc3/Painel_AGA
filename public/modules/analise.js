// public/modules/analise.js
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
    const items = $$('#ckContainer .ck-item[data-code]');
    let ok = items.length > 0;
    items.forEach(wrap => {
      const val = wrap.dataset.value;
      if (!val) { ok = false; return; }
      if (val !== 'Não aplicável') {
        const obs = wrap.querySelector('textarea');
        if (!obs || !obs.value.trim()) ok = false;
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

    const title = document.createElement('h3');
    title.className = 'ck-template-title';
    title.textContent = template.name || 'Checklist';
    frag.appendChild(title);

    (template.items || []).forEach(cat => {
      const catSection = document.createElement('section');
      catSection.className = 'ck-category';

      if (cat.categoria) {
        const h = document.createElement('h4');
        h.textContent = cat.categoria || '';
        catSection.appendChild(h);
      }

      (cat.itens || []).forEach(item => {
        const wrap = document.createElement('div');
        wrap.className = 'ck-item';
        wrap.dataset.code = item.code || '';

        const header = document.createElement('div');
        header.className = 'ck-item-header';
        header.innerHTML = `${item.code ? `<strong>${item.code}</strong> — ` : ''}${item.requisito || ''}`;
        wrap.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'ck-item-grid';

        const optionsCol = document.createElement('div');
        optionsCol.className = 'ck-item-options';
        const optionsList = document.createElement('div');
        optionsList.className = 'ck-options';

        ['Conforme', 'Não conforme', 'Não aplicável'].forEach(v => {
          const optLabel = document.createElement('label');
          optLabel.className = 'ck-option';

          const input = document.createElement('input');
          input.type = 'checkbox';
          input.value = v;
          input.addEventListener('change', () => {
            if (input.checked) {
              optionsList.querySelectorAll('input[type="checkbox"]').forEach(other => {
                if (other !== input) other.checked = false;
              });
              wrap.dataset.value = v;
            } else {
              const selected = Array.from(optionsList.querySelectorAll('input[type="checkbox"]')).find(ch => ch.checked);
              wrap.dataset.value = selected ? selected.value : '';
            }
            wrap.classList.toggle('ck-has-nc', wrap.dataset.value === 'Não conforme');
            updateSaveState();
          });

          const labelText = document.createElement('span');
          labelText.textContent = v;

          optLabel.appendChild(input);
          optLabel.appendChild(labelText);
          optionsList.appendChild(optLabel);
        });

        optionsCol.appendChild(optionsList);
        grid.appendChild(optionsCol);

        // ====== BLOCO AJUSTADO PELO PATCH ======
        const detailsCol = document.createElement('div');
        detailsCol.className = 'ck-item-details';

        const obsBox = document.createElement('label');
        obsBox.className = 'ck-detail-card ck-observacao';
        const obsTitle = document.createElement('span');
        obsTitle.className = 'ck-detail-card-title';
        obsTitle.textContent = 'Observações';
        const obs = document.createElement('textarea');
        obs.rows = 3;
        obs.placeholder = 'Observações';
        obs.addEventListener('input', updateSaveState);
        obsBox.appendChild(obsTitle);
        obsBox.appendChild(obs);

        const suggestionsBox = document.createElement('div');
        suggestionsBox.className = 'ck-detail-card ck-sugestoes';
        const sugTitle = document.createElement('span');
        sugTitle.className = 'ck-detail-card-title';
        sugTitle.textContent = 'Texto(s) sugerido';
        suggestionsBox.appendChild(sugTitle);

        const sugList = document.createElement('div');
        sugList.className = 'ck-sugestoes-list';

        const suggestions = Array.isArray(item.textos_sugeridos)
          ? item.textos_sugeridos
          : (item.texto_sugerido ? [item.texto_sugerido] : []);
        if (suggestions.length) {
          suggestions.forEach(texto => {
            if (!texto) return;
            const sugItem = document.createElement('div');
            sugItem.className = 'ck-sugestao-item';

            const sugText = document.createElement('span');
            sugText.textContent = texto;

            const useBtn = document.createElement('button');
            useBtn.type = 'button';
            useBtn.textContent = 'Usar';
            useBtn.addEventListener('click', () => {
              obs.value = texto;
              obs.dispatchEvent(new Event('input', { bubbles: true }));
            });

            sugItem.appendChild(sugText);
            sugItem.appendChild(useBtn);
            sugList.appendChild(sugItem);
          });
        } else {
          const emptyMsg = document.createElement('p');
          emptyMsg.className = 'muted';
          emptyMsg.textContent = 'Nenhum texto sugerido cadastrado.';
          sugList.appendChild(emptyMsg);
        }

        suggestionsBox.appendChild(sugList);

        detailsCol.appendChild(obsBox);
        detailsCol.appendChild(suggestionsBox);

        grid.appendChild(detailsCol);
        // ====== FIM DO BLOCO AJUSTADO ======

        wrap.appendChild(grid);
        catSection.appendChild(wrap);
      });

      frag.appendChild(catSection);
    });

    const other = document.createElement('label');
    other.className = 'ck-outros';
    const otherTitle = document.createElement('span');
    otherTitle.textContent = 'Outras observações do analista';
    const otherInput = document.createElement('textarea');
    otherInput.id = 'adOutrasObs';
    otherInput.rows = 3;
    other.appendChild(otherTitle);
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
    $$('#ckContainer .ck-item[data-code]').forEach(wrap => {
      const code = wrap.dataset.code;
      const value = wrap.dataset.value;
      const obsField = wrap.querySelector('textarea');
      const obs = obsField ? obsField.value.trim() : '';
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
    if (btnLimparChecklist) {
      btnLimparChecklist.addEventListener('click', ev => {
        ev.preventDefault();
        if (!currentTemplate) return;
        if (window.confirm('Deseja limpar a checklist atual?')) clearChecklist();
      });
    }
    if (btnSalvarChecklist) {
      btnSalvarChecklist.addEventListener('click', ev => {
        ev.preventDefault();
        if (!currentTemplate) return;
        if (window.confirm('Deseja salvar esta checklist?')) salvarChecklist();
      });
    }
  }

  function init() { bind(); }
  async function load() { clearChecklist(); await loadIndicador(); }

  return { init, load };
})();
