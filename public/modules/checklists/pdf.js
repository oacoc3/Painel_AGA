// public/modules/checklists/pdf.js
// Utilitário compartilhado para renderização de PDFs de checklists.
(() => {
  const EXTRA_NON_CONFORMITY_CODE = '__ck_extra_nc__';
  const CHECKLIST_NOTICE = 'Os itens apresentados nesta checklist compõem uma relação não exaustiva de verificações a serem realizadas. Ao serem detectadas não conformidade não abarcadas pelos itens a seguir, haverá o pertinente registro no campo "Outras observações do(a) Analista".';
  const normalizeValue = (value) => (
    typeof value === 'string'
      ? value
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()
      : ''
  );

  const getAnswersArray = (source) => {
    if (Array.isArray(source)) return source;
    if (source && Array.isArray(source.answers)) return source.answers;
    return [];
  };

  function getChecklistResult(source) {
    const answers = getAnswersArray(source);
    const hasTemplateNonConformity = answers.some(ans => normalizeValue(ans?.value) === 'nao conforme');
    const extraEntry = answers.find(ans => ans?.code === EXTRA_NON_CONFORMITY_CODE);
    const hasExtraNonConformity = normalizeValue(extraEntry?.value) === 'sim';
    const hasNonConformity = hasTemplateNonConformity || hasExtraNonConformity;
    return {
      answers,
      hasNonConformity,
      extraFlag: hasExtraNonConformity,
      summary: hasNonConformity ? 'Processo não conforme' : 'Processo conforme',
      stamp: hasNonConformity ? 'PROCESSO NÃO CONFORME' : 'PROCESSO CONFORME'
    };
  }

  function renderChecklistPDF(response, options = {}) {
    if (!window.jspdf?.jsPDF) {
      throw new Error('Biblioteca de PDF indisponível.');
    }

    const doc = new window.jspdf.jsPDF();
    const marginLeft = options.marginLeft ?? options.leftMargin ?? 20;
    const marginRight = options.marginRight ?? options.rightMargin ?? 20;
    const marginTop = options.marginTop ?? options.topMargin ?? 20;
    const marginBottom = options.marginBottom ?? options.bottomMargin ?? 20;
    const lineHeight = options.lineHeight ?? 6;
    const defaultAlign = options.align ?? 'justify';
    const headerSpacing = options.headerSpacing ?? 4;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - marginLeft - marginRight;
    const maxY = pageHeight - marginBottom;
    let y = marginTop;

    const ensureSpace = (height = lineHeight) => {
      if (y + height > maxY) {
        doc.addPage();
        y = marginTop;
      }
    };

    const addVerticalSpace = (amount = lineHeight) => {
      if (y + amount > maxY) {
        doc.addPage();
        y = marginTop;
      } else {
        y += amount;
      }
    };

    const addWrappedText = (text, opts = {}) => {
      if (text == null || text === '') return;
      const paragraphs = String(text).split(/\n+/);
      const baseOptions = {
        maxWidth: contentWidth,
        align: opts.align || defaultAlign,
        ...opts
      };

      paragraphs.forEach((paragraph, index) => {
        if (!paragraph.trim()) {
          addVerticalSpace(lineHeight);
          return;
        }
        const lines = doc.splitTextToSize(paragraph, contentWidth);
        lines.forEach(line => {
          ensureSpace(lineHeight);
          doc.text(line, marginLeft, y, baseOptions);
          y += lineHeight;
        });
        if (index < paragraphs.length - 1) {
          addVerticalSpace(lineHeight);
        }
      });
    };

    const baseFontSize = options.fontSize || 12;
    doc.setFontSize(baseFontSize);

    // Novo: modos de geração
    const mode = options.mode === 'approved' ? 'approved' : 'final';
    const isApproved = mode === 'approved';
    const noticeText = options.notice ?? CHECKLIST_NOTICE;

    const resultInfo = isApproved
      ? { answers: getAnswersArray(response) }
      : getChecklistResult(response);

    // Selo (stamp) apenas no modo "final"
    if (!isApproved && resultInfo.stamp) {
      const stampSize = options.stampFontSize || 16;
      const stampY = Math.max(10, marginTop - 6);
      doc.setFontSize(stampSize);
      doc.setFont(undefined, 'bold');
      if (resultInfo.hasNonConformity) {
        doc.setTextColor(180, 0, 0);
      } else {
        doc.setTextColor(34, 139, 34);
      }
      doc.text(resultInfo.stamp, pageWidth - marginRight, stampY, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(baseFontSize);
    }

    const template = response?.checklist_templates || {};
    const metadataEntries = [
      { label: 'Tipo', value: template.type || template.name || options.type || '—' },
      {
        label: 'Versão',
        value: template.version != null ? String(template.version) : '—'
      }
    ];

    if (isApproved) {
      metadataEntries.push(
        { label: 'Data de aprovação', value: options.approvedAt || '—' },
        { label: 'Responsável pela aprovação', value: options.approvedBy || '—' }
      );
    } else {
      metadataEntries.push(
        { label: 'NUP', value: response?.processes?.nup || options.nup || '—' },
        { label: 'Início', value: options.startedAt || '—' },
        { label: 'Término', value: options.finishedAt || '—' },
        { label: 'Responsável', value: options.responsible || '—' }
      );
      if (resultInfo.summary) {
        metadataEntries.push({ label: 'Resultado', value: resultInfo.summary });
      }
    }

    if (Array.isArray(options.metadata)) {
      metadataEntries.push(...options.metadata.filter(Boolean));
    }

    metadataEntries.forEach(entry => {
      if (!entry) return;
      const label = entry.label ?? '';
      const value = entry.value ?? '';
      const text = label ? `${label}: ${value}` : String(value);
      addWrappedText(text, entry.textOptions || {});
    });

    if (metadataEntries.length) addVerticalSpace(headerSpacing);

    // Aviso padrão (itálico)
    if (noticeText) {
      doc.setFont(undefined, 'italic');
      addWrappedText(noticeText);
      doc.setFont(undefined, 'normal');
      addVerticalSpace(headerSpacing);
    }

    const answers = resultInfo.answers;
    const categories = Array.isArray(response?.checklist_templates?.items)
      ? response.checklist_templates.items
      : [];

    categories.forEach(category => {
      if (!category) return;
      doc.setFont(undefined, 'bold');
      addWrappedText(category.categoria || '');
      doc.setFont(undefined, 'normal');
      (category.itens || []).forEach(item => {
        if (!item) return;
        addWrappedText(`${item.code || ''} - ${item.requisito || ''}`);
        if (isApproved) {
          if (item.texto_sugerido) {
            addWrappedText(`Texto sugerido: ${item.texto_sugerido}`);
          }
        } else {
          const ans = answers.find(a => a && a.code === item.code) || {};
          addWrappedText(`Resultado: ${ans.value || ''}`);
          if (ans.obs) addWrappedText(`Obs: ${ans.obs}`);
          if (item.texto_sugerido) {
            addWrappedText(`Texto sugerido: ${item.texto_sugerido}`);
          }
        }
        addVerticalSpace(4);
      });
    });

    if (!isApproved && response?.extra_obs) {
      doc.setFont(undefined, 'bold');
          reason: 'Descreva a não conformidade em “Outras observações do(a) Analista” ao assinalar a opção adicional.'
      doc.setFont(undefined, 'normal');
      addWrappedText(String(response.extra_obs));
    }

    return doc.output('bloburl');
  }

  window.Modules = window.Modules || {};
  window.Modules.checklistPDF = window.Modules.checklistPDF || {};
  window.Modules.checklistPDF.EXTRA_NON_CONFORMITY_CODE = EXTRA_NON_CONFORMITY_CODE;
  window.Modules.checklistPDF.getChecklistResult = getChecklistResult;
  window.Modules.checklistPDF.renderChecklistPDF = renderChecklistPDF;
})();
