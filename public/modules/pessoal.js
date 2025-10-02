// public/modules/pessoal.js
window.Modules = window.Modules || {};
window.Modules.pessoal = (() => {
  const el = id => document.getElementById(id);
  const state = {
    profiles: [],
    profileMap: new Map(),
  };

  function updateProfileMap(profile) {
    if (!profile || !profile.id) return;
    const current = state.profileMap.get(profile.id) || {};
    const next = {
      id: profile.id,
      name: profile.name != null ? profile.name : current.name,
      email: profile.email != null ? profile.email : current.email,
      role: profile.role != null ? profile.role : current.role,
      deleted_at: profile.deleted_at != null ? profile.deleted_at : current.deleted_at || null
    };
    state.profileMap.set(profile.id, next);
  }

  function registerProfiles(list = []) {
    list.forEach(updateProfileMap);
  }

  async function loadProfiles() {
    const { data, error } = await sb.rpc('admin_list_profiles');
    if (error) throw error;
    const list = Array.isArray(data) ? data : [];
    registerProfiles(list);
    state.profiles = list;
    return list;
  }

  async function ensureProfiles() {
    if (state.profiles.length) return state.profiles;
    try {
      return await loadProfiles();
    } catch (err) {
      console.error('[pessoal] Falha ao carregar perfis:', err);
      state.profiles = [];
      state.profileMap.clear();
      return [];
    }
  }

  function getProfileInfo(id) {
    if (!id) return null;
    return state.profileMap.get(id) || null;
  }

  function renderUserCell(user) {
    const info = user && typeof user === 'object' ? user : {};
    const wrap = document.createElement('div');
    wrap.className = 'audit-user-cell';
    const name = document.createElement('strong');
    name.textContent = info.name || info.email || '—';
    wrap.appendChild(name);
    if (info.email) {
      const email = document.createElement('div');
      email.className = 'muted';
      email.textContent = info.email;
      wrap.appendChild(email);
    }
    if (info.role) {
      const role = document.createElement('div');
      role.className = 'muted';
      role.textContent = info.role;
      wrap.appendChild(role);
    }
    if (info.deleted_at) {
      const status = document.createElement('div');
      status.className = 'muted';
      status.textContent = 'Inativo';
      wrap.appendChild(status);
    }
    return wrap;
  }

  const PRODUCTIVITY_COLUMNS = [
    { label: 'Usuário', render: row => renderUserCell(row) },
    { key: 'count', label: 'Checklists finalizadas', align: 'center' }
  ];

  const AVAILABILITY_COLUMNS = [
    { label: 'Usuário', render: row => renderUserCell(row.user) },
    { key: 'description', label: 'Descrição' },
    { key: 'starts_at', label: 'Início', value: row => Utils.fmtDateTime(row.starts_at) },
    { key: 'ends_at', label: 'Fim', value: row => Utils.fmtDateTime(row.ends_at) },
    { label: 'Registrado por', render: row => renderUserCell(row.creator) },
    { key: 'created_at', label: 'Registro', value: row => Utils.fmtDateTime(row.created_at) }
  ];

  function resetUnavailabilityForm() {
    const form = el('unavailabilityForm');
    if (!form) return;
    form.reset();
    Utils.setMsg('unavailabilityFormMsg', '');
    const startField = el('unavailabilityStart');
    const endField = el('unavailabilityEnd');
    const now = new Date();
    if (startField) startField.value = Utils.toDateTimeLocalValue(now);
    if (endField) {
      const later = new Date(now.getTime() + 60 * 60 * 1000);
      endField.value = Utils.toDateTimeLocalValue(later);
    }
  }

  function openUnavailabilityDialog() {
    const dlg = el('unavailabilityDialog');
    if (!dlg) return;
    resetUnavailabilityForm();
    try {
      dlg.showModal();
    } catch (err) {
      console.warn('[pessoal] Falha ao abrir popup de indisponibilidade:', err);
      dlg.setAttribute('open', '');
    }
    SafetyGuards?.fixButtonTypes?.(dlg);
  }

  async function submitUnavailability() {
    const msgId = 'unavailabilityFormMsg';
    const saveBtn = el('btnSaveUnavailability');
    if (saveBtn) saveBtn.disabled = true;
    const description = (el('unavailabilityDescription')?.value || '').trim();
    const startRaw = el('unavailabilityStart')?.value || '';
    const endRaw = el('unavailabilityEnd')?.value || '';

    if (!description || !startRaw || !endRaw) {
      Utils.setMsg(msgId, 'Preencha todos os campos.', true);
      if (saveBtn) saveBtn.disabled = false;
      return;
    }

    const startDate = new Date(startRaw);
    const endDate = new Date(endRaw);
    if (Number.isNaN(+startDate) || Number.isNaN(+endDate)) {
      Utils.setMsg(msgId, 'Datas inválidas.', true);
      if (saveBtn) saveBtn.disabled = false;
      return;
    }
    if (endDate <= startDate) {
      Utils.setMsg(msgId, 'O término deve ser posterior ao início.', true);
      if (saveBtn) saveBtn.disabled = false;
      return;
    }

    const user = await getUser();
    if (!user?.id) {
      Utils.setMsg(msgId, 'Sessão expirada.', true);
      if (saveBtn) saveBtn.disabled = false;
      return;
    }

    Utils.setMsg(msgId, 'Salvando indisponibilidade...');

    const payload = {
      profile_id: user.id,
      description,
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString()
    };

    try {
      const { error } = await sb.from('user_unavailabilities').insert(payload);
      if (error) throw error;

      try {
        await window.AppAudit?.recordEvent?.('unavailability_created', 'pessoal', {
          metadata: {
            starts_at: payload.starts_at,
            ends_at: payload.ends_at
          }
        });
      } catch (auditErr) {
        console.warn('[pessoal] Falha ao registrar auditoria de indisponibilidade:', auditErr);
      }

      Utils.setMsg(msgId, 'Indisponibilidade registrada.');
      const dlg = el('unavailabilityDialog');
      if (dlg?.open) dlg.close();
      resetUnavailabilityForm();
      await loadUnavailability();
    } catch (err) {
      console.error('[pessoal] Falha ao salvar indisponibilidade:', err);
      Utils.setMsg(msgId, err?.message || 'Falha ao salvar indisponibilidade.', true);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  async function loadProductivity() {
    const msgId = 'productivityMsg';
    const tableId = 'productivityList';
    Utils.setMsg(msgId, 'Carregando dados...');
    try {
      const profiles = await ensureProfiles();
      registerProfiles(profiles);
      const counts = new Map();

      if (profiles.length) {
        // >>> Correção: sem .group() e sem "count:id"; contamos no JS.
        const { data, error } = await sb
          .from('checklist_responses')
          .select('filled_by', { head: false })
          .eq('status', 'final')
          .not('filled_by', 'is', null);
        if (error) throw error;

        (data || []).forEach(row => {
          if (!row?.filled_by) return;
          counts.set(row.filled_by, (counts.get(row.filled_by) || 0) + 1);
        });
      }

      const rows = profiles
        .filter(p => p?.id)
        .map(profile => ({
          id: profile.id,
          name: profile.name || '',
          email: profile.email || '',
          role: profile.role || '',
          deleted_at: profile.deleted_at || null,
          count: counts.get(profile.id) || 0
        }))
        .sort((a, b) => {
          const aKey = (a.name || a.email || '').toLocaleLowerCase('pt-BR');
          const bKey = (b.name || b.email || '').toLocaleLowerCase('pt-BR');
          return aKey.localeCompare(bKey, 'pt-BR');
        });

      // Mantido seu padrão de chamada:
      Utils.renderTable(tableId, PRODUCTIVITY_COLUMNS, rows);
      Utils.setMsg(msgId, rows.length ? '' : 'Nenhum usuário encontrado.');
    } catch (err) {
      console.error('[pessoal] Falha ao carregar produtividade:', err);
      Utils.renderTable(tableId, PRODUCTIVITY_COLUMNS, []);
      Utils.setMsg(msgId, err?.message || 'Falha ao carregar dados.', true);
    }
  }

  async function loadUnavailability() {
    const msgId = 'availabilityMsg';
    const tableId = 'availabilityList';
    Utils.setMsg(msgId, 'Carregando indisponibilidades...');
    try {
      const { data, error } = await sb
        .from('user_unavailabilities')
        // >>> Correção: remover deleted_at dos relacionamentos
        .select('id,profile_id,description,starts_at,ends_at,created_at,created_by, profile:profile_id (id,name,email,role), creator:created_by (id,name,email,role)')
        .order('starts_at', { ascending: false });
      if (error) throw error;

      const rows = (data || []).map(item => {
        if (item.profile) registerProfiles([item.profile]);
        if (item.creator) registerProfiles([{ ...item.creator, id: item.created_by }]);
        const userInfo = item.profile || getProfileInfo(item.profile_id) || { id: item.profile_id };
        const creatorInfo = item.creator
          ? { id: item.created_by, ...item.creator }
          : (item.created_by ? { id: item.created_by, ...(getProfileInfo(item.created_by) || {}) } : null);
        return {
          id: item.id,
          description: item.description || '',
          starts_at: item.starts_at,
          ends_at: item.ends_at,
          created_at: item.created_at,
          user: userInfo,
          creator: creatorInfo
        };
      });

      Utils.renderTable(tableId, AVAILABILITY_COLUMNS, rows);
      Utils.setMsg(msgId, rows.length ? '' : 'Nenhuma indisponibilidade registrada.');
    } catch (err) {
      console.error('[pessoal] Falha ao carregar indisponibilidades:', err);
      Utils.renderTable(tableId, AVAILABILITY_COLUMNS, []);
      Utils.setMsg(msgId, err?.message || 'Falha ao carregar indisponibilidades.', true);
    }
  }

  function bindEvents() {
    el('btnNewUnavailability')?.addEventListener('click', ev => {
      ev.preventDefault();
      openUnavailabilityDialog();
    });
    el('btnSaveUnavailability')?.addEventListener('click', ev => {
      ev.preventDefault();
      submitUnavailability();
    });
    const dlg = el('unavailabilityDialog');
    if (dlg) {
      dlg.addEventListener('cancel', ev => {
        ev.preventDefault();
        dlg.close();
      });
      dlg.addEventListener('close', () => {
        resetUnavailabilityForm();
        Utils.setMsg('unavailabilityFormMsg', '');
      });
    }
  }

  function init() {
    bindEvents();
    resetUnavailabilityForm();
  }

  async function load() {
    await ensureProfiles();
    await Promise.allSettled([
      loadProductivity(),
      loadUnavailability()
    ]);
  }

  return { init, load };
})();
