--
-- PostgreSQL database dump
--

\restrict 7e7yJyKXUCyczjgsMYCBNjZWgqDvngs4PTftRSj8pA8IYGQEfxhXTKmlnfeLK9u

-- Dumped from database version 17.4
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: checklist_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.checklist_type AS ENUM (
    'PDIR - Documental',
    'Inscrição - Documental',
    'Alteração - Documental',
    'Exploração - Documental',
    'OPEA - Documental'
);


--
-- Name: notification_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_status AS ENUM (
    'SOLICITADA',
    'LIDA',
    'RESPONDIDA'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'FAV',
    'FAV-TERM',
    'FAV-AD_HEL',
    'TERM-ATRA',
    'DESF-INI',
    'DESF-NAO_INI',
    'DESF_JJAER',
    'DESF-REM_REB',
    'NCD',
    'NCT',
    'REVOG',
    'ARQ-EXTR',
    'ARQ-PRAZ'
);


--
-- Name: opinion_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.opinion_status AS ENUM (
    'SOLICITADO',
    'RECEBIDO'
);


--
-- Name: opinion_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.opinion_type AS ENUM (
    'ATM',
    'DT',
    'CGNA'
);


--
-- Name: process_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.process_status AS ENUM (
    'CONFEC',
    'REV-OACO',
    'APROV',
    'ICA-PUB',
    'ICA-EXTR',
    'EDICAO',
    'AGD-LEIT',
    'ANADOC',
    'ANATEC-PRE',
    'ANATEC',
    'ANAICA',
    'SOB-DOC',
    'SOB-TEC',
    'SOB-PDIR',
    'SOB-EXPL',
    'DECEA',
    'ARQ'
);


--
-- Name: process_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.process_type AS ENUM (
    'PDIR',
    'Inscrição',
    'Alteração',
    'Exploração',
    'OPEA'
);


--
-- Name: sigadaer_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sigadaer_status AS ENUM (
    'SOLICITADO',
    'EXPEDIDO',
    'RECEBIDO'
);


