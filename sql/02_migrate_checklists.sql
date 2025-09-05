-- sql/02_migrate_checklists.sql
-- Converte itens antigos [{code,text,...}] para estrutura de categorias
update checklist_templates
set items = jsonb_build_array(jsonb_build_object(
    'categoria', 'Geral',
    'itens', (
      select jsonb_agg(jsonb_build_object(
        'code', i->>'code',
        'requisito', coalesce(i->>'text', ''),
        'texto_sugerido', i->>'texto_sugerido'
      ))
      from jsonb_array_elements(items) as i
    )
))
where jsonb_typeof(items) = 'array'
  and (items->0 ? 'text');
