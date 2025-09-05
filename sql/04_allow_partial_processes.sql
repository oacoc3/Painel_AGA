-- sql/04_allow_partial_processes.sql
-- Permite cadastrar processos apenas com NUP e Tipo
alter table processes
  alter column status drop not null,
  alter column status drop default,
  alter column status_since drop not null,
  alter column status_since drop default,
  alter column first_entry_date drop not null,
  alter column do_aga_start_date drop not null;

create or replace function trg_processes_set_doaga_start()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.first_entry_date is not null then
      new.do_aga_start_date := new.first_entry_date;
    end if;
  elsif tg_op = 'UPDATE' then
    if (old.status in ('SOB-DOC','SOB-TEC','SOB-PDIR','SOB-EXPL'))
       and (new.status not in ('SOB-DOC','SOB-TEC','SOB-PDIR','SOB-EXPL')) then
      new.do_aga_start_date := current_date;
    elsif old.first_entry_date is null
          and new.first_entry_date is not null
          and new.do_aga_start_date is null then
      new.do_aga_start_date := new.first_entry_date;
    end if;
  end if;
  return new;
end$$;