--
-- Name: sigadaer_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sigadaer_type AS ENUM (
    'COMAE',
    'COMPREP',
    'COMGAP',
    'GABAER',
    'SAC',
    'ANAC',
    'OPR_AD',
    'PREF',
    'GOV',
    'JJAER',
    'AJUR',
    'AGU',
    'OUTRO'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'Administrador',
    'Analista OACO',
    'Analista OAGA',
    'CH OACO',
    'CH OAGA',
    'CH AGA',
    'Visitante'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: add_audit_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_audit_log() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  insert into audit_log(user_id,user_email,action,entity_type,entity_id,details)
  values (auth.uid(), auth.jwt()->>'email', tg_op, tg_table_name, coalesce(new.id, old.id), row_to_json(coalesce(new, old)));
  return coalesce(new, old);
end$$;


--
-- Name: add_history_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_history_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  pid uuid;
  uname text;
  evento text;
begin
  select name into uname from profiles where id = auth.uid();

  if tg_table_name = 'processes' then
    pid := coalesce(new.id, old.id);
    if tg_op = 'INSERT' then
      insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
      values (pid, 'Processo criado',
              json_build_object('nup', new.nup, 'type', new.type),
              auth.uid(), auth.jwt()->>'email', uname, now());
    else
      if (new.status is distinct from old.status) or (new.status_since is distinct from old.status_since) then
        insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
        values (pid, 'Status atualizado',
                json_build_object('status', new.status, 'status_since', new.status_since),
                auth.uid(), auth.jwt()->>'email', uname, now());
      end if;
      if (new.first_entry_date is distinct from old.first_entry_date) then
        insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
        values (pid, '1ª entrada atualizada',
                json_build_object('first_entry_date', new.first_entry_date),
                auth.uid(), auth.jwt()->>'email', uname, now());
      end if;
      if (new.obra_termino_date is distinct from old.obra_termino_date) or (new.obra_concluida is distinct from old.obra_concluida) then
        insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
        values (pid, 'Término de obra atualizado',
                json_build_object('obra_termino_date', new.obra_termino_date, 'obra_concluida', new.obra_concluida),
                auth.uid(), auth.jwt()->>'email', uname, now());
      end if;
    end if;

  elsif tg_table_name = 'process_observations' then
    pid := new.process_id;
    if tg_op = 'INSERT' then
      insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
      values (pid, 'Observação inserida',
              json_build_object('text', new.text),
              auth.uid(), auth.jwt()->>'email', uname, now());
    end if;

  elsif tg_table_name = 'internal_opinions' then
    pid := coalesce(new.process_id, old.process_id);
    if tg_op = 'INSERT' then
      insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
      values (pid, 'Parecer interno solicitado',
              json_build_object('type', new.type, 'requested_at', new.requested_at),
              auth.uid(), auth.jwt()->>'email', uname, now());
    elsif tg_op = 'UPDATE' and new.status = 'RECEBIDO' and old.status is distinct from 'RECEBIDO' then
      insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
      values (pid, 'Parecer interno recebido',
              json_build_object('type', new.type, 'received_at', new.received_at),
              auth.uid(), auth.jwt()->>'email', uname, now());
    elsif tg_op = 'DELETE' then
      insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
      values (pid, 'Parecer interno excluído',
              json_build_object('id', old.id, 'type', old.type, 'status', old.status,
                                'requested_at', old.requested_at, 'received_at', old.received_at, 'finalized_at', old.finalized_at),
              auth.uid(), auth.jwt()->>'email', uname, now());
    end if;

  elsif tg_table_name = 'notifications' then
    pid := coalesce(new.process_id, old.process_id);
    if tg_op = 'INSERT' then
      insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
      values (pid, 'Notificação solicitada',
              json_build_object('type', new.type, 'requested_at', new.requested_at),
              auth.uid(), auth.jwt()->>'email', uname, now());
    elsif tg_op = 'UPDATE' and new.status = 'LIDA' and old.status is distinct from 'LIDA' then
      insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
      values (pid, 'Notificação lida',
              json_build_object('type', new.type, 'read_at', new.read_at),
              auth.uid(), auth.jwt()->>'email', uname, now());
    elsif tg_op = 'DELETE' then
      insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
      values (pid, 'Notificação excluída',
              json_build_object('id', old.id, 'type', old.type, 'status', old.status,
                                'requested_at', old.requested_at, 'read_at', old.read_at),
              auth.uid(), auth.jwt()->>'email', uname, now());
    end if;

  elsif tg_table_name = 'sigadaer' then
    pid := coalesce(new.process_id, old.process_id);
    if tg_op = 'INSERT' then
      insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
      values (pid, 'SIGADAER solicitado',
              json_build_object('type', new.type, 'numbers', new.numbers, 'requested_at', new.requested_at),
              auth.uid(), auth.jwt()->>'email', uname, now());
    elsif tg_op = 'UPDATE' then
      if new.status = 'EXPEDIDO' and old.status is distinct from 'EXPEDIDO' then
        insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
        values (pid, 'SIGADAER expedido',
                json_build_object('type', new.type, 'numbers', new.numbers, 'expedit_at', new.expedit_at),
                auth.uid(), auth.jwt()->>'email', uname, now());
      end if;
      if new.status = 'RECEBIDO' and old.status is distinct from 'RECEBIDO' then
        insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
        values (pid, 'SIGADAER recebido',
                json_build_object('type', new.type, 'numbers', new.numbers, 'received_at', new.received_at),
                auth.uid(), auth.jwt()->>'email', uname, now());
      end if;
    elsif tg_op = 'DELETE' then
      insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
      values (pid, 'SIGADAER excluído',
              json_build_object('id', old.id, 'type', old.type, 'status', old.status, 'numbers', old.numbers,
                                'requested_at', old.requested_at, 'expedit_at', old.expedit_at, 'received_at', old.received_at),
              auth.uid(), auth.jwt()->>'email', uname, now());
    end if;

  elsif tg_table_name = 'checklist_responses' then
    pid := coalesce(new.process_id, old.process_id);
    if tg_op = 'INSERT' then
      evento := 'Checklist - Início de preenchimento';
    elsif tg_op = 'UPDATE'
          and coalesce(old.status, '') = 'draft'
          and coalesce(new.status, '') = 'final' then
      evento := 'Checklist finalizado';
    else
      return coalesce(new, old);
    end if;

    insert into history(process_id, action, details, user_id, user_email, user_name, created_at)
    values (pid, evento,
            jsonb_build_object('status', coalesce(new.status, old.status)),
            auth.uid(), auth.jwt()->>'email', uname, now());

  else
    return coalesce(new, old);
  end if;

  return coalesce(new, old);
end
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    role public.user_role DEFAULT 'Visitante'::public.user_role NOT NULL,
    must_change_password boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_list_profiles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_profiles() RETURNS SETOF public.profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_is_admin boolean := false;
begin
  v_is_admin := coalesce(auth.jwt() -> 'user_metadata' ->> 'role','') = 'Administrador';
  if not v_is_admin then
    select exists(
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'Administrador'
    ) into v_is_admin;
  end if;

  if not v_is_admin then
    return query
      select p.* from profiles p where p.id = auth.uid()
      order by p.created_at desc;
    return;
  end if;

  return query
    select p.* from profiles p
    order by p.created_at desc;
end;
$$;


--
-- Name: admin_list_user_audit(integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_user_audit(p_limit integer DEFAULT 200, p_profile uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, profile_id uuid, email text, name text, role public.user_role, event_type text, event_module text, client_session_id uuid, event_metadata jsonb, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_is_admin boolean := false;
  v_limit integer := least(1000, greatest(1, coalesce(p_limit, 200)));
begin
  v_is_admin := coalesce(auth.jwt() -> 'user_metadata' ->> 'role','') = 'Administrador';
  if not v_is_admin then
    select exists(
      select 1
      from profiles p
      where p.id = auth.uid()
        and p.role = 'Administrador'
    )
    into v_is_admin;
  end if;

  if not v_is_admin then
    return query
      select e.id, e.profile_id, p.email, p.name, p.role,
             e.event_type, e.event_module, e.client_session_id, e.event_metadata, e.created_at
      from user_audit_events e
      join profiles p on p.id = e.profile_id
      where e.profile_id = auth.uid()
      order by e.created_at desc
      limit v_limit;
  end if;

  return query
    select e.id, e.profile_id, p.email, p.name, p.role,
           e.event_type, e.event_module, e.client_session_id, e.event_metadata, e.created_at
  from user_audit_events e
  join profiles p on p.id = e.profile_id
  where p_profile is null or e.profile_id = p_profile
  order by e.created_at desc
  limit v_limit;
end;
$$;


--
-- Name: can_fill_checklists(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_fill_checklists() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select has_write_role()
         or (auth.jwt() -> 'user_metadata' ->> 'role') = 'Analista OACO';
$$;


--
-- Name: check_notification_allowed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_notification_allowed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- Libera a inserção de notificações independentemente do status do processo
  return new;
end$$;


--
-- Name: check_opinion_allowed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_opinion_allowed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare ps process_status;
begin
  select status into ps from processes where id = new.process_id;
  if ps not in ('ANATEC-PRE','ANATEC') then
    raise exception 'Parecer interno só pode ser cadastrado quando processo está ANATEC-PRE ou ANATEC';
  end if;
  return new;
end$$;


--
-- Name: check_sigadaer_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_sigadaer_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.status = 'RECEBIDO' and old.status <> 'EXPEDIDO' then
    raise exception 'SIGADAER só pode ser RECEBIDO após EXPEDIDO';
  end if;
  return new;
end$$;


--
-- Name: current_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ select auth.uid(); $$;


--
-- Name: has_write_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_write_role() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select (auth.jwt() -> 'user_metadata' ->> 'role') in
         ('Administrador','Analista OAGA','CH OACO','CH OAGA','CH AGA');
$$;


--
-- Name: has_write_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_write_role(uid uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select role in ('Administrador','Analista OACO','Analista OAGA','CH OACO','CH OAGA','CH AGA')
  from profiles where id = uid
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select coalesce(auth.jwt() -> 'user_metadata' ->> 'role','') = 'Administrador';
$$;


--
-- Name: trg_notification_set_process_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_notification_set_process_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if (tg_op = 'UPDATE') and (new.status = 'LIDA') then
    if new.type = 'NCD' then
      update processes
         set status = 'SOB-DOC',
             status_since = coalesce(new.read_at, now())
       where id = new.process_id;

    elsif new.type = 'NCT' then
      update processes
         set status = 'SOB-TEC',
             status_since = coalesce(new.read_at, now())
       where id = new.process_id;
    end if;
  end if;

  return new;
end
$$;


--
-- Name: trg_processes_set_doaga_start(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_processes_set_doaga_start() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.first_entry_date is not null then
      new.do_aga_start_date := new.first_entry_date + 1;
    end if;
  elsif tg_op = 'UPDATE' then
    if (old.status in ('SOB-DOC','SOB-TEC','SOB-PDIR','SOB-EXPL'))
       and (new.status not in ('SOB-DOC','SOB-TEC','SOB-PDIR','SOB-EXPL')) then
      new.do_aga_start_date := coalesce(date(new.status_since), current_date) + 1;
    elsif old.first_entry_date is null
          and new.first_entry_date is not null
          and new.do_aga_start_date is null then
      new.do_aga_start_date := new.first_entry_date + 1;
    end if;
  end if;
  return new;
end$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
_filename text;
BEGIN
	select string_to_array(name, '/') into _parts;
	select _parts[array_length(_parts,1)] into _filename;
	-- @todo return the last part instead of 2
	return reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[1:array_length(_parts,1)-1];
END
$$;


--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::int) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(name COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                        substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1)))
                    ELSE
                        name
                END AS name, id, metadata, updated_at
            FROM
                storage.objects
            WHERE
                bucket_id = $5 AND
                name ILIKE $1 || ''%'' AND
                CASE
                    WHEN $6 != '''' THEN
                    name COLLATE "C" > $6
                ELSE true END
                AND CASE
                    WHEN $4 != '''' THEN
                        CASE
                            WHEN position($2 IN substring(name from length($1) + 1)) > 0 THEN
                                substring(name from 1 for length($1) + position($2 IN substring(name from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                name COLLATE "C" > $4
                            END
                    ELSE
                        true
                END
            ORDER BY
                name COLLATE "C" ASC) as e order by name COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_token, bucket_id, start_after;
END;
$_$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
  v_order_by text;
  v_sort_order text;
begin
  case
    when sortcolumn = 'name' then
      v_order_by = 'name';
    when sortcolumn = 'updated_at' then
      v_order_by = 'updated_at';
    when sortcolumn = 'created_at' then
      v_order_by = 'created_at';
    when sortcolumn = 'last_accessed_at' then
      v_order_by = 'last_accessed_at';
    else
      v_order_by = 'name';
  end case;

  case
    when sortorder = 'asc' then
      v_sort_order = 'asc';
    when sortorder = 'desc' then
      v_sort_order = 'desc';
    else
      v_sort_order = 'asc';
  end case;

  v_order_by = v_order_by || ' ' || v_sort_order;

  return query execute
    'with folders as (
       select path_tokens[$1] as folder
       from storage.objects
         where objects.name ilike $2 || $3 || ''%''
           and bucket_id = $4
           and array_length(objects.path_tokens, 1) <> $1
       group by folder
       order by folder ' || v_sort_order || '
     )
     (select folder as "name",
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[$1] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where objects.name ilike $2 || $3 || ''%''
       and bucket_id = $4
       and array_length(objects.path_tokens, 1) = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text NOT NULL,
    code_challenge_method auth.code_challenge_method NOT NULL,
    code_challenge text NOT NULL,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'stores metadata for pkce logins';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_id text NOT NULL,
    client_secret_hash text NOT NULL,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    user_email text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    details jsonb
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: backup_prazo_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_prazo_signals (
    id uuid,
    process_id uuid,
    source_table text,
    source_id uuid,
    card text,
    action text,
    payload jsonb,
    analyst_comment text,
    signaled_by uuid,
    signaled_at timestamp with time zone,
    validated_by uuid,
    validated_at timestamp with time zone,
    validation_comment text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: checklist_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    template_id uuid NOT NULL,
    answers jsonb NOT NULL,
    extra_obs text,
    filled_by uuid NOT NULL,
    filled_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'final'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT checklist_responses_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'final'::text])))
);


--
-- Name: checklist_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type public.checklist_type NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    items jsonb NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    action text NOT NULL,
    details jsonb,
    user_id uuid,
    user_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_name text
);


