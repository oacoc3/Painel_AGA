-- sql/01_schema_and_policies.sql
-- =========================================================
-- 01_schema_and_policies.sql  (versão ajustada sem recursão)
-- =========================================================

-- Extensões necessárias
create extension if not exists moddatetime with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- =========================
-- ENUMs
-- =========================
create type user_role as enum ('Administrador','Analista OACO','Analista OAGA','CH OACO','CH OAGA','CH AGA','Visitante');

create type process_type as enum ('PDIR','Inscrição','Alteração','Exploração','OPEA');

create type process_status as enum (
  'CONFEC','REV-OACO','APROV','ICA-PUB','EDICAO','AGD-LEIT',
  'ANADOC','ANATEC-PRE','ANATEC','ANAICA',
  'SOB-DOC','SOB-TEC','SOB-PDIR','SOB-EXPL',
  'ARQ'
);

create type opinion_type as enum ('ATM','DT','CGNA');
create type opinion_status as enum ('SOLICITADO','RECEBIDO');

create type notification_type as enum (
  'FAV','FAV-TERM','TERM-ATRA',
  'DESF-NAO_INI','DESF_JJAER','DESF-REM_REB',
  'NCD','NCT'
);
create type notification_status as enum ('SOLICITADA','LIDA');

create type sigadaer_type as enum ('COMAE','COMPREP','COMGAP','GABAER','SAC','ANAC','OPR_AD','PREF','GOV','OUTRO');
create type sigadaer_status as enum ('SOLICITADO','EXPEDIDO','RECEBIDO');

-- =========================
-- Helpers
-- =========================

-- ID do usuário autenticado (conveniência)
create or replace function current_user_id() returns uuid
language sql stable as $$
  select auth.uid();
$$;

-- >>> NOVO: Leitura do papel a partir do JWT (JSON Web Token)
-- Evita SELECT em 'profiles' dentro das policies de 'profiles' (sem recursão)
create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'user_metadata' ->> 'role','') = 'Administrador';
$$;

create or replace function has_write_role()
returns boolean
language sql
stable
as $$
  select (auth.jwt() -> 'user_metadata' ->> 'role') in
         ('Administrador','Analista OACO','Analista OAGA','CH OACO','CH OAGA','CH AGA');
$$;

-- =========================
-- Tabelas
-- =========================

