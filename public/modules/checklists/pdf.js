// public/modules/checklists/pdf.js
// Utilitário compartilhado para renderização de PDFs de checklists.
(() => {
  const EXTRA_NON_CONFORMITY_CODE = '__ck_extra_nc__';

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

    const resultInfo = getChecklistResult(response);
    if (resultInfo.stamp) {
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

    const metadataEntries = [
      { label: 'Checklist', value: response?.checklist_templates?.name || '' },
      {
        label: 'Versão da checklist',
        value: response?.checklist_templates?.version != null
          ? String(response.checklist_templates.version)
          : '—'
      },
      { label: 'NUP', value: response?.processes?.nup || '' },
      ...(Array.isArray(options.metadata) ? options.metadata : [])
    ];

    if (resultInfo.summary) {
      metadataEntries.push({ label: 'Resultado', value: resultInfo.summary });
    }

    metadataEntries.forEach(entry => {
      if (!entry) return;
      const label = entry.label ?? '';
      const value = entry.value ?? '';
      const text = label ? `${label}: ${value}` : String(value);
      addWrappedText(text, entry.textOptions || {});
    });

    if (metadataEntries.length) addVerticalSpace(headerSpacing);

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
        const ans = answers.find(a => a && a.code === item.code) || {};
        addWrappedText(`${item.code || ''} - ${item.requisito || ''}`);
        addWrappedText(`Resultado: ${ans.value || ''}`);
        if (ans.obs) addWrappedText(`Obs: ${ans.obs}`);
        addVerticalSpace(4);
      });
    });

    if (response?.extra_obs) {
      doc.setFont(undefined, 'bold');
      addWrappedText('Outras observações:');
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