--
-- Name: internal_opinions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internal_opinions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    type public.opinion_type NOT NULL,
    requested_at timestamp with time zone NOT NULL,
    status public.opinion_status DEFAULT 'SOLICITADO'::public.opinion_status NOT NULL,
    received_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    finalized_at timestamp with time zone
);


--
-- Name: models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    type public.notification_type NOT NULL,
    requested_at timestamp with time zone NOT NULL,
    status public.notification_status DEFAULT 'SOLICITADA'::public.notification_status NOT NULL,
    read_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone
);


--
-- Name: process_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.process_observations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: processes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nup text NOT NULL,
    type public.process_type NOT NULL,
    status public.process_status,
    status_since timestamp with time zone,
    obra_termino_date date,
    obra_concluida boolean DEFAULT false NOT NULL,
    first_entry_date date,
    do_aga_start_date date,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nup_format CHECK ((nup ~ '^[0-9]{5}\.[0-9]{6}/[0-9]{4}-[0-9]{2}$'::text))
);


--
-- Name: COLUMN processes.do_aga_start_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.processes.do_aga_start_date IS 'Data base do prazo de 60 dias da DO-AGA. Inicia no dia seguinte a first_entry_date e reinicia no dia seguinte quando sai de SOB-*.';


--
-- Name: sigadaer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sigadaer (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    type public.sigadaer_type NOT NULL,
    requested_at timestamp with time zone NOT NULL,
    status public.sigadaer_status DEFAULT 'SOLICITADO'::public.sigadaer_status NOT NULL,
    expedit_at timestamp with time zone,
    received_at timestamp with time zone,
    numbers integer[],
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deadline_days integer
);


