// public/modules/analise.js
window.Modules = window.Modules || {};
window.Modules.analise = (() => {
  let currentTemplate = null;
  let currentProcessId = null;
  let currentDraftId = null;

  const CLIPBOARD_ICON = window.Modules?.processos?.CLIPBOARD_ICON
    || '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" class="icon-clipboard"><rect x="6" y="5" width="12" height="15" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M9 5V4a2 2 0 0 1 2-2h2a 2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path><path d="m10 11 2 2 3.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path><path d="m10 16 2 2 3.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

  // ==== Novos utilitários do patch (resultado da checklist e flag extra) ====
  const CHECKLIST_PDF = window.Modules?.checklistPDF || {};
  const EXTRA_NC_CODE = CHECKLIST_PDF.EXTRA_NON_CONFORMITY_CODE || '__ck_extra_nc__';

  const normalizeValue = (value) => (
    typeof value === 'string'
      ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
      : ''
  );

  function evaluateChecklistResult(source) {
    if (typeof CHECKLIST_PDF.getChecklistResult === 'function') {
      return CHECKLIST_PDF.getChecklistResult(source);
    }
    const answers = Array.isArray(source?.answers) ? source.answers : [];
    const hasTemplateNonConformity = answers.some(ans => normalizeValue(ans?.value) === 'nao conforme');
    const extraEntry = answers.find(ans => ans?.code === EXTRA_NC_CODE);
    const hasExtraNonConformity = normalizeValue(extraEntry?.value) === 'sim';
    const hasNonConformity = hasTemplateNonConformity || hasExtraNonConformity;
    return {
      answers,
      extraFlag: hasExtraNonConformity,
      hasNonConformity,
      summary: hasNonConformity ? 'Processo não conforme' : 'Processo conforme'
    };
  }
  // ========================================================================

  function debounce(fn, wait = 500) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  const scheduleDraftSave = debounce(() => { saveChecklistDraft(); }, 600);

  async function loadTemplatesFor(tipo) {
    const { data, error } = await sb
      .from('checklist_templates')
      .select('id,name,type,version,items')
      .eq('type', tipo)
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

  function getChecklistValidationState() {
    const items = $$('#ckContainer .ck-item[data-code]');
    if (!items.length) {
      return { ready: false, reason: 'Selecione um checklist com itens para preencher.' };
    }
    for (const wrap of items) {
      const val = wrap.dataset.value;
      if (!val) {
        return { ready: false, reason: 'Selecione uma opção para todos os itens da checklist.' };
      }
      if (val === 'Não conforme' || val === 'Não aplicável') {
        const obsField = wrap.querySelector('textarea');
        if (!obsField || !obsField.value.trim()) {
          return { ready: false, reason: 'Informe uma observação para itens marcados como “Não conforme” ou “Não aplicável”.' };
        }
      }
    }
    // Validação adicional do patch: se marcar NC extra, exigir observação
    const extraFlag = el('adNCExtra');
    if (extraFlag?.checked) {
      const extraObs = el('adOutrasObs');
      if (!extraObs || !extraObs.value.trim()) {
        return {
          ready: false,
          reason: 'Descreva a não conformidade em “Outras observações do analista” ao assinalar a opção adicional.'
        };
      }
    }
    return { ready: true };
  }

  function getDraftValidationState(draft, template) {
    if (!draft || !template) {
      return { ready: false, reason: 'Nenhum rascunho salvo para finalizar.' };
    }
    const items = [];
    (template.items || []).forEach(cat => {
      (cat.itens || []).forEach(item => { if (item) items.push(item); });
    });
    if (!items.length) {
      return { ready: false, reason: 'Selecione um checklist com itens para preencher.' };
    }
    const answers = Array.isArray(draft.answers) ? draft.answers : [];

    // Validação adicional do patch: se houver flag extra, exigir extra_obs
    const draftEvaluation = evaluateChecklistResult(draft);
    if (draftEvaluation.extraFlag) {
      if (!(draft.extra_obs || '').trim()) {
        return {
          ready: false,
          reason: 'Preencha “Outras observações do analista” ao indicar não conformidade não abarcada pela checklist.'
        };
      }
    }

    return items.reduce((state, item) => {
      if (!state.ready) return state;
      const ans = answers.find(entry => entry && entry.code === (item.code || '')) || {};
      const value = ans.value || '';
      if (!value) {
        return { ready: false, reason: 'O rascunho ainda não possui todas as respostas salvas. Aguarde o salvamento automático antes de finalizar.' };
      }
      if ((value === 'Não conforme' || value === 'Não aplicável') && !(ans.obs || '').trim()) {
        return { ready: false, reason: 'Preencha as observações para itens marcados como “Não conforme” ou “Não aplicável”.' };
      }
      return state;
    }, { ready: true });
  }

  function updateSaveState() {
    const state = getChecklistValidationState();
    const { ready, reason } = state;
    const btnFinalizar = el('adBtnFinalizarChecklist');
    const btnLimpar = el('btnLimparChecklist');
    if (btnFinalizar) {
      // Botão só fica desabilitado quando não há checklist carregada;
      // quando houver checklist, validação é verificada no clique e mensagem é mostrada.
      btnFinalizar.disabled = !currentTemplate;
      if (!currentTemplate) {
        btnFinalizar.removeAttribute('title');
      } else if (!ready) {
        btnFinalizar.title = reason || 'Finalize a checklist apenas após preencher todos os itens obrigatórios.';
      } else {
        btnFinalizar.title = 'As respostas são salvas automaticamente como rascunho. Clique para finalizar.';
      }
    }
    if (btnLimpar) btnLimpar.disabled = !currentTemplate;
  }

  function clearChecklist() {
    if (currentTemplate) {
      renderChecklist(currentTemplate);
    } else {
      el('ckContainer').innerHTML = '';
      currentDraftId = null;
    }
    updateSaveState();
  }

  function renderChecklist(template) {
    currentTemplate = template || null;
    currentDraftId = null;

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

    // Aviso do patch (texto institucional, não altera estilo além da classe)
    const warning = document.createElement('div');
    warning.className = 'ck-warning';
    warning.innerHTML = '<strong>Atenção!</strong> Esta checklist apresenta uma relação não exaustiva de verificações a serem realizadas. Ao detectar não conformidade não abarcada pelos itens a seguir, o Analista deve assinalar a opção &quot;Identificada não conformidade não abarcada pelos itens anteriores&quot; e realizar o registro pertinente no campo &quot;Outras observações do Analista&quot;, ao final do formulário.';
    frag.appendChild(warning);

    (template.items || []).forEach(cat => {
      const catSection = document.createElement('section');
      catSection.className = 'ck-category';

      if (cat.categoria) {
        const h = document.createElement('h4');
        h.className = 'ck-category-title'; // Patch: adiciona classe (sem alterar visual)
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
            scheduleDraftSave();
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
        obs.addEventListener('input', () => {
          updateSaveState();
          scheduleDraftSave();
        });
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

    // Flag extra do patch: não conformidade não abarcada pelos itens
    const extraFlag = document.createElement('label');
    extraFlag.className = 'ck-extra-flag';
    const extraInput = document.createElement('input');
    extraInput.type = 'checkbox';
    extraInput.id = 'adNCExtra';
    extraInput.addEventListener('change', () => {
      updateSaveState();
      scheduleDraftSave();
    });
    const extraText = document.createElement('span');
    extraText.textContent = 'Identificada não conformidade não abarcada pelos itens anteriores';
    extraFlag.appendChild(extraInput);
    extraFlag.appendChild(extraText);
    frag.appendChild(extraFlag);

    const other = document.createElement('label');
    other.className = 'ck-outros';
    const otherTitle = document.createElement('span');
    otherTitle.textContent = 'Outras observações do analista';
    const otherInput = document.createElement('textarea');
    otherInput.id = 'adOutrasObs';
    otherInput.rows = 3;
    otherInput.addEventListener('input', () => {
      updateSaveState();
      scheduleDraftSave();
    });
    other.appendChild(otherTitle);
    other.appendChild(otherInput);
    frag.appendChild(other);

    box.appendChild(frag);
    updateSaveState();
  }

  async function loadChecklistDraft(processId, templateId) {
    currentDraftId = null;
    if (!processId || !templateId) return null;
    try {
      const { data, error } = await sb
        .from('checklist_responses')
        .select('id,answers,extra_obs')
        .eq('process_id', processId)
        .eq('template_id', templateId)
        .eq('status', 'draft')
        .maybeSingle();
      if (error) throw error;
      if (data?.id) currentDraftId = data.id;
      return data || null;
    } catch (err) {
      console.error('Falha ao carregar rascunho da checklist.', err);
      return null;
    }
  }

  async function saveChecklistDraft() {
    if (!currentProcessId || !currentTemplate) return;
    const items = $$('#ckContainer .ck-item[data-code]');
    if (!items.length) return;

    const answers = items.map(wrap => {
      const code = wrap.dataset.code;
      const value = wrap.dataset.value || '';
      const obsField = wrap.querySelector('textarea');
      const obs = obsField ? obsField.value.trim() : '';
      return {
        code,
        value: value ? value : null,
        obs: obs ? obs : null
      };
    });

    // Grava a resposta da flag extra do patch
    const extraNcField = el('adNCExtra');
    if (extraNcField) {
      answers.push({
        code: EXTRA_NC_CODE,
        value: extraNcField.checked ? 'Sim' : 'Não',
        obs: null
      });
    }

    const extraField = el('adOutrasObs');
    const extra = extraField ? extraField.value.trim() : '';

    const u = await getUser();
    if (!u) return;

    const payload = {
      answers,
      extra_obs: extra ? extra : null,
      filled_by: u.id
    };

    try {
      if (currentDraftId) {
        const { error } = await sb
          .from('checklist_responses')
          .update({ ...payload })
          .eq('id', currentDraftId)
          .eq('status', 'draft');
        if (error) throw error;
      } else {
        const { data, error } = await sb
          .from('checklist_responses')
          .insert({
            process_id: currentProcessId,
            template_id: currentTemplate.id,
            started_at: new Date().toISOString(),
            status: 'draft',
            ...payload
          })
          .select('id')
          .single();
        if (error) throw error;
        currentDraftId = data?.id || null;
      }
    } catch (err) {
      console.error('Falha ao salvar rascunho da checklist.', err);
    }
  }

  function applyDraftToUI(draft) {
    if (!draft) {
      updateSaveState();
      return;
    }
    const answers = Array.isArray(draft.answers) ? draft.answers : [];
    const map = new Map();
    answers.forEach(ans => {
      if (!ans || !ans.code) return;
      map.set(ans.code, ans);
    });

    $$('#ckContainer .ck-item[data-code]').forEach(wrap => {
      const code = wrap.dataset.code;
      const ans = map.get(code) || {};
      const value = ans.value || '';
      wrap.dataset.value = value || '';
      wrap.classList.toggle('ck-has-nc', value === 'Não conforme');
      wrap.querySelectorAll('input[type="checkbox"]').forEach(chk => {
        chk.checked = !!value && chk.value === value;
      });
      const obsField = wrap.querySelector('textarea');
      if (obsField) obsField.value = ans.obs || '';
    });

    // Restaura a flag extra a partir da avaliação do rascunho (patch)
    const extraFlagField = el('adNCExtra');
    if (extraFlagField) {
      const draftEvaluation = evaluateChecklistResult(draft);
      extraFlagField.checked = !!draftEvaluation.extraFlag;
    }

    const extraField = el('adOutrasObs');
    if (extraField) extraField.value = draft.extra_obs || '';

    updateSaveState();
  }

  async function discardDraft(processId = currentProcessId, templateId = currentTemplate?.id) {
    if (!processId || !templateId) {
      currentDraftId = null;
      return;
    }
    try {
      let query = sb.from('checklist_responses').delete().eq('status', 'draft');
      if (currentDraftId) {
        query = query.eq('id', currentDraftId);
      } else {
        query = query.eq('process_id', processId).eq('template_id', templateId);
      }
      await query;
    } catch (err) {
      console.error('Falha ao limpar rascunho da checklist.', err);
    }
    currentDraftId = null;
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
    const template = list[0] || null;
    renderChecklist(template);
    if (template && currentProcessId) {
      const draft = await loadChecklistDraft(currentProcessId, template.id);
      applyDraftToUI(draft);
    }
    Utils.setMsg('adMsg', '');
  }

  async function finalizarChecklist() {
    if (!currentProcessId || !currentTemplate) return;

    const state = getChecklistValidationState();
    if (!state.ready) {
      Utils.setMsg('adMsg', state.reason || 'Checklist incompleta.', true);
      return;
    }

    Utils.setMsg('adMsg', 'Finalizando checklist...');
    await saveChecklistDraft();

    const draft = await loadChecklistDraft(currentProcessId, currentTemplate.id);
    if (!draft) {
      const msg = 'Nenhum rascunho encontrado. Aguarde o salvamento automático e tente novamente.';
      Utils.setMsg('adMsg', msg, true);
      window.alert(msg);
      return;
    }

    const draftState = getDraftValidationState(draft, currentTemplate);
    if (!draftState.ready) {
      const msg = draftState.reason || 'Rascunho incompleto.';
      Utils.setMsg('adMsg', msg, true);
      window.alert(msg);
      return;
    }

    const u = await getUser();
    if (!u) {
      Utils.setMsg('adMsg', 'Sessão expirada.', true);
      return;
    }

    // Janela para o PDF aberta antecipadamente para evitar bloqueio de pop-up
    const pdfWindow = window.open('', '_blank');
    if (pdfWindow) pdfWindow.opener = null;

    const nowIso = new Date().toISOString();
    let saved;
    try {
      const { data, error } = await sb
        .from('checklist_responses')
        .update({
          answers: draft.answers || [],
          extra_obs: draft.extra_obs || null,
          filled_by: u.id,
          status: 'final',
          filled_at: nowIso
        })
        .eq('id', draft.id)
        .eq('status', 'draft')
        .select('id,filled_at')
        .single();
      if (error) throw error;
      saved = data;
      currentDraftId = null;
    } catch (err) {
      if (pdfWindow) pdfWindow.close();
      Utils.setMsg('adMsg', err.message || 'Falha ao finalizar checklist.', true);
      return;
    }

    const filledAt = saved?.filled_at || nowIso;

    await sb.from('audit_log').insert({
      user_id: u.id,
      user_email: u.email,
      action: 'UPDATE',
      entity_type: 'checklist_responses',
      entity_id: saved?.id,
      details: { process_id: currentProcessId, checklist_name: currentTemplate.name, filled_at: filledAt }
    });

    await discardDraft(currentProcessId, currentTemplate.id);
    Utils.setMsg('adMsg', 'Checklist finalizada.');
    await loadIndicador();
    if (window.Modules.processos?.reloadLists) {
      try {
        await window.Modules.processos.reloadLists();
      } catch (err) {
        console.error('Falha ao recarregar listas de processos.', err);
      }
    }
    if (saved?.id) {
      await abrirChecklistPDF(saved.id, pdfWindow);
    } else if (pdfWindow) {
      pdfWindow.close();
    }
    clearChecklist();
  }

  async function clearForm() {
    await discardDraft();
    el('adNUP').value = '';
    el('adTipo').value = 'PDIR';
    Utils.setMsg('adMsg', '');
    currentProcessId = null;
    currentTemplate = null;
    clearChecklist();
  }

  async function loadIndicador() {
    const box = el('listaAD');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('checklist_responses')
        .select('process_id,filled_at,processes(nup)')
        .eq('status', 'final')
        .order('filled_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const seen = new Set();
      const rows = [];
      (data || []).forEach(r => {
        const procId = r.process_id;
        if (!procId || seen.has(procId)) return;
        seen.add(procId);
        rows.push({
          process_id: procId,
          nup: r.processes?.nup || '',
          filled_at: r.filled_at
        });
      });
      if (!rows.length) {
        box.innerHTML = '<div class="msg">Nenhuma checklist concluída.</div>';
        return;
      }
      Utils.renderTable(box, [
        { key: 'nup', label: 'NUP' },
        { key: 'filled_at', label: 'Última checklist', value: r => Utils.fmtDateTime(r.filled_at) },
        {
          label: 'Checklists',
          align: 'center',
          render: r => createChecklistButton(r.process_id)
        }
      ], rows);
    } catch (err) {
      box.innerHTML = `<div class="msg error">${err.message || String(err)}</div>`;
    }
  }

  async function loadApprovedChecklists() {
    const box = el('adApprovedList');
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('checklist_templates')
        .select('id,name,type,version,approved_at,profiles:approved_by(name)')
        .not('approved_by', 'is', null)
        .order('approved_at', { ascending: false })
        .order('name');
      if (error) throw error;
      const rows = Array.isArray(data)
        ? data.map(row => ({
            id: row.id,
            name: row.name || '',
            type: row.type || '',
            version: row.version,
            approved_at: row.approved_at,
            approved_by_name: row.profiles?.name || ''
          }))
        : [];
      const latestRows = [];
      const seen = new Set();
      rows.forEach(row => {
        const key = `${row.type}:::${row.name}`;
        if (seen.has(key)) return;
        seen.add(key);
        latestRows.push(row);
      });
      if (!latestRows.length) {
        box.innerHTML = '<div class="msg">Nenhuma checklist aprovada.</div>';
        return;
      }
      Utils.renderTable(box, [
        { key: 'name', label: 'Nome' },
        { key: 'type', label: 'Tipo' },
        { key: 'version', label: 'Versão', align: 'center' },
        { key: 'approved_by_name', label: 'Aprovada por' },
        {
          key: 'approved_at',
          label: 'Aprovada em',
          value: r => (r.approved_at ? Utils.fmtDateTime(r.approved_at) : '')
        },
        {
          label: 'PDF',
          align: 'center',
          render: r => createApprovedChecklistPdfButton(r.id)
        }
      ], latestRows);
    } catch (err) {
      box.innerHTML = `<div class="msg error">${err.message || String(err)}</div>`;
    }
  }

  function createApprovedChecklistPdfButton(templateId) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'PDF';
    btn.addEventListener('click', () => abrirChecklistTemplatePDF(templateId));
    return btn;
  }

  function createChecklistButton(processId) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'docIcon ckBtn on';
    btn.innerHTML = CLIPBOARD_ICON;
    btn.title = 'Checklists';
    btn.setAttribute('aria-label', 'Checklists');
    btn.addEventListener('click', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      openChecklistPopup(processId);
    });
    return btn;
  }

  async function loadChecklistHistory(procId, targetId = 'ckListaPop') {
    const box = el(targetId);
    if (!box) return;
    box.innerHTML = '<div class="msg">Carregando…</div>';
    try {
      const { data, error } = await sb
        .from('checklist_responses')
        .select('id,filled_at,answers,checklist_templates(name,version)')
        .eq('process_id', procId)
        .eq('status', 'final')
        .order('filled_at', { ascending: false });
      if (error) throw error;
      const rows = Array.isArray(data)
        ? data.map(r => {
            const evaluation = evaluateChecklistResult(r);
            const version = r.checklist_templates?.version;
            const checklistName = r.checklist_templates?.name || '';
            const checklistWithVersion = version != null
              ? `${checklistName} (v${version})`
              : checklistName;
            return {
              id: r.id,
              checklist: checklistWithVersion,
              filled_at: r.filled_at,
              result: evaluation.summary || ''
            };
          })
        : [];
      if (!rows.length) {
        box.innerHTML = '<div class="msg">Nenhuma checklist preenchida.</div>';
        return;
      }
      Utils.renderTable(box, [
        { key: 'checklist', label: 'Doc' },
        { key: 'filled_at', label: 'Preenchida em', value: r => Utils.fmtDateTime(r.filled_at) },
        { key: 'result', label: 'Resultado' },
        {
          label: 'PDF',
          align: 'center',
          render: r => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = 'PDF';
            b.addEventListener('click', () => abrirChecklistPDF(r.id));
            return b;
          }
        }
      ], rows);
    } catch (err) {
      box.innerHTML = `<div class="msg error">${err.message || String(err)}</div>`;
    }
  }

  async function openChecklistPopup(procId) {
    if (!procId) return;
    if (window.Modules.processos?.showChecklistPopup) {
      window.Modules.processos.showChecklistPopup(procId);
      return;
    }
    const dlg = document.createElement('dialog');
    dlg.className = 'hist-popup';
    dlg.innerHTML = '<div id="ckListaPop" class="table scrolly">Carregando…</div><menu><button type="button" id="ckClose">Fechar</button></menu>';
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.querySelector('#ckClose')?.addEventListener('click', () => dlg.close());
    dlg.showModal();
    await loadChecklistHistory(procId, 'ckListaPop');
  }

  async function abrirChecklistTemplatePDF(templateId, existingWindow = null) {
    if (!templateId) return;
    const win = existingWindow || window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const { data, error } = await sb
        .from('checklist_templates')
        .select('id,name,type,version,items,approved_at,profiles:approved_by(name)')
        .eq('id', templateId)
        .single();
      if (error) throw error;

      const render = window.Modules?.checklistPDF?.renderChecklistPDF;
      if (typeof render !== 'function') {
        throw new Error('Utilitário de PDF indisponível.');
      }

      const metadata = [
        { label: 'Tipo', value: data?.type || '—' },
        { label: 'Versão', value: data?.version != null ? String(data.version) : '—' },
        { label: 'Aprovada em', value: data?.approved_at ? Utils.fmtDateTime(data.approved_at) : '—' },
        { label: 'Aprovada por', value: data?.profiles?.name || '—' }
      ];

      const payload = {
        processes: { nup: '—' },
        checklist_templates: {
          name: data?.name || '',
          items: Array.isArray(data?.items) ? data.items : []
        },
        answers: []
      };

      const url = render(payload, { metadata });
      if (win) win.location.href = url;
    } catch (err) {
      if (win) win.close();
      alert(err.message || String(err));
    }
  }

  // ===== Patch aplicado: PDF com margens, quebra de página e word wrap =====
  async function abrirChecklistPDF(id, existingWindow = null) {
    // Reaproveita janela existente (quando fornecida) para evitar bloqueio de pop-up
    const win = existingWindow || window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const { data, error } = await sb
        .from('checklist_responses')
        .select('answers,extra_obs,started_at,filled_at,filled_by,profiles:filled_by(name),processes(nup),checklist_templates(name,version,items)')
        .eq('id', id)
        .single();
      if (error) throw error;

      const render = window.Modules?.checklistPDF?.renderChecklistPDF;
      if (typeof render !== 'function') {
        throw new Error('Utilitário de PDF indisponível.');
      }

      const startedAt = data.started_at ? Utils.fmtDateTime(data.started_at) : '—';
      const finishedAt = data.filled_at ? Utils.fmtDateTime(data.filled_at) : '—';
      const responsible = data.profiles?.name || data.filled_by || '—';

      const url = render(data, {
        metadata: [
          { label: 'Início', value: startedAt || '—' },
          { label: 'Término', value: finishedAt || '—' },
          { label: 'Responsável', value: responsible || '—' }
        ]
      });

      if (win) win.location.href = url;
    } catch (err) {
      if (win) win.close();
      alert(err.message || String(err));
    }
  }
  // ===== Fim do patch =====

  function bind() {
    const btnIniciar = el('btnIniciarAD');
    const btnLimparAD = el('btnLimparAD');
    const btnLimparChecklist = el('btnLimparChecklist');
    const btnFinalizarChecklist = el('adBtnFinalizarChecklist');

    if (btnIniciar) btnIniciar.addEventListener('click', ev => { ev.preventDefault(); iniciarChecklist(); });
    if (btnLimparAD) btnLimparAD.addEventListener('click', async ev => {
      ev.preventDefault();
      await clearForm();
    });
    if (btnLimparChecklist) {
      btnLimparChecklist.addEventListener('click', async ev => {
        ev.preventDefault();
        if (!currentTemplate) return;
        if (window.confirm('Deseja limpar a checklist atual?')) {
          await discardDraft();
          clearChecklist();
        }
      });
    }
    if (btnFinalizarChecklist) {
      btnFinalizarChecklist.addEventListener('click', ev => {
        ev.preventDefault();
        if (!currentTemplate) return;
        const state = getChecklistValidationState();
        if (!state.ready) {
          const msg = state.reason || 'Checklist incompleta. Finalize apenas após preencher todos os itens obrigatórios.';
          Utils.setMsg('adMsg', msg, true);
          window.alert(msg);
          return;
        }
        if (window.confirm('Deseja finalizar esta checklist? As respostas salvas serão registradas como versão final e o rascunho será removido.')) finalizarChecklist();
      });
    }
  }

  function init() { bind(); }
  async function load() {
    clearChecklist();
    await Promise.all([
      loadIndicador(),
      loadApprovedChecklists()
    ]);
  }

  return { init, load };
})();
