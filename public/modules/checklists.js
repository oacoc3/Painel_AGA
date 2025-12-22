diff --git a/public/modules/checklists.js b/public/modules/checklists.js
index a6c69bce1ce2ba471f5ce53398b1cb007c944f7f..1809bbb9f0b362d3e065d5a1d3c88ced2a554412 100644
--- a/public/modules/checklists.js
+++ b/public/modules/checklists.js
@@ -264,141 +264,159 @@ window.Modules.checklists = (() => {
     closeChecklistDialog();
     updateActionButtons();
     await loadTemplates();
   }
 
   async function loadTemplates() {
     const { data, error } = await sb.from('checklist_templates')
       .select('id,name,type,version,items,created_at,approved_at')
       .order('created_at', { ascending: false });
     if (error) { Utils.setMsg('ckMsg', error.message, true); return; }
 
     templates = (data || [])
       .map(row => ({
         ...row,
         // Normaliza para canônico em memória (ex.: 'OPEA - Documental' -> 'OPEA')
         type: canonicalizeChecklistType(row.type || '')
       }))
       .filter(row => CANONICAL_TYPES.has(row.type));
 
     selected = null;
     highlightRow(null);
     updateActionButtons();
     renderList();
   }
 
+  async function saveChecklistTemplate() {
+    const catsContainer = getCatsContainer();
+    const form = getForm();
+    const items = collectItems(catsContainer);
+
+    // Normaliza e valida o tipo
+    const rawType = form.querySelector('#ckCat')?.value || '';
+    const type = canonicalizeChecklistType(rawType);
+    const dbType = TYPE_DB_VALUE_MAP[type] || type;
+    if (!type || !CANONICAL_TYPES.has(type) || !items.length) {
+      return Utils.setMsg('ckMsg', 'Preencha todos os campos.', true);
+    }
+
+    const sessionOk = await ensureSessionActive('ckMsg');
+    if (!sessionOk) return;
+    const u = await getUser();
+    if (!u) return Utils.setMsg('ckMsg', 'Sessão expirada.', true);
+
+    const name = selected?.name?.trim() || TYPE_LABEL_MAP[type] || type;
+    const isEditingApproved = !!selected?.approved_at;
+
+    if (selected && !isEditingApproved) {
+      const { error } = await sb.from('checklist_templates')
+        .update({ name, type: dbType, items })
+        .eq('id', selected.id);
+      if (error) return Utils.setMsg('ckMsg', error.message, true);
+    } else {
+      // Busca a última versão diretamente na base para evitar conflitos de chave única
+      // em casos de cache desatualizado ou alterações concorrentes.
+      const { data: lastVersionRows, error: lastVersionError } = await sb.from('checklist_templates')
+        .select('version')
+        .eq('name', name)
+        .order('version', { ascending: false })
+        .limit(1);
+      if (lastVersionError) return Utils.setMsg('ckMsg', lastVersionError.message, true);
+
+      const lastVersion = lastVersionRows?.[0]?.version || 0;
+      const version = lastVersion + 1;
+      const payload = {
+        name,
+        type: dbType,
+        items,
+        version,
+        created_by: u.id,
+        approved_by: null,
+        approved_at: null
+      };
+      const { error } = await sb.from('checklist_templates')
+        .insert(payload);
+      if (error) return Utils.setMsg('ckMsg', error.message, true);
+    }
+
+    Utils.setMsg('ckMsg', 'Salvo.');
+    selected = null;
+    highlightRow(null);
+    closeChecklistDialog();
+    updateActionButtons();
+    await loadTemplates();
+  }
+
   function bindForm() {
     const dlg = getDialog();
     const catsContainer = getCatsContainer();
     const form = getForm();
 
     // (NOVO) Popular <select id="ckCat"> com opções canônicas
     const typeSelect = form?.querySelector('#ckCat');
     if (typeSelect) {
       typeSelect.innerHTML = CHECKLIST_TYPE_OPTIONS
         .map(opt => `<option value="${opt.value}">${opt.label}</option>`)
         .join('');
     }
 
     el('btnAddCat').addEventListener('click', () => addCategory(catsContainer));
     el('btnCloseChecklist').addEventListener('click', () => closeChecklistDialog());
     el('btnNewChecklist').addEventListener('click', () => {
       setCardMsg('');
       openChecklistDialog();
     });
     el('btnEditChecklist').addEventListener('click', () => {
       if (!selected) return;
       setCardMsg('');
       openChecklistDialog(selected);
     });
     el('btnDeleteChecklist').addEventListener('click', () => deleteSelectedChecklist('card'));
 
     dlg.addEventListener('cancel', ev => {
       ev.preventDefault();
       closeChecklistDialog();
     });
 
     renderCats(catsContainer);
     updateActionButtons();
 
-    el('adminBtnSalvarChecklist').addEventListener('click', async ev => {
-      ev.preventDefault();
-      const form = getForm();
-      const items = collectItems(catsContainer);
-
-      // Normaliza e valida o tipo
-      const rawType = form.querySelector('#ckCat')?.value || '';
-      const type = canonicalizeChecklistType(rawType);
-      const dbType = TYPE_DB_VALUE_MAP[type] || type;
-      if (!type || !CANONICAL_TYPES.has(type) || !items.length) {
-        return Utils.setMsg('ckMsg', 'Preencha todos os campos.', true);
+    form?.addEventListener('keydown', ev => {
+      const isSaveShortcut = (ev.ctrlKey || ev.metaKey) && ev.key?.toLowerCase() === 's';
+      if (isSaveShortcut) {
+        ev.preventDefault();
+        saveChecklistTemplate();
       }
+    });
 
-      const sessionOk = await ensureSessionActive('ckMsg');
-      if (!sessionOk) return;
-      const u = await getUser();
-      if (!u) return Utils.setMsg('ckMsg', 'Sessão expirada.', true);
-
-      const name = selected?.name?.trim() || TYPE_LABEL_MAP[type] || type;
-      const isEditingApproved = !!selected?.approved_at;
-
-      if (selected && !isEditingApproved) {
-        const { error } = await sb.from('checklist_templates')
-          .update({ name, type: dbType, items })
-          .eq('id', selected.id);
-        if (error) return Utils.setMsg('ckMsg', error.message, true);
-      } else {
-        // Busca a última versão diretamente na base para evitar conflitos de chave única
-        // em casos de cache desatualizado ou alterações concorrentes.
-        const { data: lastVersionRows, error: lastVersionError } = await sb.from('checklist_templates')
-          .select('version')
-          .eq('name', name)
-          .order('version', { ascending: false })
-          .limit(1);
-        if (lastVersionError) return Utils.setMsg('ckMsg', lastVersionError.message, true);
-
-        const lastVersion = lastVersionRows?.[0]?.version || 0;
-        const version = lastVersion + 1;
-        const payload = {
-          name,
-          type: dbType,
-          items,
-          version,
-          created_by: u.id,
-          approved_by: null,
-          approved_at: null
-        };
-        const { error } = await sb.from('checklist_templates')
-          .insert(payload);
-        if (error) return Utils.setMsg('ckMsg', error.message, true);
-      }
+    form?.addEventListener('submit', ev => {
+      ev.preventDefault();
+      saveChecklistTemplate();
+    });
 
-      Utils.setMsg('ckMsg', 'Salvo.');
-      selected = null;
-      highlightRow(null);
-      closeChecklistDialog();
-      updateActionButtons();
-      await loadTemplates();
+    el('adminBtnSalvarChecklist').addEventListener('click', async ev => {
+      ev.preventDefault();
+      await saveChecklistTemplate();
     });
 
     el('btnExcluirChecklist').addEventListener('click', () => deleteSelectedChecklist('dialog'));
 
     el('btnAprovarChecklist').addEventListener('click', async () => {
       if (!selected) return Utils.setMsg('ckMsg', 'Selecione um checklist antes de aprovar.', true);
       const sessionOk = await ensureSessionActive('ckMsg');
       if (!sessionOk) return;
       const u = await getUser();
       if (!u) return Utils.setMsg('ckMsg', 'Sessão expirada.', true);
       const { error } = await sb.from('checklist_templates')
         .update({ approved_by: u.id, approved_at: new Date().toISOString() })
         .eq('id', selected.id);
       if (error) return Utils.setMsg('ckMsg', error.message, true);
       Utils.setMsg('ckMsg', 'Checklist aprovada.');
       await loadTemplates();
     });
   }
 
   function init() { bindForm(); }
   async function load() { await loadTemplates(); }
 
   return { init, load, openChecklistDialog, closeChecklistDialog };
 })();