--
-- Name: COLUMN sigadaer.deadline_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sigadaer.deadline_days IS 'Prazo (em dias) específico para o SIGADAER. Se nulo, aplica a regra padrão (COMGAP=90, demais=30).';


--
-- Name: user_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_audit_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    event_type text NOT NULL,
    event_module text,
    client_session_id uuid NOT NULL,
    event_metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_audit_events_event_type_check CHECK ((event_type = ANY (ARRAY['login'::text, 'logout'::text, 'module_access'::text])))
);


--
-- Name: v_monitorar_tramitacao; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_monitorar_tramitacao AS
 SELECT n.process_id,
    p.nup,
    (n.type)::text AS type,
    NULL::integer AS number
   FROM (public.notifications n
     JOIN public.processes p ON ((p.id = n.process_id)))
  WHERE (n.status = 'SOLICITADA'::public.notification_status)
UNION ALL
 SELECT s.process_id,
    p.nup,
    (s.type)::text AS type,
    s.numbers[1] AS number
   FROM (public.sigadaer s
     JOIN public.processes p ON ((p.id = s.process_id)))
  WHERE (s.status = 'SOLICITADO'::public.sigadaer_status);


--
-- Name: v_prazo_ad_hel; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_prazo_ad_hel AS
 WITH fav AS (
         SELECT n.process_id,
            max(date(timezone('America/Sao_Paulo'::text, n.read_at))) AS read_date
           FROM (public.notifications n
             JOIN public.processes p_1 ON ((p_1.id = n.process_id)))
          WHERE ((n.type = 'FAV-AD_HEL'::public.notification_type) AND (n.status = 'LIDA'::public.notification_status) AND (p_1.type = 'Inscrição'::public.process_type))
          GROUP BY n.process_id
        )
 SELECT p.id AS process_id,
    p.nup,
    fav.read_date,
    (fav.read_date + 1) AS start_count,
    (((fav.read_date + 1) + '2 years'::interval))::date AS due_date,
    ((((fav.read_date + 1) + '2 years'::interval))::date - CURRENT_DATE) AS days_remaining
   FROM (fav
     JOIN public.processes p ON ((p.id = fav.process_id)));


