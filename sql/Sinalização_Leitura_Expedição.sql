-- ============================================================
-- AGA - Sinalização Leitura/Expedição (domínio + trigger)
-- Compatível com o estilo do schema.sql do homolog10 (DO blocks, checagens).
-- Idempotente e seguro para reexecução.
-- ============================================================

DO $mig$
BEGIN
  ----------------------------------------------------------------
  -- 1) Enum de tipos de sinalização (cria apenas se não existir)
  ----------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'le_signal_type') THEN
    EXECUTE 'CREATE TYPE le_signal_type AS ENUM (''SINALIZAR'',''VALIDAR'',''REJEITAR'')';
  END IF;

  ----------------------------------------------------------------
  -- 2) Tabela de domínio: public.le_signals
  ----------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema='public' AND table_name='le_signals'
  ) THEN
    EXECUTE $sql$
      CREATE TABLE public.le_signals (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        process_id  uuid NOT NULL,
        signal_type le_signal_type NOT NULL,
        reason      text,
        extra       jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by  uuid,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    $sql$;
  END IF;

  -- Índices (idempotentes)
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relname='idx_le_signals_process_id' AND n.nspname='public'
  ) THEN
    EXECUTE 'CREATE INDEX idx_le_signals_process_id ON public.le_signals(process_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relname='idx_le_signals_created_at' AND n.nspname='public'
  ) THEN
    EXECUTE 'CREATE INDEX idx_le_signals_created_at ON public.le_signals(created_at)';
  END IF;

  ----------------------------------------------------------------
  -- 3) Função utilitária: checar existência de coluna
  ----------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname='col_exists' AND pg_function_is_visible(oid)
  ) THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.col_exists(p_schema text, p_table text, p_column text)
      RETURNS boolean
      LANGUAGE sql
      STABLE
      AS $f$
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = p_schema
            AND table_name   = p_table
            AND column_name  = p_column
        )
      $f$;
    $sql$;
  END IF;

  ----------------------------------------------------------------
  -- 4) Trigger function: espelhar INSERT em public.history
  --    - Usa auth.uid() quando disponível (Supabase).
  --    - Detecta se 'history' possui coluna 'user_name'.
  ----------------------------------------------------------------
  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.trg_le_signals_to_history()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_user uuid;
      v_user_name text;
      v_action text;
      has_user_name boolean;
    BEGIN
      -- Usuário atual (Supabase) ou o enviado em created_by
      BEGIN
        v_user := COALESCE(auth.uid(), NEW.created_by);
      EXCEPTION WHEN others THEN
        v_user := COALESCE(NEW.created_by, NULL);
      END;

      -- Nome do usuário, se houver tabela profiles(id->name)
      BEGIN
        SELECT p.name INTO v_user_name
          FROM public.profiles p
         WHERE p.id = v_user
         LIMIT 1;
      EXCEPTION WHEN others THEN
        v_user_name := NULL;
      END;

      -- Normaliza created_by na origem
      IF NEW.created_by IS NULL THEN
        NEW.created_by := v_user;
      END IF;

      -- Mapeia tipo -> action padronizada
      IF NEW.signal_type = 'SINALIZAR' THEN
        v_action := 'LE_SINALIZACAO';
      ELSIF NEW.signal_type = 'VALIDAR' THEN
        v_action := 'LE_VALIDACAO';
      ELSIF NEW.signal_type = 'REJEITAR' THEN
        v_action := 'LE_REJEICAO';
      ELSE
        v_action := 'LE_EVENTO';
      END IF;

      -- History pode (ou não) ter 'user_name'
      has_user_name := public.col_exists('public','history','user_name');

      IF has_user_name THEN
        INSERT INTO public.history (process_id, action, details, created_by, user_name, created_at)
        VALUES (
          NEW.process_id,
          v_action,
          jsonb_build_object(
            'module', 'Prazos/LeituraExpedicao',
            'signal_type', NEW.signal_type,
            'reason', NEW.reason,
            'extra', COALESCE(NEW.extra, '{}'::jsonb)
          ),
          v_user,
          COALESCE(v_user_name, ''),
          NEW.created_at
        );
      ELSE
        INSERT INTO public.history (process_id, action, details, created_by, created_at)
        VALUES (
          NEW.process_id,
          v_action,
          jsonb_build_object(
            'module', 'Prazos/LeituraExpedicao',
            'signal_type', NEW.signal_type,
            'reason', NEW.reason,
            'extra', COALESCE(NEW.extra, '{}'::jsonb)
          ),
          v_user,
          NEW.created_at
        );
      END IF;

      RETURN NEW;
    END;
    $fn$;
  $sql$;

  ----------------------------------------------------------------
  -- 5) Trigger AFTER INSERT em public.le_signals (idempotente)
  ----------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_after_ins_le_signals_history'
  ) THEN
    EXECUTE $sql$
      CREATE TRIGGER trg_after_ins_le_signals_history
      AFTER INSERT ON public.le_signals
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_le_signals_to_history()
    $sql$;
  END IF;

  ----------------------------------------------------------------
  -- 6) RLS e políticas mínimas (padrão Supabase)
  ----------------------------------------------------------------
  -- Habilita RLS (idempotente)
  BEGIN
    EXECUTE 'ALTER TABLE public.le_signals ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN others THEN
    -- já habilitado
    NULL;
  END;

  -- INSERT: usuários autenticados podem inserir (ajuste se tiver funções de papel próprias)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='le_signals' AND policyname='le_signals_insert_authenticated'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY le_signals_insert_authenticated
        ON public.le_signals
        FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() IS NOT NULL)
    $sql$;
  END IF;

  -- SELECT: leitura liberada a autenticados (ou ajuste conforme sua regra)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='le_signals' AND policyname='le_signals_select_authenticated'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY le_signals_select_authenticated
        ON public.le_signals
        FOR SELECT
        TO authenticated
        USING (true)
    $sql$;
  END IF;

END
$mig$;
