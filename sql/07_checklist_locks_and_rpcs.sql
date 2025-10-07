
-- 07_checklist_locks_and_rpcs.sql
-- Cria tabelas auxiliares e RPCs usadas por public/modules/analise.js
-- Idempotente e sem alterar visual/UX.

-- Ensures extensions used by functions (if any)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
    CREATE EXTENSION "uuid-ossp";
  END IF;
END $$;

-- =========================================
-- Tabela de locks de checklist (edição concorrente)
-- =========================================
CREATE TABLE IF NOT EXISTS public.checklist_locks (
  process_id      uuid    NOT NULL,
  template_id     uuid    NOT NULL,
  holder_user_id  uuid    NOT NULL,
  acquired_at     timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  PRIMARY KEY (process_id, template_id)
);

-- Índices auxiliares
CREATE INDEX IF NOT EXISTS checklist_locks_expires_at_idx ON public.checklist_locks (expires_at);
CREATE INDEX IF NOT EXISTS checklist_locks_holder_idx ON public.checklist_locks (holder_user_id);

-- =========================================
-- Tabela de rascunhos de checklist
-- =========================================
CREATE TABLE IF NOT EXISTS public.checklist_drafts (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  process_id     uuid NOT NULL,
  template_id    uuid NOT NULL,
  answers        jsonb NOT NULL DEFAULT '{}'::jsonb,
  extra_obs      text,
  updated_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_id, template_id)
);

-- =========================================
-- Funções utilitárias
-- =========================================
CREATE OR REPLACE FUNCTION public._now() RETURNS timestamptz
LANGUAGE sql STABLE AS $$ SELECT now() $$;

-- =========================================
-- RPC: adquirir lock
-- =========================================
CREATE OR REPLACE FUNCTION public.rpc_acquire_checklist_lock(
  p_process_id uuid,
  p_template_id uuid,
  p_ttl_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_now timestamptz := now();
  v_expires timestamptz := v_now + make_interval(secs => COALESCE(p_ttl_seconds, 1800));
  v_holder uuid;
BEGIN
  -- Usuário autenticado
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Remove locks expirados
  DELETE FROM public.checklist_locks WHERE expires_at <= v_now;

  -- Verifica lock existente
  SELECT holder_user_id INTO v_holder
  FROM public.checklist_locks
  WHERE process_id = p_process_id AND template_id = p_template_id;

  IF v_holder IS NULL THEN
    -- cria lock
    INSERT INTO public.checklist_locks(process_id, template_id, holder_user_id, acquired_at, expires_at)
    VALUES (p_process_id, p_template_id, v_user_id, v_now, v_expires);
    RETURN jsonb_build_object('status','acquired');
  ELSIF v_holder = v_user_id THEN
    -- renova lock
    UPDATE public.checklist_locks
      SET expires_at = v_expires
    WHERE process_id = p_process_id AND template_id = p_template_id;
    RETURN jsonb_build_object('status','renewed');
  ELSE
    RETURN jsonb_build_object('status','held_by_other', 'holder', v_holder::text);
  END IF;
END;
$$;

-- =========================================
-- RPC: renovar lock
-- =========================================
CREATE OR REPLACE FUNCTION public.rpc_renew_checklist_lock(
  p_process_id uuid,
  p_template_id uuid,
  p_ttl_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_now timestamptz := now();
  v_expires timestamptz := v_now + make_interval(secs => COALESCE(p_ttl_seconds, 1800));
BEGIN
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  UPDATE public.checklist_locks
     SET expires_at = v_expires
   WHERE process_id = p_process_id
     AND template_id = p_template_id
     AND holder_user_id = v_user_id;

  IF FOUND THEN
    RETURN jsonb_build_object('status','renewed');
  END IF;

  RETURN jsonb_build_object('status','no_lock');
END;
$$;

-- =========================================
-- RPC: liberar lock
-- =========================================
CREATE OR REPLACE FUNCTION public.rpc_release_checklist_lock(
  p_process_id uuid,
  p_template_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  DELETE FROM public.checklist_locks
   WHERE process_id = p_process_id
     AND template_id = p_template_id
     AND holder_user_id = v_user_id;

  IF FOUND THEN
    RETURN jsonb_build_object('status','released');
  END IF;
  RETURN jsonb_build_object('status','no_lock');
END;
$$;

-- =========================================
-- RPC: upsert de rascunho
-- =========================================
CREATE OR REPLACE FUNCTION public.rpc_upsert_checklist_draft(
  p_answers jsonb,
  p_extra_obs text,
  p_process_id uuid,
  p_template_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_user_id uuid;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  INSERT INTO public.checklist_drafts AS cd (process_id, template_id, answers, extra_obs, updated_by, updated_at)
  VALUES (p_process_id, p_template_id, COALESCE(p_answers,'{}'::jsonb), p_extra_obs, v_user_id, now())
  ON CONFLICT (process_id, template_id) DO UPDATE
     SET answers = EXCLUDED.answers,
         extra_obs = EXCLUDED.extra_obs,
         updated_by = EXCLUDED.updated_by,
         updated_at = EXCLUDED.updated_at
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- =========================================
-- RPC: finalizar checklist
-- Pressupõe tabela public.checklist_responses(process_id, template_id, answers, extra_obs, created_by, created_at)
-- Ajuste o nome/colunas abaixo se sua tabela tiver outro nome.
-- =========================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='checklist_responses'
  ) THEN
    CREATE TABLE public.checklist_responses (
      id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      process_id   uuid NOT NULL,
      template_id  uuid NOT NULL,
      answers      jsonb NOT NULL,
      extra_obs    text,
      created_by   uuid,
      created_at   timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX checklist_responses_process_idx ON public.checklist_responses(process_id);
    CREATE INDEX checklist_responses_template_idx ON public.checklist_responses(template_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_finalize_checklist(
  p_answers jsonb,
  p_extra_obs text,
  p_process_id uuid,
  p_template_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_user_id uuid;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  INSERT INTO public.checklist_responses (process_id, template_id, answers, extra_obs, created_by, created_at)
  VALUES (p_process_id, p_template_id, COALESCE(p_answers,'{}'::jsonb), p_extra_obs, v_user_id, now())
  RETURNING id INTO v_id;

  -- Opcional: ao finalizar, removemos rascunho e lock do usuário
  DELETE FROM public.checklist_drafts
   WHERE process_id = p_process_id AND template_id = p_template_id;
  DELETE FROM public.checklist_locks
   WHERE process_id = p_process_id AND template_id = p_template_id AND holder_user_id = v_user_id;

  RETURN v_id;
END;
$$;

-- =========================================
-- Grants (ajuste os papéis conforme seu projeto)
-- =========================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_locks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_drafts TO authenticated;
GRANT SELECT, INSERT ON public.checklist_responses TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_acquire_checklist_lock(uuid,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_renew_checklist_lock(uuid,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_release_checklist_lock(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_checklist_draft(jsonb,text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_checklist(jsonb,text,uuid,uuid) TO authenticated;