--
-- Name: v_prazo_do_aga; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_prazo_do_aga AS
 SELECT p.id AS process_id,
    p.nup,
        CASE
            WHEN (p.status = ANY (ARRAY['SOB-DOC'::public.process_status, 'SOB-TEC'::public.process_status, 'SOB-PDIR'::public.process_status, 'SOB-EXPL'::public.process_status])) THEN NULL::date
            ELSE calc.due_date
        END AS due_date,
        CASE
            WHEN (p.status = ANY (ARRAY['SOB-DOC'::public.process_status, 'SOB-TEC'::public.process_status, 'SOB-PDIR'::public.process_status, 'SOB-EXPL'::public.process_status])) THEN NULL::integer
            ELSE (calc.due_date - CURRENT_DATE)
        END AS days_remaining
   FROM (public.processes p
     CROSS JOIN LATERAL ( SELECT GREATEST(COALESCE((p.first_entry_date + 60), (p.do_aga_start_date + 59)), COALESCE((p.do_aga_start_date + 59), (p.first_entry_date + 60))) AS due_date) calc)
  WHERE (p.status <> 'ARQ'::public.process_status);


--
-- Name: v_prazo_pareceres; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_prazo_pareceres AS
 WITH base AS (
         SELECT io.process_id,
            p.nup,
            io.type,
            date(timezone('America/Sao_Paulo'::text, io.requested_at)) AS requested_at,
            (date(timezone('America/Sao_Paulo'::text, io.requested_at)) + 1) AS start_count,
                CASE
                    WHEN (io.type = ANY (ARRAY['ATM'::public.opinion_type, 'DT'::public.opinion_type])) THEN 10
                    ELSE 30
                END AS deadline_days
           FROM (public.internal_opinions io
             JOIN public.processes p ON ((p.id = io.process_id)))
          WHERE ((io.status = 'SOLICITADO'::public.opinion_status) AND (io.type = ANY (ARRAY['ATM'::public.opinion_type, 'DT'::public.opinion_type, 'CGNA'::public.opinion_type])))
        )
 SELECT process_id,
    nup,
    type,
    requested_at,
    deadline_days,
    (start_count + (deadline_days - 1)) AS due_date,
    start_count,
    ((start_count + (deadline_days - 1)) - CURRENT_DATE) AS days_remaining
   FROM base;


--
-- Name: v_prazo_pareceres_externos; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_prazo_pareceres_externos AS
 WITH base AS (
         SELECT s.process_id,
            p.nup,
            s.type,
            date(timezone('America/Sao_Paulo'::text, s.expedit_at)) AS requested_at,
            (date(timezone('America/Sao_Paulo'::text, s.expedit_at)) + 1) AS start_count,
            s.deadline_days
           FROM (public.sigadaer s
             JOIN public.processes p ON ((p.id = s.process_id)))
          WHERE ((s.status = 'EXPEDIDO'::public.sigadaer_status) AND (s.received_at IS NULL) AND (s.deadline_days IS NOT NULL))
        )
 SELECT process_id,
    nup,
    type,
    requested_at,
    deadline_days,
    (start_count + (deadline_days - 1)) AS due_date,
    start_count,
    ((start_count + (deadline_days - 1)) - CURRENT_DATE) AS days_remaining
   FROM base;


--
-- Name: v_prazo_remocao_rebaixamento; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_prazo_remocao_rebaixamento AS
 WITH base AS (
         SELECT n.process_id,
            p.nup,
            date(timezone('America/Sao_Paulo'::text, n.read_at)) AS read_date
           FROM (public.notifications n
             JOIN public.processes p ON ((p.id = n.process_id)))
          WHERE ((n.type = 'DESF-REM_REB'::public.notification_type) AND (n.status = 'LIDA'::public.notification_status))
        )
 SELECT process_id,
    nup,
    read_date AS read_at,
    ((read_date + 1) + (120 - 1)) AS due_date,
    (read_date + 1) AS start_count,
    (((read_date + 1) + (120 - 1)) - CURRENT_DATE) AS days_remaining
   FROM base;


