// public/modules/pessoal.js
window.Modules = window.Modules || {};
window.Modules.pessoal = (() => {
  const el = id => document.getElementById(id);
  const state = {
    profiles: [],
    profileMap: new Map(),
    // >>> Patch: novos estados para produtividade semanal
    productivityWeekData: new Map(),
    productivityWeeks: [],
    productivitySelectedWeek: null,
    productivityWeekIndex: 0,
    productivityProfiles: [],
    // <<< Patch
    unavailabilityEditingId: null
  };

  function isAdminRole() {
    return (AccessGuards?.getRole ? AccessGuards.getRole() : null) === 'Administrador';
  }

  // Novos valores (patch)
  const REV_OACO_HISTORY_ACTION = 'Status REV-OACO registrado'; // Ação registrada no histórico (REV-OACO = Revisão OACO, conforme sua nomenclatura)
  const ANALISTA_OACO_ROLE = 'Analista OACO'; // Papel interno usado no seu sistema
  const PRODUCTIVITY_FIRST_WEEK_ISO = '2025-10-06';
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

  // >>> Patch: helpers de papel/semana/contagem
  function isAnalistaOacoRole(role) {
    return String(role || '').trim().toLowerCase() === ANALISTA_OACO_ROLE.toLowerCase();
  }

  // Segunda-feira como início da semana
  function getWeekStart(dateInput) {
    if (!dateInput) return null;
    const src = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput);
    if (!src || Number.isNaN(+src)) return null;
    const result = new Date(src.getTime());
    const day = result.getDay(); // 0 (domingo) .. 6 (sábado)
    const diff = (day + 6) % 7; // desloca para segunda=0
    result.setHours(0, 0, 0, 0);
    result.setDate(result.getDate() - diff);
    return result;
  }

  function getProductivityFirstWeekStart() {
    return getWeekStart(PRODUCTIVITY_FIRST_WEEK_ISO);
  }

  function formatWeekKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function ensureWeekEntry(map, dateInput) {
    const start = getWeekStart(dateInput);
    if (!start) return null;
    const key = formatWeekKey(start);
    let entry = map.get(key);
    if (!entry) {
      const end = new Date(start.getTime());
      end.setDate(end.getDate() + 6);
      entry = {
        key,
        start,
        end,
        docNoReview: new Map(),
        docWithReview: new Map(),
        notifNoReview: new Map(),
        notifWithReview: new Map(),
        label: ''
      };
      map.set(key, entry);
    }
    return entry;
  }

  function formatWeekLabel(entry) {
    if (!entry) return '';
    if (!entry.label) {
      const startLabel = Utils.fmtDate(entry.start);
      const endLabel = Utils.fmtDate(entry.end);
      entry.label = startLabel && endLabel
        ? `${startLabel} – ${endLabel}`
        : (startLabel || endLabel || '');
    }
    return entry.label;
  }

  function incrementProductivity(map, profileId) {
    if (!map || !profileId) return;
    map.set(profileId, (map.get(profileId) || 0) + 1);
  }

  function buildContinuousWeeks(weekData) {
    const map = weekData instanceof Map ? weekData : new Map();
    const baseline = getProductivityFirstWeekStart();
    if (!baseline) return [];

    const baselineEntry = ensureWeekEntry(map, baseline);
    let maxStartTime = baselineEntry?.start?.getTime() ?? baseline.getTime();

    map.forEach(entry => {
      if (!entry?.start) return;
      const entryTime = entry.start.getTime();
      if (entryTime > maxStartTime) maxStartTime = entryTime;
    });

    const currentWeek = getWeekStart(new Date());
    if (currentWeek && currentWeek.getTime() > maxStartTime) {
      maxStartTime = currentWeek.getTime();
    }

    const weeks = [];
    for (let time = baseline.getTime(); time <= maxStartTime; time += MS_PER_WEEK) {
      const entry = ensureWeekEntry(map, new Date(time));
      if (entry) weeks.push(entry);
    }

    return weeks;
  }
  // <<< Patch

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

  function getCurrentProfileInfo() {
    const profile = window.APP_PROFILE || null;
    if (profile?.id) {
      registerProfiles([{ id: profile.id, ...profile }]);
      return { id: profile.id, ...profile };
    }
    return null;
  }

  function getCurrentProfileId() {
    return getCurrentProfileInfo()?.id || null;
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

  function renderUserCell(user, { hideEmail = false } = {}) {
    const info = user && typeof user === 'object' ? user : {};
    const wrap = document.createElement('div');
    wrap.className = 'audit-user-cell';
    const name = document.createElement('strong');
    name.textContent = info.name || info.email || '—';
    wrap.appendChild(name);
    if (info.email && !hideEmail) {
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

  // Lista somente Analistas OACO (ativos por padrão)
  function getAnalistaOacoProfiles({ includeInactive = false } = {}) {
    const profiles = Array.isArray(state.profiles) ? state.profiles : [];
    return profiles
      .filter(profile => {
        if (!profile?.id) return false;
        if (!isAnalistaOacoRole(profile.role)) return false;
        if (!includeInactive && profile.deleted_at) return false;
        return true;
      })
      .sort((a, b) => {
        const labelA = (a.name || a.email || '').toLocaleLowerCase('pt-BR');
        const labelB = (b.name || b.email || '').toLocaleLowerCase('pt-BR');
        return labelA.localeCompare(labelB, 'pt-BR');
      });
  }

  // Preenche o <select id="unavailabilityProfile">
  function renderUnavailabilityProfileOptions(options = {}) {
    const { selectedId = null, restrictToSelf = false } = options || {};
    const select = el('unavailabilityProfile');
    if (!select) return false;

    const previousValue = selectedId != null ? String(selectedId) : select.value;
    select.innerHTML = '';

    let profiles = getAnalistaOacoProfiles();
    if (restrictToSelf) {
      const currentProfile = getCurrentProfileInfo();
      const currentId = currentProfile?.id ? String(currentProfile.id) : null;
      profiles = profiles.filter(profile => !currentId || String(profile.id) === currentId);
      if (currentProfile && currentId && !profiles.some(profile => String(profile.id) === currentId)) {
        profiles.push(currentProfile);
      }
    }

    if (!profiles.length) {
      select.disabled = true;
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Nenhum Analista OACO disponível';
      option.disabled = true;
      option.selected = true;
      option.defaultSelected = true;
      select.appendChild(option);
      return false;
    }

    select.disabled = restrictToSelf && profiles.length <= 1;
    if (!restrictToSelf) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Selecione um Analista OACO';
      placeholder.disabled = true;
      placeholder.hidden = true;
      placeholder.selected = true;
      placeholder.defaultSelected = true;
      select.appendChild(placeholder);
    }

    let matchValue = '';
    const fragment = document.createDocumentFragment();
    profiles.forEach(profile => {
      const option = document.createElement('option');
      option.value = String(profile.id);
      const displayName = (profile.name || '').trim();
      const email = (profile.email || '').trim();
      if (displayName && email) {
        option.textContent = `${displayName} (${email})`;
      } else {
        option.textContent = displayName || email || option.value;
      }
      if (previousValue && String(profile.id) === previousValue) {
        matchValue = option.value;
      }
      fragment.appendChild(option);
    });
    select.appendChild(fragment);

    if (matchValue) {
      select.value = matchValue;
    } else if (selectedId != null) {
      select.value = String(selectedId);
    } else {
      select.value = '';
    }

    return true;
  }

  // Normaliza "details" do histórico
  function normalizeHistoryDetails(details) {
    if (!details) return null;
    if (typeof details === 'object') return details;
    if (typeof details === 'string') {
      try { return JSON.parse(details); } catch (_) { return null; }
    }
    return null;
  }

  // Colunas de produtividade
  const PRODUCTIVITY_COLUMNS = [
    { label: 'Usuário', render: row => renderUserCell(row) },
    { key: 'doc_no_review', label: 'Análises documentais sem necessidade de revisão', align: 'center' },
    { key: 'doc_with_review', label: 'Análises documentais com necessidade de revisão', align: 'center' },
    { key: 'notif_no_review', label: 'Notificações sem necessidade de revisão', align: 'center' },
    { key: 'notif_with_review', label: 'Notificações com necessidade de revisão', align: 'center' }
  ];

  function renderUnavailabilityActions(row) {
    const wrap = document.createElement('div');
    wrap.className = 'table-actions';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Editar';
    btn.addEventListener('click', () => {
      if (!isAdminRole()) {
        const message = AccessGuards?.message || 'Função não disponível para o seu perfil de acesso.';
        try { window.alert(message); } catch (_) { /* ignore */ }
        return;
      }
      openUnavailabilityDialog(row);
    });
    wrap.appendChild(btn);
    return wrap;
  }

  const AVAILABILITY_COLUMNS = [
    { label: 'Usuário', render: row => renderUserCell(row.user) },
    { key: 'description', label: 'Descrição' },
    { key: 'starts_at', label: 'Início', value: row => Utils.fmtDateTime(row.starts_at) },
    { key: 'ends_at', label: 'Fim', value: row => Utils.fmtDateTime(row.ends_at) },
    { label: 'Registrado por', render: row => renderUserCell(row.creator, { hideEmail: true }) },
    { key: 'created_at', label: 'Registro', value: row => Utils.fmtDateTime(row.created_at) },
    { label: 'Ações', render: row => renderUnavailabilityActions(row) }
  ];

  function resetUnavailabilityForm(options = {}) {
    const defaults = {
      selectedProfileId: null,
      restrictToSelf: false,
      description: '',
      startsAt: null,
      endsAt: null,
      editingId: null
    };
    const opts = { ...defaults, ...options };

    const form = el('unavailabilityForm');
    if (!form) return false;

    state.unavailabilityEditingId = opts.editingId || null;

    const hasProfiles = renderUnavailabilityProfileOptions({
      selectedId: opts.selectedProfileId,
      restrictToSelf: opts.restrictToSelf
    });

    form.reset();
    Utils.setMsg('unavailabilityFormMsg', '');

    const profileField = el('unavailabilityProfile');
    if (profileField) {
      if (opts.selectedProfileId) {
        profileField.value = String(opts.selectedProfileId);
      } else {
        profileField.value = '';
      }
      if (!hasProfiles) {
        profileField.setAttribute('disabled', '');
      } else if (opts.restrictToSelf) {
        profileField.setAttribute('disabled', '');
      } else {
        profileField.removeAttribute('disabled');
      }
    }
    const startField = el('unavailabilityStart');
    const endField = el('unavailabilityEnd');
    const now = new Date();
    const rawStart = opts.startsAt ?? now;
    const startDate = rawStart instanceof Date ? rawStart : new Date(rawStart);
    const validStart = Number.isNaN(+startDate) ? now : startDate;
    if (startField) {
      startField.value = Utils.toDateTimeLocalValue(validStart);
    }
    const rawEnd = opts.endsAt ?? null;
    const computedEnd = rawEnd != null ? (rawEnd instanceof Date ? rawEnd : new Date(rawEnd)) : new Date(validStart.getTime() + 60 * 60 * 1000);
    const validEnd = Number.isNaN(+computedEnd) ? new Date(validStart.getTime() + 60 * 60 * 1000) : computedEnd;
    if (endField) {
      endField.value = Utils.toDateTimeLocalValue(validEnd);
    }
    const descriptionField = el('unavailabilityDescription');
    if (descriptionField) {
      descriptionField.value = opts.description || '';
    }
    const saveBtn = el('btnSaveUnavailability');
    if (saveBtn) {
      saveBtn.disabled = !hasProfiles;
      saveBtn.textContent = state.unavailabilityEditingId ? 'Salvar alterações' : 'Salvar';
    }

    form.dataset.mode = state.unavailabilityEditingId ? 'edit' : 'create';
    form.dataset.editId = state.unavailabilityEditingId ? String(state.unavailabilityEditingId) : '';

    return hasProfiles;
  }

  async function openUnavailabilityDialog(row = null) {
    const dlg = el('unavailabilityDialog');
    if (!dlg) return;
    try {
      await ensureProfiles();
    } catch (err) {
      console.error('[pessoal] Falha ao carregar perfis antes do popup de indisponibilidade:', err);
    }
    const restrictToSelf = !isAdminRole() && !!getCurrentProfileId();
    const selectedProfileId = row?.profile_id || row?.user?.id || (restrictToSelf ? getCurrentProfileId() : null);
    const hasProfiles = resetUnavailabilityForm({
      selectedProfileId,
      restrictToSelf,
      description: row?.description || '',
      startsAt: row?.starts_at || null,
      endsAt: row?.ends_at || null,
      editingId: row?.id || null
    });
    if (!hasProfiles) {
      Utils.setMsg('unavailabilityFormMsg', 'Nenhum Analista OACO disponível para registrar indisponibilidade.', true);
    }
    const title = dlg.querySelector('h3');
    if (title) {
      title.textContent = row ? 'Editar indisponibilidade' : 'Registrar indisponibilidade';
    }
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
    const profileId = (el('unavailabilityProfile')?.value || '').trim();
    const description = (el('unavailabilityDescription')?.value || '').trim();
    const startRaw = el('unavailabilityStart')?.value || '';
    const endRaw = el('unavailabilityEnd')?.value || '';

    if (!profileId) {
      Utils.setMsg(msgId, 'Selecione um Analista OACO.', true);
      if (saveBtn) saveBtn.disabled = false;
      return;
    }

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

    const currentProfileId = getCurrentProfileId();
    if (!isAdminRole() && currentProfileId && profileId !== String(currentProfileId)) {
      Utils.setMsg(msgId, 'Você só pode registrar indisponibilidades para o seu usuário.', true);
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
      profile_id: profileId,
      description,
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString()
    };
    const editingId = state.unavailabilityEditingId;

    try {
      if (editingId) {
        if (!isAdminRole()) {
          Utils.setMsg(msgId, 'Apenas administradores podem editar indisponibilidades.', true);
          if (saveBtn) saveBtn.disabled = false;
          return;
        }
        const { error } = await sb
          .from('user_unavailabilities')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        Utils.setMsg(msgId, 'Indisponibilidade atualizada.');
      } else {
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
      }
      const dlg = el('unavailabilityDialog');
      if (dlg?.open) dlg.close();
      resetUnavailabilityForm({ restrictToSelf: !isAdminRole() && !!getCurrentProfileId() });
      await loadUnavailability();
    } catch (err) {
      console.error('[pessoal] Falha ao salvar indisponibilidade:', err);
      Utils.setMsg(msgId, err?.message || 'Falha ao salvar indisponibilidade.', true);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  // >>> Patch: filtros/tabela por semana
  function renderProductivityWeekFilters() {
    const container = el('productivityWeekFilters');
    if (!container) return;
    container.innerHTML = '';
    const weeks = state.productivityWeeks || [];
    if (!weeks.length) {
      container.classList.add('hidden');
      return;
    }

    const maxIndex = weeks.length - 1;
    let currentIndex = state.productivityWeekIndex ?? 0;
    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex > maxIndex) currentIndex = maxIndex;
    state.productivityWeekIndex = currentIndex;
    const currentWeek = weeks[currentIndex];
    state.productivitySelectedWeek = currentWeek?.key || null;

    container.classList.remove('hidden');
    container.setAttribute('role', 'navigation');

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.textContent = '‹ Semana anterior';
    prevBtn.className = 'week-nav-btn';
    prevBtn.disabled = currentIndex <= 0;
    prevBtn.addEventListener('click', () => setProductivityWeekIndex(currentIndex - 1));
    container.appendChild(prevBtn);

    const info = document.createElement('div');
    info.className = 'week-selector-info';

    const label = document.createElement('strong');
    label.className = 'week-selector-label';
    label.textContent = formatWeekLabel(currentWeek);
    info.appendChild(label);

    const counter = document.createElement('span');
    counter.className = 'week-selector-count muted';
    counter.textContent = `${currentIndex + 1} de ${weeks.length}`;
    info.appendChild(counter);

    container.appendChild(info);

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.textContent = 'Semana seguinte ›';
    nextBtn.className = 'week-nav-btn';
    nextBtn.disabled = currentIndex >= maxIndex;
    nextBtn.addEventListener('click', () => setProductivityWeekIndex(currentIndex + 1));
    container.appendChild(nextBtn);
  }

  function renderProductivityTable() {
    const msgId = 'productivityMsg';
    const tableId = 'productivityList';
    const weekKey = state.productivitySelectedWeek;

    if (!state.productivityProfiles.length) {
      Utils.renderTable(tableId, PRODUCTIVITY_COLUMNS, []);
      Utils.setMsg(msgId, 'Nenhum Analista OACO cadastrado.');
      return;
    }

    const entry = weekKey ? state.productivityWeekData.get(weekKey) : null;
    const rows = state.productivityProfiles.map(profile => ({
      id: profile.id,
      name: profile.name || '',
      email: profile.email || '',
      role: profile.role || '',
      deleted_at: profile.deleted_at || null,
      doc_no_review: entry?.docNoReview?.get(profile.id) || 0,
      doc_with_review: entry?.docWithReview?.get(profile.id) || 0,
      notif_no_review: entry?.notifNoReview?.get(profile.id) || 0,
      notif_with_review: entry?.notifWithReview?.get(profile.id) || 0
    }));

    const hasData = rows.some(row =>
      row.doc_no_review || row.doc_with_review || row.notif_no_review || row.notif_with_review
    );

    Utils.renderTable(tableId, PRODUCTIVITY_COLUMNS, rows);

    if (!entry) {
      Utils.setMsg(msgId, 'Nenhum dado de produtividade encontrado.');
    } else {
      Utils.setMsg(msgId, hasData ? '' : 'Nenhum registro de produtividade na semana selecionada.');
    }
  }

  function setProductivityWeekIndex(nextIndex) {
    const weeks = state.productivityWeeks || [];
    if (!weeks.length) return;
    const maxIndex = weeks.length - 1;
    const clampedIndex = Math.max(0, Math.min(nextIndex, maxIndex));
    if (state.productivityWeekIndex === clampedIndex) return;
    state.productivityWeekIndex = clampedIndex;
    state.productivitySelectedWeek = weeks[clampedIndex]?.key || null;
    renderProductivityWeekFilters();
    renderProductivityTable();
  }

  function setProductivityWeek(weekKey) {
    if (!weekKey) return;
    const weeks = state.productivityWeeks || [];
    const index = weeks.findIndex(week => week.key === weekKey);
    if (index === -1) return;
    setProductivityWeekIndex(index);
  }
  // <<< Patch

  async function loadProductivity() {
    const msgId = 'productivityMsg';
    const tableId = 'productivityList';
    const weekBox = el('productivityWeekFilters');

    Utils.setMsg(msgId, 'Carregando dados...');
    Utils.renderTable(tableId, PRODUCTIVITY_COLUMNS, []);
    if (weekBox) {
      weekBox.innerHTML = '';
      weekBox.classList.add('hidden');
    }

    try {
      const profiles = await ensureProfiles();
      registerProfiles(profiles);

      const weekData = new Map();

      // Considera somente Analista OACO dos perfis cadastrados
      const baseProfiles = (profiles || [])
        .filter(profile => profile?.id && isAnalistaOacoRole(profile.role));
      const profileById = new Map(baseProfiles.map(profile => [profile.id, profile]));
      const extraProfiles = new Map(); // Perfis que aparecem apenas no histórico

      const registerHistoryProfile = (info) => {
        if (!info?.analyst_id) return null;
        const normalizedRole = info.analyst_role || ANALISTA_OACO_ROLE;
        const profileInfo = {
          id: info.analyst_id,
          name: info.analyst_name || '',
          email: info.analyst_email || '',
          role: normalizedRole,
          deleted_at: null
        };
        updateProfileMap(profileInfo);
        if (!isAnalistaOacoRole(profileInfo.role)) return null;

        if (profileById.has(profileInfo.id)) {
          const current = profileById.get(profileInfo.id) || {};
          profileById.set(profileInfo.id, {
            ...current,
            name: current.name || profileInfo.name,
            email: current.email || profileInfo.email,
            role: current.role || profileInfo.role,
            deleted_at: current.deleted_at ?? profileInfo.deleted_at
          });
        } else {
          extraProfiles.set(profileInfo.id, profileInfo);
        }
        return profileInfo;
      };

      // Busca histórico de ações "REV-OACO"
      const { data: historyData, error: historyError } = await sb
        .from('history')
        .select('details')
        .eq('action', REV_OACO_HISTORY_ACTION);
      if (historyError) throw historyError;

      (historyData || []).forEach(row => {
        const details = normalizeHistoryDetails(row?.details);
        if (!details) return;

        const doc = details.document_analysis;
        const notif = details.notification;

        if (doc?.analyst_id) {
          const profileInfo = registerHistoryProfile(doc);
          const dateSource = doc?.performed_at || details.status_since;
          const entry = ensureWeekEntry(weekData, dateSource);
          if (profileInfo && entry) {
            incrementProductivity(doc?.needs_review ? entry.docWithReview : entry.docNoReview, profileInfo.id);
          }
        }

        if (notif?.analyst_id) {
          const profileInfo = registerHistoryProfile(notif);
          const dateSource = notif?.performed_at || details.status_since;
          const entry = ensureWeekEntry(weekData, dateSource);
          if (profileInfo && entry) {
            incrementProductivity(notif?.needs_review ? entry.notifWithReview : entry.notifNoReview, profileInfo.id);
          }
        }
      });

      // Une os perfis que vieram apenas do histórico
      extraProfiles.forEach((profile, id) => {
        if (!profileById.has(id)) profileById.set(id, profile);
      });

      const combinedProfiles = Array.from(profileById.values())
        .sort((a, b) => {
          const aKey = (a.name || a.email || '').toLocaleLowerCase('pt-BR');
          const bKey = (b.name || b.email || '').toLocaleLowerCase('pt-BR');
          return aKey.localeCompare(bKey, 'pt-BR');
        });

      state.productivityProfiles = combinedProfiles;
      state.productivityWeekData = weekData;

      const weeks = buildContinuousWeeks(weekData);
      state.productivityWeeks = weeks;

      // Escolhe semana atual quando existir; senão, última semana disponível
      if (weeks.length) {
        let selectedKey = state.productivitySelectedWeek;
        const currentWeekStart = getWeekStart(new Date());
        const currentWeekKey = currentWeekStart ? formatWeekKey(currentWeekStart) : null;

        if (!selectedKey || !weeks.some(week => week.key === selectedKey)) {
          const currentIndex = currentWeekKey
            ? weeks.findIndex(week => week.key === currentWeekKey)
            : -1;
          if (currentIndex !== -1) {
            selectedKey = weeks[currentIndex].key;
          } else {
            selectedKey = weeks[weeks.length - 1].key;
          }
        }

        let index = weeks.findIndex(week => week.key === selectedKey);
        if (index === -1 && currentWeekKey) {
          index = weeks.findIndex(week => week.key === currentWeekKey);
        }
        if (index === -1) index = weeks.length - 1;

        state.productivityWeekIndex = Math.max(0, index);
        state.productivitySelectedWeek = weeks[state.productivityWeekIndex]?.key || null;
      } else {
        state.productivityWeekIndex = 0;
        state.productivitySelectedWeek = null;
      }

      renderProductivityWeekFilters();
      renderProductivityTable();
    } catch (err) {
      console.error('[pessoal] Falha ao carregar produtividade:', err);
      state.productivityProfiles = [];
      state.productivityWeekData = new Map();
      state.productivityWeeks = [];
      state.productivitySelectedWeek = null;
      state.productivityWeekIndex = 0;
      const weekBox = el('productivityWeekFilters');
      if (weekBox) {
        weekBox.innerHTML = '';
        weekBox.classList.add('hidden');
      }
      Utils.renderTable('productivityList', PRODUCTIVITY_COLUMNS, []);
      Utils.setMsg('productivityMsg', err?.message || 'Falha ao carregar dados.', true);
    }
  }

  async function loadUnavailability() {
    const msgId = 'availabilityMsg';
    const tableId = 'availabilityList';
    Utils.setMsg(msgId, 'Carregando indisponibilidades...');
    try {
      const { data, error } = await sb
        .from('user_unavailabilities')
        // Mantém relacionamentos sem deleted_at
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
          profile_id: item.profile_id,
          description: item.description || '',
          starts_at: item.starts_at,
          ends_at: item.ends_at,
          created_at: item.created_at,
          created_by: item.created_by,
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
        const restrictToSelf = !isAdminRole() && !!getCurrentProfileId();
        resetUnavailabilityForm({
          restrictToSelf,
          selectedProfileId: restrictToSelf ? getCurrentProfileId() : null
        });
        const title = dlg.querySelector('h3');
        if (title) title.textContent = 'Registrar indisponibilidade';
        Utils.setMsg('unavailabilityFormMsg', '');
      });
    }
  }

  function init() {
    bindEvents();
    const restrictToSelf = !isAdminRole() && !!getCurrentProfileId();
    resetUnavailabilityForm({
      restrictToSelf,
      selectedProfileId: restrictToSelf ? getCurrentProfileId() : null
    });
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
