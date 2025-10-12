// public/modules/checklists/pdf.js
// Utilitário compartilhado para renderização de PDFs de checklists.
// Mantém o visual atual; melhora paginação, medições e numeração de páginas.

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

    // NOVO: recuo configurável para seção "Texto(s) sugerido(s)"
    const parsedSuggestionIndent = Number(options.suggestionIndent);
    const suggestionIndent = Number.isFinite(parsedSuggestionIndent)
      ? parsedSuggestionIndent
      : 8;

    // Controle de espaçamento após o título de categoria
    const parsedCategorySpacing = Number(options.categorySpacing);
    const hasCategorySpacing = Number.isFinite(parsedCategorySpacing);
    const categorySpacing = Math.max(
      hasCategorySpacing ? parsedCategorySpacing : lineHeight,
      lineHeight
    );

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - marginLeft - marginRight;
    const maxY = pageHeight - marginBottom;
    let y = marginTop;

    let isSimulating = false;

    const ensureSpace = (height = lineHeight) => {
      if (isSimulating) return;
      if (y + height > maxY) {
        doc.addPage();
        y = marginTop;
      }
    };

    const forcePageBreak = () => {
      if (isSimulating) return;
      doc.addPage();
      y = marginTop;
    };

    const addVerticalSpace = (amount = lineHeight) => {
      if (isSimulating) {
        y += amount;
        return;
      }
      if (y + amount > maxY) {
        doc.addPage();
        y = marginTop;
      } else {
        y += amount;
      }
    };

    // Mede a altura de um parágrafo (ou múltiplos, separados por \n)
    const measureTextHeight = (text, opts = {}) => {
      const x = opts.x ?? marginLeft;
      const availableWidth = contentWidth - (x - marginLeft);
      const maxWidth = opts.maxWidth ?? availableWidth;
      const paragraphs = String(text ?? '').split(/\n+/);
      let total = 0;
      paragraphs.forEach((p, i) => {
        if (!p.trim()) {
          total += lineHeight; // linha vazia
        } else {
          const lines = doc.splitTextToSize(p, maxWidth);
          const count = Math.max(1, lines.length);
          total += count * lineHeight;
        }
        if (i < paragraphs.length - 1) total += lineHeight; // espaço entre parágrafos
      });
      return total;
    };

    const addWrappedText = (text, opts = {}) => {
      if (text == null || text === '') return;
      const paragraphs = String(text).split(/\n+/);
      const x = opts.x ?? marginLeft;
      const availableWidth = contentWidth - (x - marginLeft);
      const maxWidth = opts.maxWidth ?? availableWidth;
      const align = opts.align ?? defaultAlign;
      const { x: _ignoredX, ...restOpts } = opts;
      const baseOptions = { ...restOpts, maxWidth, align };

      paragraphs.forEach((paragraph, index) => {
        if (!paragraph.trim()) {
          addVerticalSpace(lineHeight);
          return;
        }
        const lines = doc.splitTextToSize(paragraph, maxWidth);
        const lineCount = Math.max(1, lines.length);
        const requiredHeight = lineHeight * lineCount;

        ensureSpace(requiredHeight);
        if (!isSimulating) {
          doc.text(paragraph, x, y, baseOptions);
        }
        y += requiredHeight;

        if (index < paragraphs.length - 1) addVerticalSpace(lineHeight);
      });
    };

    // Impressão "Label: Valor" com label em negrito e quebra inteligente
    const addLabelValue = (label, value, opts = {}) => {
      const hasLabel = label != null && label !== '';
      const strValue = value == null ? '' : String(value);
      if (!hasLabel) {
        addWrappedText(strValue, opts);
        return;
      }

      const separator = opts.separator ?? ': ';
      const x = opts.x ?? marginLeft;
      const availableWidth = contentWidth - (x - marginLeft);
      const maxWidth = opts.maxWidth ?? availableWidth;
      const { x: _ignoredX, align: customAlign, ...restOpts } = opts;
      const baseOptions = {
        ...restOpts,
        align: customAlign ?? defaultAlign,
        maxWidth
      };
      const labelText = `${label}${separator}`;

      const prevStyle = typeof doc.getFont === 'function'
        ? (doc.getFont()?.fontStyle || 'normal')
        : 'normal';

      doc.setFont(undefined, 'bold');
      const labelWidth = doc.getTextWidth(labelText);
      doc.setFont(undefined, 'normal');

      // Label não cabe -> quebra label e valor em linhas separadas
      if (!(labelWidth < maxWidth)) {
        doc.setFont(undefined, 'bold');
        addWrappedText(labelText, { ...baseOptions, x });
        doc.setFont(undefined, 'normal');
        if (strValue) addWrappedText(strValue, { ...baseOptions, x });
        doc.setFont(undefined, prevStyle);
        return;
      }

      const valueMaxWidth = maxWidth - labelWidth;
      let isFirstLine = true;
      const paragraphs = strValue.split(/\n/);

      paragraphs.forEach(paragraph => {
        const lines = doc.splitTextToSize(paragraph, valueMaxWidth);
        if (!lines.length) lines.push('');
        lines.forEach(line => {
          ensureSpace(lineHeight);
          if (isFirstLine) {
            if (!isSimulating) {
              doc.setFont(undefined, 'bold');
              doc.text(labelText, x, y, baseOptions);
            }
            isFirstLine = false;
          }
          if (!isSimulating) {
            doc.setFont(undefined, 'normal');
            if (line) {
              doc.text(line, x + labelWidth, y, {
                ...baseOptions,
                maxWidth: valueMaxWidth
              });
            }
          }
          y += lineHeight;
        });
      });

      doc.setFont(undefined, prevStyle);
    };

    // NOVO: seção "Texto(s) sugerido(s)" com recuo
    const addSuggestionSection = (text, opts = {}) => {
      if (!text) return;

      const baseX = opts.x ?? marginLeft;
      const availableWidth = contentWidth - (baseX - marginLeft);
      const maxWidth = opts.maxWidth ?? availableWidth;

      const normalizedIndent = (() => {
        const positiveIndent = Math.max(0, suggestionIndent);
        if (!Number.isFinite(maxWidth) || maxWidth <= 0) return positiveIndent;
        return Math.min(positiveIndent, Math.max(0, maxWidth - 10));
      })();

      const suggestionX = baseX + normalizedIndent;
      const suggestionWidth = Math.max(10, maxWidth - normalizedIndent);

      addVerticalSpace(lineHeight * 2);
      addWrappedText('Texto(s) sugerido(s) (não conformidade / não aplicação):', {
        x: suggestionX,
        maxWidth: suggestionWidth
      });
      addVerticalSpace(lineHeight * 2);
      addWrappedText(text, {
        x: suggestionX,
        maxWidth: suggestionWidth
      });
    };

    // NOVO: texto sublinhado (usado nos títulos de categoria)
    const addUnderlinedText = (text, opts = {}) => {
      if (text == null || text === '') return;
      const paragraphs = String(text).split(/\n+/);
      const x = opts.x ?? marginLeft;
      const availableWidth = contentWidth - (x - marginLeft);
      const maxWidth = opts.maxWidth ?? availableWidth;
      const underlineOffset = Number.isFinite(opts.underlineOffset)
        ? opts.underlineOffset
        : 0.75;
      const baseOptions = {
        ...opts,
        align: opts.align ?? defaultAlign,
        maxWidth
      };

      paragraphs.forEach((paragraph, index) => {
        if (!paragraph.trim()) {
          addVerticalSpace(lineHeight);
          return;
        }

        const lines = doc.splitTextToSize(paragraph, maxWidth);
        if (!lines.length) lines.push('');
        const requiredHeight = lineHeight * lines.length;

        ensureSpace(requiredHeight);
        if (!isSimulating) {
          lines.forEach((line, lineIndex) => {
            const lineY = y + lineHeight * lineIndex;
            doc.text(line, x, lineY, baseOptions);
            const textWidth = Math.min(maxWidth, doc.getTextWidth(line));
            const underlineY = lineY + underlineOffset;
            doc.line(x, underlineY, x + textWidth, underlineY);
          });
        }
        y += requiredHeight;

        if (index < paragraphs.length - 1) {
          addVerticalSpace(lineHeight);
        }
      });
    };

    const measureContent = (fn) => {
      const savedY = y;
      const wasSimulating = isSimulating;
      isSimulating = true;
      fn();
      const height = y - savedY;
      y = savedY;
      isSimulating = wasSimulating;
      if (doc.setFont) doc.setFont(undefined, 'normal');
      if (doc.setFontSize) doc.setFontSize(baseFontSize);
      if (doc.setTextColor) doc.setTextColor(0, 0, 0);
      return height;
    };

    // ALTERADO: bloco com espaçamento interno (sem preenchimento de fundo)
    const drawBlock = (drawContent, opts = {}) => {
      const blockX = opts.blockX ?? marginLeft;
      const blockWidth = opts.blockWidth ?? contentWidth;
      const paddingX = opts.paddingX ?? 2;
      const paddingY = opts.paddingY ?? Math.max(2, Math.min(lineHeight / 2, 4));
      const drawBorder = opts.drawBorder === true;
      const borderColor = opts.borderColor;

      const baselineOffset = (() => {
        if (typeof doc.getTextDimensions !== 'function') return 0;
        try {
          const metrics = doc.getTextDimensions('Ig');
          if (!metrics) return 0;
          const { h, baseline } = metrics;
          if (Number.isFinite(h) && Number.isFinite(baseline)) {
            const offset = h - baseline;
            if (Number.isFinite(offset) && offset > 0) return offset;
          }
        } catch (_err) {}
        return 0;
      })();

      const effectiveTopPadding = paddingY + baselineOffset;
      const maxWidth = opts.maxWidth ?? (blockWidth - paddingX * 2);

      const content = () => {
        y += effectiveTopPadding;
        drawContent({
          x: blockX + paddingX,
          maxWidth,
          blockX,
          blockWidth
        });
        y += paddingY;
      };

      const blockHeight = measureContent(content);
      // Se não couber inteiro, quebra antes do bloco
      if (!isSimulating && (y + blockHeight > maxY)) {
        forcePageBreak();
      }

      if (!isSimulating && drawBorder) {
        if (Array.isArray(borderColor) && borderColor.length === 3) {
          doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
        } else if (Number.isFinite(borderColor)) {
          doc.setDrawColor(borderColor);
        }
        doc.rect(blockX, y, blockWidth, blockHeight);
        doc.setDrawColor(0);
      }

      content();
    };

    const baseFontSize = options.fontSize || 12;
    doc.setFontSize(baseFontSize);
    if (typeof doc.getFontSize === 'function' && typeof doc.setLineHeightFactor === 'function') {
      const currentFontSize = doc.getFontSize();
      if (currentFontSize) {
        const scaleFactor = doc.internal?.scaleFactor ?? (72 / 25.4);
        doc.setLineHeightFactor((lineHeight * scaleFactor) / currentFontSize);
      }
    }

    // Modos de geração
    const mode = options.mode === 'approved' ? 'approved' : 'final';
    const isApproved = mode === 'approved';
    const noticeText = options.notice ?? CHECKLIST_NOTICE;

    const resultInfo = isApproved
      ? { answers: getAnswersArray(response) }
      : getChecklistResult(response);

    // Selo (stamp) apenas no modo "final" e só na 1ª página
    if (!isApproved && resultInfo.stamp) {
      const stampSize = options.stampFontSize || 16;
      const stampY = Math.max(10, marginTop - 6);
      doc.setFontSize(stampSize);
      doc.setFont(undefined, 'bold');
      if (resultInfo.hasNonConformity) doc.setTextColor(180, 0, 0);
      else doc.setTextColor(34, 139, 34);
      doc.text(resultInfo.stamp, pageWidth - marginRight, stampY, { align: 'right' });
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(baseFontSize);
    }

    // Metadados (mantém uma coluna; sem mudanças visuais fortes)
    const template = response?.checklist_templates || {};
    const metadataEntries = [
      { label: 'Tipo', value: template.type || template.name || options.type || '—' },
      { label: 'Versão', value: template.version != null ? String(template.version) : '—' }
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

    // Cabeçalho (metadados)
    metadataEntries.forEach(entry => {
      if (!entry) return;
      const label = entry.label ?? '';
      const value = entry.value ?? '';
      if (label) {
        addLabelValue(label, value, entry.textOptions || {});
      } else {
        const text = String(value);
        addWrappedText(text, entry.textOptions || {});
      }
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

    const itemSpacing = Math.max(3, Math.min(lineHeight / 2, 6));

    categories.forEach((category, catIndex) => {
      if (!category) return;

      const categoryTitle = category.categoria || '';
      const categoryBlockHeight = categoryTitle
        ? measureContent(() => {
            drawBlock(({ x, maxWidth }) => {
              doc.setFont(undefined, 'bold');
              addUnderlinedText(categoryTitle, { x, maxWidth });
              doc.setFont(undefined, 'normal');
            }, {
              paddingX: 4,
              paddingY: Math.max(3, Math.min(lineHeight / 2, 6))
            });
          })
        : 0;

      // Se possível, mantenha título + 1º item na mesma página
      const firstItem = (category.itens || [])[0];
      const firstItemHeight = firstItem
        ? measureContent(() => {
            const ans = !isApproved
              ? (answers.find(a => a && a.code === firstItem.code) || {})
              : {};
            const isNonConform = !isApproved && normalizeValue(ans.value) === 'nao conforme';

            drawBlock(({ x, maxWidth }) => {
              if (isNonConform) doc.setTextColor(180, 0, 0);

              const code = firstItem.code || '';
              const requirement = firstItem.requisito || '';
              if (code) {
                addLabelValue(code, '', { separator: '', x, maxWidth });
                if (requirement) addWrappedText(requirement, { x, maxWidth });
              } else if (requirement) {
                addWrappedText(requirement, { x, maxWidth });
              }

              if (isApproved) {
                // Alterado: usar seção com recuo para "Texto(s) sugerido(s)"
                addSuggestionSection(firstItem.texto_sugerido, { x, maxWidth });
              } else {
                addLabelValue('Resultado', '', { separator: '', x, maxWidth });
                if (ans.value) addWrappedText(ans.value, { x, maxWidth });
                if (ans.obs) {
                  addLabelValue('Obs', '', { separator: '', x, maxWidth });
                  addWrappedText(ans.obs, { x, maxWidth });
                }
                if (firstItem.texto_sugerido) {
                  addWrappedText(`Texto(s) sugerido(s) (não conformidade / não aplicação): ${firstItem.texto_sugerido}`, { x, maxWidth });
                }
              }

              if (isNonConform) doc.setTextColor(0, 0, 0);
            }, {
              paddingX: 4,
              paddingY: Math.max(3, Math.min(lineHeight / 2, 6))
            });
          })
        : 0;

      // Keep-with-first: quebra antes se faltar espaço para título+primeiro item
      if (categoryTitle && firstItem && (y + categoryBlockHeight + categorySpacing + firstItemHeight > maxY)) {
        forcePageBreak();
      }

      // Desenha o título de categoria
      if (categoryTitle) {
        drawBlock(({ x, maxWidth }) => {
          doc.setFont(undefined, 'bold');
          addUnderlinedText(categoryTitle, { x, maxWidth });
          doc.setFont(undefined, 'normal');
        }, {
          paddingX: 4,
          paddingY: Math.max(3, Math.min(lineHeight / 2, 6))
        });
      }

      addVerticalSpace(categorySpacing);
      doc.setFont(undefined, 'normal');

      (category.itens || []).forEach((item, index) => {
        if (!item) return;

        const ans = !isApproved
          ? (answers.find(a => a && a.code === item.code) || {})
          : {};
        const isNonConform = !isApproved && normalizeValue(ans.value) === 'nao conforme';

        const itemPaddingY = Math.max(3, Math.min(lineHeight / 2, 6));

        // Mede o bloco do item; quebra antes se necessário
        const thisItemHeight = measureContent(() => {
          drawBlock(() => {}, { paddingX: 4, paddingY: itemPaddingY });
        });

        if (y + thisItemHeight > maxY) forcePageBreak();

        drawBlock(({ x, maxWidth }) => {
          if (isNonConform) doc.setTextColor(180, 0, 0);

          const code = item.code || '';
          const requirement = item.requisito || '';
          if (code) {
            addLabelValue(code, '', { separator: '', x, maxWidth });
            if (requirement) addWrappedText(requirement, { x, maxWidth });
          } else if (requirement) {
            addWrappedText(requirement, { x, maxWidth });
          }

          if (isApproved) {
            // Alterado: usar seção com recuo para "Texto(s) sugerido(s)"
            addSuggestionSection(item.texto_sugerido, { x, maxWidth });
          } else {
            addLabelValue('Resultado', '', { separator: '', x, maxWidth });
            if (ans.value) addWrappedText(ans.value, { x, maxWidth });
            if (ans.obs) {
              addLabelValue('Obs', '', { separator: '', x, maxWidth });
              addWrappedText(ans.obs, { x, maxWidth });
            }
            if (item.texto_sugerido) {
              addWrappedText(`Texto(s) sugerido(s) (não conformidade / não aplicação): ${item.texto_sugerido}`, { x, maxWidth });
            }
          }

          if (isNonConform) doc.setTextColor(0, 0, 0);
        }, {
          paddingX: 4,
          paddingY: itemPaddingY
        });

        if (index < (category.itens || []).length - 1) {
          addVerticalSpace(itemSpacing);
        }
      });

      // Pequeno espaço após a categoria (evita “grudar” com a próxima)
      if (catIndex < categories.length - 1) addVerticalSpace(Math.max(2, itemSpacing));
    });

    if (!isApproved && response?.extra_obs) {
      doc.setFont(undefined, 'bold');
      addWrappedText('Outras observações do(a) Analista');
      doc.setFont(undefined, 'normal');
      addWrappedText(String(response.extra_obs));
    }

    if (!isApproved) {
      addVerticalSpace(headerSpacing);
      doc.setFont(undefined, 'bold');
      addWrappedText('Fim da checklist.');
      doc.setFont(undefined, 'normal');
    }

    // Numeração de páginas (rodapé)
    if (options.pageNumbers !== false) {
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(baseFontSize - 2);
        doc.setFont(undefined, 'normal');
        const text = `${i}/${pageCount}`;
        doc.text(text, pageWidth - marginRight, pageHeight - 4, { align: 'right' });
      }
      doc.setFontSize(baseFontSize);
    }

    return doc.output('bloburl');
  }

  window.Modules = window.Modules || {};
  window.Modules.checklistPDF = window.Modules.checklistPDF || {};
  window.Modules.checklistPDF.EXTRA_NON_CONFORMITY_CODE = EXTRA_NON_CONFORMITY_CODE;
  window.Modules.checklistPDF.getChecklistResult = getChecklistResult;
  window.Modules.checklistPDF.renderChecklistPDF = renderChecklistPDF;
})();