--
-- Name: v_prazo_sobrestamento; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_prazo_sobrestamento AS
 WITH base AS (
         SELECT p.id AS process_id,
            p.nup,
            p.status,
            date(timezone('America/Sao_Paulo'::text, p.status_since)) AS status_start_date,
                CASE p.status
                    WHEN 'SOB-TEC'::public.process_status THEN 120
                    WHEN 'SOB-DOC'::public.process_status THEN 60
                    ELSE NULL::integer
                END AS deadline_days
           FROM public.processes p
          WHERE (p.status = ANY (ARRAY['SOB-TEC'::public.process_status, 'SOB-DOC'::public.process_status]))
        )
 SELECT process_id,
    nup,
        CASE
            WHEN (status_start_date IS NOT NULL) THEN ((status_start_date + 1) + (deadline_days - 1))
            ELSE NULL::date
        END AS due_date,
        CASE
            WHEN (status_start_date IS NOT NULL) THEN (status_start_date + 1)
            ELSE NULL::date
        END AS start_count,
        CASE
            WHEN (status_start_date IS NOT NULL) THEN (((status_start_date + 1) + (deadline_days - 1)) - CURRENT_DATE)
            ELSE NULL::integer
        END AS days_remaining
   FROM base
  WHERE (status_start_date IS NOT NULL);


