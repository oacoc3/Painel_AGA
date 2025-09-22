-- sql/08_rename_checklist_category_to_type.sql
-- Renomeia checklist_templates.category para type (process_type)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'checklist_templates'
      and column_name = 'category'
  ) then
    alter table checklist_templates
      rename column category to type;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'checklist_templates'
      and column_name = 'type'
      and (data_type <> 'USER-DEFINED' or udt_name <> 'process_type')
  ) then
    alter table checklist_templates
      alter column type type process_type using type::process_type;
  end if;
end
$$;
