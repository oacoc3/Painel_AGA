// public/modules/validation-flags.js
// Utilitário compartilhado para sinalizações de validação de processos.
// Responsável por definir os tipos de cartões, construir formulários dinâmicos
// e consolidar o estado atual com base no histórico (tabela public.history).

window.Modules = window.Modules || {};
window.Modules.validationFlags = (() => {
  const CARD_TYPES = {
    leitura: {
      key: 'leitura',
      label: 'Leitura/Expedição',
      historyLabel: 'Leitura/Expedição',
      fields: [
        {
          name: 'timestamp',
          type: 'datetime-local',
          label: 'Data/hora da leitura da notificação ou expedição do SIGADAER',
          required: true
        },
        {
          name: 'tipo',
          type: 'text',
          label: 'Tipo da notificação ou do SIGADAER',
          required: true,
          placeholder: 'Ex.: Notificação, SIGADAER…'
        },
        {
          name: 'numero',
          type: 'text',
          label: 'Número do SIGADAER (se houver)',
          required: false
        },
        {
          name: 'observacao',
          type: 'textarea',
          label: 'Observação (se houver)',
          required: false
        }
      ]
    },
    pareceres: {
      key: 'pareceres',
      label: 'Pareceres/Info',
      historyLabel: 'Pareceres/Info',
      fields: [
        {
          name: 'timestamp',
          type: 'datetime-local',
          label: 'Data/hora do recebimento de pareceres internos/externos',
          required: true
        },
        {
          name: 'tipo',
          type: 'text',
          label: 'Tipo da notificação ou do SIGADAER',
          required: true,
          placeholder: 'Ex.: Parecer interno, SIGADAER…'
        },
        {
          name: 'numero',
          type: 'text',
          label: 'Número do SIGADAER (se houver)',
          required: false
        },
        {
          name: 'observacao',
          type: 'textarea',
          label: 'Observação (se houver)',
          required: false
        }
      ]
    },
    remocao: {
      key: 'remocao',
      label: 'Remoção/Rebaixamento',
      historyLabel: 'Remoção/Rebaixamento',
      fields: [
        {
          name: 'timestamp',
          type: 'datetime-local',
          label: 'Data/hora do recebimento da informação de remoção/rebaixamento',
          required: true
        },
        {
          name: 'tipo',
          type: 'text',
          label: 'Tipo da notificação ou do SIGADAER',
          required: true,
          placeholder: 'Ex.: Remoção, Rebaixamento…'
        },
        {
          name: 'numero',
          type: 'text',
          label: 'Número do SIGADAER (se houver)',
          required: false
        },
        {
          name: 'observacao',
          type: 'textarea',
          label: 'Observação (se houver)',
          required: false
        }
      ]
    },
    obra: {
      key: 'obra',
      label: 'Término de Obra',
      historyLabel: 'Término de Obra',
      fields: [
        {
          name: 'date',
          type: 'date',
          label: 'Data do término da obra',
          required: true
        },
        {
          name: 'numero',
          type: 'text',
          label: 'Número do SIGADAER (se houver)',
          required: false
        },
        {
          name: 'observacao',
          type: 'textarea',
          label: 'Observação (se houver)',
          required: false
        }
      ]
    },
    revogar: {
      key: 'revogar',
      label: 'Revogar plano',
      historyLabel: 'Revogar plano',
      fields: [
        {
          name: 'date',
          type: 'date',
          label: 'Data da inserção da informação do AD/HEL nas publicações AIS',
          required: true
        },
        {
          name: 'numero',
          type: 'text',
          label: 'Número do SIGADAER (se houver)',
          required: false
        },
        {
          name: 'observacao',
          type: 'textarea',
          label: 'Observação (se houver)',
          required: false
        }
      ]
    }
  };

  const ACTION_CARD_MAP = Object.values(CARD_TYPES).reduce((map, card) => {
    map.set(card.historyLabel.toLowerCase(), card.key);
    return map;
  }, new Map());

  function parseDetails(details) {
    if (!details) return {};
    if (typeof details === 'object' && !Array.isArray(details)) return details;
    if (typeof details === 'string') {
      try {
        return JSON.parse(details);
      } catch (_) {
        return {};
      }
    }
    return {};
  }

  function inferCardType(action = '', details = {}) {
    if (details && typeof details.card_type === 'string' && CARD_TYPES[details.card_type]) {
      return details.card_type;
    }
    const lower = String(action || '').toLowerCase();
    for (const [label, key] of ACTION_CARD_MAP.entries()) {
      if (lower.includes(label.toLowerCase())) return key;
    }
    return null;
  }

  function buildState(rows = []) {
    const state = new Map();
    rows.forEach(row => {
      if (!row || row.process_id == null) return;
      const details = parseDetails(row.details);
      const cardType = inferCardType(row.action, details);
      if (!cardType || !CARD_TYPES[cardType]) return;
      const procId = row.process_id;
      const procMap = state.get(procId) || new Map();
      const active = !String(row.action || '').toLowerCase().includes('rejeitada');
      procMap.set(cardType, {
        process_id: procId,
        card_type: cardType,
        action: row.action,
        details,
        created_at: row.created_at || null,
        active
      });
      state.set(procId, procMap);
    });
    return state;
  }

  async function fetchForProcesses(processIds = []) {
    if (!Array.isArray(processIds) || !processIds.length || !window.sb) {
      return new Map();
    }
    const unique = Array.from(new Set(processIds.filter(id => id != null)));
    if (!unique.length) return new Map();
    const { data, error } = await window.sb
      .from('history')
      .select('process_id,action,details,created_at')
      .in('process_id', unique)
      .ilike('action', 'Sinalização%')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return buildState(data || []);
  }

  function hasActive(state, processId, cardType) {
    if (!state || !state.size) return false;
    const procMap = state.get(processId);
    if (!procMap) return false;
    const entry = procMap.get(cardType);
    return !!entry?.active;
  }

  function getActiveCards(state, processId) {
    const procMap = state?.get(processId);
    if (!procMap) return [];
    return Array.from(procMap.values()).filter(entry => entry.active);
  }

  return {
    CARD_TYPES,
    parseDetails,
    buildState,
    fetchForProcesses,
    hasActive,
    getActiveCards,
    inferCardType
  };
})();