--
-- Name: v_prazo_termino_obra; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_prazo_termino_obra AS
 SELECT process_id,
    nup,
    requested_at,
        CASE
            WHEN em_atraso THEN (start_count + 29)
            ELSE requested_at
        END AS due_date,
    start_count,
        CASE
            WHEN em_atraso THEN ((start_count + 29) - CURRENT_DATE)
            ELSE (requested_at - CURRENT_DATE)
        END AS days_remaining,
    em_atraso
   FROM ( WITH term_atra AS (
                 SELECT n.process_id,
                    min(n.read_at) AS read_at
                   FROM public.notifications n
                  WHERE ((n.type = 'TERM-ATRA'::public.notification_type) AND (n.status = 'LIDA'::public.notification_status))
                  GROUP BY n.process_id
                ), fav_term AS (
                 SELECT DISTINCT n.process_id
                   FROM public.notifications n
                  WHERE ((n.type = 'FAV-TERM'::public.notification_type) AND (n.status = 'LIDA'::public.notification_status))
                )
         SELECT p.id AS process_id,
            p.nup,
                CASE
                    WHEN (ta.read_at IS NOT NULL) THEN date(timezone('America/Sao_Paulo'::text, ta.read_at))
                    ELSE p.obra_termino_date
                END AS requested_at,
                CASE
                    WHEN (ta.read_at IS NOT NULL) THEN (date(timezone('America/Sao_Paulo'::text, ta.read_at)) + 1)
                    ELSE NULL::date
                END AS start_count,
            (ta.read_at IS NOT NULL) AS em_atraso
           FROM ((public.processes p
             JOIN fav_term f ON ((f.process_id = p.id)))
             LEFT JOIN term_atra ta ON ((ta.process_id = p.id)))
          WHERE (p.obra_concluida = false)) base;


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text
);


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_client_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_client_id_key UNIQUE (client_id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: checklist_responses checklist_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_responses
    ADD CONSTRAINT checklist_responses_pkey PRIMARY KEY (id);


--
-- Name: checklist_templates checklist_templates_name_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_name_version_key UNIQUE (name, version);


--
-- Name: checklist_templates checklist_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_pkey PRIMARY KEY (id);


--
-- Name: history history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history
    ADD CONSTRAINT history_pkey PRIMARY KEY (id);


--
-- Name: internal_opinions internal_opinions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_opinions
    ADD CONSTRAINT internal_opinions_pkey PRIMARY KEY (id);


--
-- Name: models models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: process_observations process_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_observations
    ADD CONSTRAINT process_observations_pkey PRIMARY KEY (id);


--
-- Name: processes processes_nup_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_nup_key UNIQUE (nup);


--
-- Name: processes processes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: sigadaer sigadaer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sigadaer
    ADD CONSTRAINT sigadaer_pkey PRIMARY KEY (id);


--
-- Name: user_audit_events user_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_audit_events
    ADD CONSTRAINT user_audit_events_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_clients_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_client_id_idx ON auth.oauth_clients USING btree (client_id);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: idx_history_process_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_history_process_id_created_at ON public.history USING btree (process_id, created_at DESC);


--
-- Name: idx_user_audit_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_audit_events_created_at ON public.user_audit_events USING btree (created_at DESC);


--
-- Name: idx_user_audit_events_profile_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_audit_events_profile_created_at ON public.user_audit_events USING btree (profile_id, created_at DESC);


--
-- Name: uidx_checklist_responses_draft; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_checklist_responses_draft ON public.checklist_responses USING btree (process_id, template_id) WHERE (status = 'draft'::text);


--
-- Name: uidx_notification_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_notification_pending ON public.notifications USING btree (process_id, type) WHERE (status = 'SOLICITADA'::public.notification_status);


--
-- Name: uidx_opinion_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_opinion_pending ON public.internal_opinions USING btree (process_id, type) WHERE (status = 'SOLICITADO'::public.opinion_status);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: checklist_responses audit_checklists; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_checklists AFTER INSERT OR UPDATE ON public.checklist_responses FOR EACH ROW EXECUTE FUNCTION public.add_audit_log();


--
-- Name: models audit_models; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_models AFTER INSERT OR UPDATE ON public.models FOR EACH ROW EXECUTE FUNCTION public.add_audit_log();


--
-- Name: notifications audit_notifications; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_notifications AFTER INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.add_audit_log();


--
-- Name: internal_opinions audit_opinions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_opinions AFTER INSERT OR UPDATE ON public.internal_opinions FOR EACH ROW EXECUTE FUNCTION public.add_audit_log();


--
-- Name: process_observations audit_proc_observations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_proc_observations AFTER INSERT OR UPDATE ON public.process_observations FOR EACH ROW EXECUTE FUNCTION public.add_audit_log();


--
-- Name: processes audit_processes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_processes AFTER INSERT OR UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION public.add_audit_log();


--
-- Name: sigadaer audit_sigadaer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sigadaer AFTER INSERT OR UPDATE ON public.sigadaer FOR EACH ROW EXECUTE FUNCTION public.add_audit_log();


--
-- Name: checklist_responses history_checklists; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER history_checklists AFTER INSERT OR UPDATE ON public.checklist_responses FOR EACH ROW EXECUTE FUNCTION public.add_history_event();


--
-- Name: internal_opinions history_internal_opinions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER history_internal_opinions AFTER INSERT OR UPDATE ON public.internal_opinions FOR EACH ROW EXECUTE FUNCTION public.add_history_event();


--
-- Name: internal_opinions history_internal_opinions_del; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER history_internal_opinions_del AFTER DELETE ON public.internal_opinions FOR EACH ROW EXECUTE FUNCTION public.add_history_event();


--
-- Name: notifications history_notifications; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER history_notifications AFTER INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.add_history_event();


--
-- Name: notifications history_notifications_del; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER history_notifications_del AFTER DELETE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.add_history_event();


--
-- Name: process_observations history_process_observations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER history_process_observations AFTER INSERT OR UPDATE ON public.process_observations FOR EACH ROW EXECUTE FUNCTION public.add_history_event();


--
-- Name: processes history_processes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER history_processes AFTER INSERT OR UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION public.add_history_event();


--
-- Name: sigadaer history_sigadaer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER history_sigadaer AFTER INSERT OR UPDATE ON public.sigadaer FOR EACH ROW EXECUTE FUNCTION public.add_history_event();


--
-- Name: sigadaer history_sigadaer_del; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER history_sigadaer_del AFTER DELETE ON public.sigadaer FOR EACH ROW EXECUTE FUNCTION public.add_history_event();


--
-- Name: checklist_responses trg_checklist_responses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_checklist_responses_updated_at BEFORE UPDATE ON public.checklist_responses FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: internal_opinions trg_internal_opinions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_internal_opinions_updated_at BEFORE UPDATE ON public.internal_opinions FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: models trg_models_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_models_updated_at BEFORE UPDATE ON public.models FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: notifications trg_notification_allowed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_allowed BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.check_notification_allowed();


--
-- Name: notifications trg_notifications_status_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notifications_status_update AFTER UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.trg_notification_set_process_status();


--
-- Name: notifications trg_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: internal_opinions trg_opinion_allowed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_opinion_allowed BEFORE INSERT ON public.internal_opinions FOR EACH ROW EXECUTE FUNCTION public.check_opinion_allowed();


--
-- Name: processes trg_processes_doaga_start; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_processes_doaga_start BEFORE INSERT OR UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION public.trg_processes_set_doaga_start();


--
-- Name: processes trg_processes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_processes_updated_at BEFORE UPDATE ON public.processes FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: sigadaer trg_sigadaer_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sigadaer_transition BEFORE UPDATE ON public.sigadaer FOR EACH ROW EXECUTE FUNCTION public.check_sigadaer_transition();


--
-- Name: sigadaer trg_sigadaer_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sigadaer_updated_at BEFORE UPDATE ON public.sigadaer FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: checklist_responses checklist_responses_filled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_responses
    ADD CONSTRAINT checklist_responses_filled_by_fkey FOREIGN KEY (filled_by) REFERENCES public.profiles(id);


--
-- Name: checklist_responses checklist_responses_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_responses
    ADD CONSTRAINT checklist_responses_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: checklist_responses checklist_responses_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_responses
    ADD CONSTRAINT checklist_responses_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.checklist_templates(id);


--
-- Name: checklist_templates checklist_templates_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: checklist_templates checklist_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: history history_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history
    ADD CONSTRAINT history_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: internal_opinions internal_opinions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_opinions
    ADD CONSTRAINT internal_opinions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: internal_opinions internal_opinions_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_opinions
    ADD CONSTRAINT internal_opinions_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: models models_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: notifications notifications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: notifications notifications_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: process_observations process_observations_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.process_observations
    ADD CONSTRAINT process_observations_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: processes processes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processes
    ADD CONSTRAINT processes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sigadaer sigadaer_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sigadaer
    ADD CONSTRAINT sigadaer_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: sigadaer sigadaer_process_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sigadaer
    ADD CONSTRAINT sigadaer_process_id_fkey FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;


--
-- Name: user_audit_events user_audit_events_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_audit_events
    ADD CONSTRAINT user_audit_events_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "audit insert" ON public.audit_log FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: audit_log audit read admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "audit read admin" ON public.audit_log FOR SELECT USING (public.is_admin());


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: checklist_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checklist_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: checklist_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: checklist_responses ck responses read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ck responses read" ON public.checklist_responses FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: checklist_responses ck responses update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ck responses update" ON public.checklist_responses FOR UPDATE USING (public.can_fill_checklists()) WITH CHECK (public.can_fill_checklists());


--
-- Name: checklist_responses ck responses write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ck responses write" ON public.checklist_responses FOR INSERT WITH CHECK (public.can_fill_checklists());


--
-- Name: checklist_templates ck templates delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ck templates delete" ON public.checklist_templates FOR DELETE USING (public.is_admin());


--
-- Name: checklist_templates ck templates read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ck templates read" ON public.checklist_templates FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: checklist_templates ck templates update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ck templates update" ON public.checklist_templates FOR UPDATE USING (public.is_admin());


--
-- Name: checklist_templates ck templates write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ck templates write" ON public.checklist_templates FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.history ENABLE ROW LEVEL SECURITY;

--
-- Name: history history read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "history read" ON public.history FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: internal_opinions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.internal_opinions ENABLE ROW LEVEL SECURITY;

--
-- Name: models; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;

--
-- Name: models models delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "models delete" ON public.models FOR DELETE USING (public.has_write_role());


--
-- Name: models models read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "models read" ON public.models FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: models models update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "models update" ON public.models FOR UPDATE USING (public.has_write_role());


--
-- Name: models models write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "models write" ON public.models FOR INSERT WITH CHECK (public.has_write_role());


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications delete" ON public.notifications FOR DELETE USING (public.has_write_role());


--
-- Name: notifications notifications read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications read" ON public.notifications FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: notifications notifications update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications update" ON public.notifications FOR UPDATE USING (public.has_write_role());


--
-- Name: notifications notifications write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications write" ON public.notifications FOR INSERT WITH CHECK (public.has_write_role());


--
-- Name: internal_opinions opinions delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "opinions delete" ON public.internal_opinions FOR DELETE USING (public.has_write_role());


--
-- Name: internal_opinions opinions read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "opinions read" ON public.internal_opinions FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: internal_opinions opinions update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "opinions update" ON public.internal_opinions FOR UPDATE USING (public.has_write_role());


--
-- Name: internal_opinions opinions write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "opinions write" ON public.internal_opinions FOR INSERT WITH CHECK (public.has_write_role());


--
-- Name: process_observations proc_obs read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "proc_obs read" ON public.process_observations FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: process_observations proc_obs write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "proc_obs write" ON public.process_observations FOR INSERT WITH CHECK (public.has_write_role());


--
-- Name: process_observations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.process_observations ENABLE ROW LEVEL SECURITY;

--
-- Name: processes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.processes ENABLE ROW LEVEL SECURITY;

--
-- Name: processes processes delete by role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "processes delete by role" ON public.processes FOR DELETE USING (public.has_write_role());


--
-- Name: processes processes read all auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "processes read all auth" ON public.processes FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: processes processes update by role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "processes update by role" ON public.processes FOR UPDATE USING (public.has_write_role());


--
-- Name: processes processes write by role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "processes write by role" ON public.processes FOR INSERT WITH CHECK (public.can_fill_checklists());


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles admin read" ON public.profiles FOR SELECT USING (public.is_admin());


--
-- Name: profiles profiles admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles admin update" ON public.profiles FOR UPDATE USING (public.is_admin());


--
-- Name: profiles profiles admin upsert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles admin upsert" ON public.profiles FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: profiles profiles self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles self read" ON public.profiles FOR SELECT USING ((id = public.current_user_id()));


--
-- Name: profiles profiles self update name; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles self update name" ON public.profiles FOR UPDATE USING ((id = public.current_user_id())) WITH CHECK ((id = public.current_user_id()));


--
-- Name: sigadaer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sigadaer ENABLE ROW LEVEL SECURITY;

--
-- Name: sigadaer sigadaer delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sigadaer delete" ON public.sigadaer FOR DELETE USING (public.has_write_role());


--
-- Name: sigadaer sigadaer read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sigadaer read" ON public.sigadaer FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: sigadaer sigadaer update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sigadaer update" ON public.sigadaer FOR UPDATE USING (public.has_write_role());


--
-- Name: sigadaer sigadaer write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sigadaer write" ON public.sigadaer FOR INSERT WITH CHECK (public.has_write_role());


--
-- Name: user_audit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: user_audit_events user_audit_events_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_audit_events_insert_own ON public.user_audit_events FOR INSERT WITH CHECK ((auth.uid() = profile_id));


--
-- Name: user_audit_events user_audit_events_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_audit_events_select_own ON public.user_audit_events FOR SELECT USING ((auth.uid() = profile_id));


--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 7e7yJyKXUCyczjgsMYCBNjZWgqDvngs4PTftRSj8pA8IYGQEfxhXTKmlnfeLK9u