-- Perfis (amarrado a auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null,
  role user_role not null default 'Visitante',
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated_at
before update on profiles
for each row execute function extensions.moddatetime(updated_at);

-- Processos
create table processes (
  id uuid primary key default gen_random_uuid(),
  nup text not null unique,
  type process_type not null,
  status process_status,
  status_since timestamptz,
  obra_termino_date date,
  obra_concluida boolean not null default false,
  first_entry_date date,
  do_aga_start_date date, -- base para prazo DO-AGA (reinicia quando sair de SOB-*)
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nup_format check (nup ~ '^[0-9]{5}\.[0-9]{6}/[0-9]{4}-[0-9]{2}$')
);
comment on column processes.do_aga_start_date is 'Data base do prazo de 60 dias da DO-AGA. Inicia em first_entry_date e reinicia quando sai de SOB-*.';
create trigger trg_processes_updated_at
before update on processes
for each row execute function extensions.moddatetime(updated_at);

-- Pareceres internos
create table internal_opinions (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references processes(id) on delete cascade,
  type opinion_type not null,
  requested_at timestamptz not null,
  status opinion_status not null default 'SOLICITADO',
  received_at timestamptz,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_internal_opinions_updated_at
before update on internal_opinions
for each row execute function extensions.moddatetime(updated_at);

-- Único por (processo,tipo) quando pendente
create unique index uidx_opinion_pending on internal_opinions(process_id,type)
where status = 'SOLICITADO';

-- Notificações
create table notifications (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references processes(id) on delete cascade,
  type notification_type not null,
  requested_at timestamptz not null,
  status notification_status not null default 'SOLICITADA',
  read_at timestamptz,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_notifications_updated_at
before update on notifications
for each row execute function extensions.moddatetime(updated_at);

create unique index uidx_notification_pending on notifications(process_id,type)
where status = 'SOLICITADA';

-- SIGADAER
create table sigadaer (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references processes(id) on delete cascade,
  type sigadaer_type not null,
  requested_at timestamptz not null,
  status sigadaer_status not null default 'SOLICITADO',
  expedit_at timestamptz,
  received_at timestamptz,
  numbers integer[], -- números de 6 dígitos (validado no frontend)
  notes text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_sigadaer_updated_at
before update on sigadaer
for each row execute function extensions.moddatetime(updated_at);

-- Modelos
create table models (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  content text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_models_updated_at
before update on models
for each row execute function extensions.moddatetime(updated_at);

-- Checklists
create table checklist_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  version int not null default 1,
  -- Estrutura: [{categoria, itens:[{code,requisito,texto_sugerido}]}]
  items jsonb not null,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (name, version)
);
create table checklist_responses (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references processes(id) on delete cascade,
  template_id uuid not null references checklist_templates(id),
  answers jsonb not null, -- [{code,value,obs?},...]
  extra_obs text,
  filled_by uuid not null references profiles(id),
  filled_at timestamptz not null default now()
);

-- Auditoria
create table audit_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  user_id uuid,
  user_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb
);

-- =========================
-- Triggers & Regras de negócio
-- =========================

-- DO-AGA start date
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
create trigger trg_processes_doaga_start
before insert or update on processes
for each row execute function trg_processes_set_doaga_start();

-- Parecer interno só com status ANATEC-PRE ou ANATEC
create or replace function check_opinion_allowed()
returns trigger language plpgsql as $$
declare ps process_status;
begin
  select status into ps from processes where id = new.process_id;
  if ps not in ('ANATEC-PRE','ANATEC') then
    raise exception 'Parecer interno só pode ser cadastrado quando processo está ANATEC-PRE ou ANATEC';
  end if;
  return new;
end$$;
create trigger trg_opinion_allowed
before insert on internal_opinions
for each row execute function check_opinion_allowed();

-- Notificação só com status ANADOC, ANATEC-PRE, ANATEC, ANAICA
create or replace function check_notification_allowed()
returns trigger language plpgsql as $$
declare ps process_status;
begin
  select status into ps from processes where id = new.process_id;
  if ps not in ('ANADOC','ANATEC-PRE','ANATEC','ANAICA') then
    raise exception 'Notificação só pode ser cadastrada quando processo está ANADOC, ANATEC-PRE, ANATEC ou ANAICA';
  end if;
  return new;
end$$;
create trigger trg_notification_allowed
before insert on notifications
for each row execute function check_notification_allowed();

-- NCD/NCT LIDA → muda status do processo
create or replace function trg_notification_set_process_status()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'UPDATE') and (new.status = 'LIDA') then
    if new.type = 'NCD' then
      update processes set status='SOB-DOC' where id = new.process_id;
    elsif new.type = 'NCT' then
      update processes set status='SOB-TEC' where id = new.process_id;
    end if;
  end if;
  return new;
end$$;
create trigger trg_notifications_status_update
after update on notifications
for each row execute function trg_notification_set_process_status();

-- SIGADAER: RECEBIDO só após EXPEDIDO
create or replace function check_sigadaer_transition()
returns trigger language plpgsql as $$
begin
  if new.status = 'RECEBIDO' and old.status <> 'EXPEDIDO' then
    raise exception 'SIGADAER só pode ser RECEBIDO após EXPEDIDO';
  end if;
  return new;
end$$;
create trigger trg_sigadaer_transition
before update on sigadaer
for each row execute function check_sigadaer_transition();

-- Auditoria genérica
create or replace function add_audit_log()
returns trigger language plpgsql as $$
begin
  insert into audit_log(user_id,user_email,action,entity_type,entity_id,details)
  values (auth.uid(), auth.jwt()->>'email', tg_op, tg_table_name, coalesce(new.id, old.id), row_to_json(coalesce(new, old)));
  return coalesce(new, old);
end$$;
create trigger audit_processes     after insert or update on processes            for each row execute function add_audit_log();
create trigger audit_opinions      after insert or update on internal_opinions    for each row execute function add_audit_log();
create trigger audit_notifications after insert or update on notifications        for each row execute function add_audit_log();
create trigger audit_sigadaer      after insert or update on sigadaer             for each row execute function add_audit_log();
create trigger audit_models        after insert or update on models               for each row execute function add_audit_log();
create trigger audit_checklists    after insert or update on checklist_responses  for each row execute function add_audit_log();

-- =========================
-- Views (Prazos)
-- =========================

-- Pareceres internos (ATM/DT 10d; CGNA 30d) a partir do dia seguinte
create or replace view v_prazo_pareceres as
select io.process_id, p.nup, io.type,
       date(timezone('America/Sao_Paulo', io.requested_at)) as requested_at,
  date(timezone('America/Sao_Paulo', io.requested_at))
         + case when io.type in ('ATM','DT') then 10 else 30 end as due_date,
       date(timezone('America/Sao_Paulo', io.requested_at)) + 1 as start_count,
       date(timezone('America/Sao_Paulo', io.requested_at))
         + case when io.type in ('ATM','DT') then 10 else 30 end - current_date as days_remaining
from internal_opinions io
join processes p on p.id = io.process_id
where io.status = 'SOLICITADO';

-- Pareceres externos (SIGADAER)
create or replace view v_prazo_pareceres_externos as
select s.process_id, p.nup, s.type,
       date(timezone('America/Sao_Paulo', s.expedit_at)) as requested_at,
  date(timezone('America/Sao_Paulo', s.expedit_at))
         + case when s.type='COMGAP' then 90 else 30 end as due_date,
       date(timezone('America/Sao_Paulo', s.expedit_at)) + 1 as start_count,
       date(timezone('America/Sao_Paulo', s.expedit_at))
         + case when s.type='COMGAP' then 90 else 30 end - current_date as days_remaining
from sigadaer s
join processes p on p.id = s.process_id
where s.status = 'EXPEDIDO' and s.type in ('COMAE','COMPREP','COMGAP','GABAER');

-- Término de obra (FAV-TERM / TERM-ATRA LIDA)
create or replace view v_prazo_termino_obra as
with term_atra as (
  select n.process_id, min(n.read_at) as read_at
  from notifications n
  where n.type = 'TERM-ATRA' and n.status='LIDA'
  group by n.process_id
),
fav_term as (
  select distinct n.process_id
  from notifications n
  where n.type='FAV-TERM' and n.status='LIDA'
)
select p.id as process_id, p.nup,
       case when ta.read_at is not null then date(timezone('America/Sao_Paulo', ta.read_at))
            else p.obra_termino_date end as requested_at,
  case when ta.read_at is not null then (date(timezone('America/Sao_Paulo', ta.read_at)) + 30)
            else p.obra_termino_date end as due_date,
       case when ta.read_at is not null then (date(timezone('America/Sao_Paulo', ta.read_at)) + 1) end as start_count,
       case when ta.read_at is not null then (date(timezone('America/Sao_Paulo', ta.read_at)) + 30) - current_date
            else (p.obra_termino_date - current_date) end as days_remaining,
       (ta.read_at is not null) as em_atraso
from processes p
join fav_term f on f.process_id = p.id
left join term_atra ta on ta.process_id = p.id
where p.obra_concluida = false;

-- Monitorar Leitura/Expedição: notificações não lidas e SIGADAER não expedidos
create or replace view v_monitorar_tramitacao as
select n.process_id, p.nup, n.type::text as type, null::integer as number
from notifications n
join processes p on p.id = n.process_id
where n.status = 'SOLICITADA'
union all
select s.process_id, p.nup, s.type::text as type, s.numbers[1] as number
from sigadaer s
join processes p on p.id = s.process_id
where s.status = 'SOLICITADO';

-- Remoção / Rebaixamento (DESF-REM_REB lida)
create or replace view v_prazo_remocao_rebaixamento as
select n.process_id, p.nup,
       date(timezone('America/Sao_Paulo', n.read_at)) as read_at,
       date(timezone('America/Sao_Paulo', n.read_at)) + 120 as due_date,
       date(timezone('America/Sao_Paulo', n.read_at)) + 1 as start_count,
       date(timezone('America/Sao_Paulo', n.read_at)) + 120 - current_date as days_remaining
from notifications n
join processes p on p.id = n.process_id
where n.type = 'DESF-REM_REB' and n.status = 'LIDA';

-- Prazo DO-AGA (60 dias; pausa em SOB-*)
create or replace view v_prazo_do_aga as
select p.id as process_id, p.nup, p.status,
       p.do_aga_start_date as requested_at,
  case when p.status in ('SOB-DOC','SOB-TEC','SOB-PDIR','SOB-EXPL')
            then null
            else (p.do_aga_start_date + 60) end as due_date,
       case when p.status in ('SOB-DOC','SOB-TEC','SOB-PDIR','SOB-EXPL')
            then null
            else (p.do_aga_start_date + 60) - current_date end as days_remaining
from processes p
where p.status <> 'ARQ';

-- =========================
-- RLS (Row Level Security)
-- =========================
alter table profiles             enable row level security;
alter table processes            enable row level security;
alter table internal_opinions    enable row level security;
alter table notifications        enable row level security;
alter table sigadaer             enable row level security;
alter table models               enable row level security;
alter table checklist_templates  enable row level security;
alter table checklist_responses  enable row level security;
alter table audit_log            enable row level security;

-- ---------- POLICIES ----------

-- profiles:
--   - usuário lê seu próprio registro
--   - Admin lê todos / insere / atualiza
--   (sem SELECT recursivo em profiles!)
create policy "profiles self read" on profiles
for select
using (id = current_user_id());

create policy "profiles self update name" on profiles
for update
using (id = current_user_id())
with check (id = current_user_id());

create policy "profiles admin read" on profiles
for select
using ( is_admin() );

create policy "profiles admin upsert" on profiles
for insert
with check ( is_admin() );

create policy "profiles admin update" on profiles
for update
using ( is_admin() );

-- processes
create policy "processes read all auth" on processes
for select using (auth.role() = 'authenticated');

create policy "processes write by role" on processes
for insert with check ( has_write_role() );

create policy "processes update by role" on processes
for update using ( has_write_role() );

-- internal_opinions
create policy "opinions read" on internal_opinions
for select using (auth.role() = 'authenticated');

create policy "opinions write" on internal_opinions
for insert with check ( has_write_role() );

create policy "opinions update" on internal_opinions
for update using ( has_write_role() );

-- notifications
create policy "notifications read" on notifications
for select using (auth.role() = 'authenticated');

create policy "notifications write" on notifications
for insert with check ( has_write_role() );

create policy "notifications update" on notifications
for update using ( has_write_role() );

-- sigadaer
create policy "sigadaer read" on sigadaer
for select using (auth.role() = 'authenticated');

create policy "sigadaer write" on sigadaer
for insert with check ( has_write_role() );

create policy "sigadaer update" on sigadaer
for update using ( has_write_role() );

-- models
create policy "models read" on models
for select using (auth.role() = 'authenticated');

create policy "models write" on models
for insert with check ( has_write_role() );

create policy "models update" on models
for update using ( has_write_role() );

create policy "models delete" on models
for delete using ( has_write_role() );

-- checklist templates/responses
create policy "ck templates read" on checklist_templates
for select using (auth.role() = 'authenticated');

create policy "ck templates write" on checklist_templates
for insert with check ( is_admin() );

create policy "ck templates update" on checklist_templates
for update using ( is_admin() );

create policy "ck templates delete" on checklist_templates
for delete using ( is_admin() );

create policy "ck responses read" on checklist_responses
for select using (auth.role() = 'authenticated');

create policy "ck responses write" on checklist_responses
for insert with check ( has_write_role() );

-- audit (somente Admin)
create policy "audit read admin" on audit_log
for select using ( is_admin() );

create policy "audit insert" on audit_log
for insert with check ( auth.role() = 'authenticated' );
