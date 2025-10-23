-- ============================================================
-- Consolidado AGA — Migração única (idempotente)
-- Conteúdo: schema.sql (+patch user_unavailabilities UPDATE),
--           06c_allow_multiple_finals.sql,
--           07_checklist_locks_and_rpcs.sql (harmonizado, c/ patch de finalize),
--           adhel_airfields_from_sbre.sql
-- Seguro para reexecução em banco já existente.
-- ============================================================


/* ============================ */
/*  BLOCO 1 — schema.sql        */
/* ============================ */
DO $mig$
BEGIN
  ----------------------------------------------------------------
  -- 1) Extensões necessárias (no schema "extensions")
  ----------------------------------------------------------------
  EXECUTE 'CREATE SCHEMA IF NOT EXISTS extensions';

  PERFORM 1 FROM pg_extension WHERE extname = 'pgcrypto';
  IF NOT FOUND THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions';
  END IF;

  PERFORM 1 FROM pg_extension WHERE extname = 'moddatetime';
  IF NOT FOUND THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions';
  END IF;

  ----------------------------------------------------------------
  -- 2) Fuso horário do banco
  ----------------------------------------------------------------
  EXECUTE 'ALTER DATABASE ' || current_database() || ' SET TIMEZONE TO ''America/Recife''';

  ----------------------------------------------------------------
  -- 2.1) Enum process_status: garantir novo status AGD-RESP
  ----------------------------------------------------------------
  PERFORM 1
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'process_status';

  IF FOUND THEN
    PERFORM 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'process_status'
      AND e.enumlabel = 'AGD-RESP';

    IF NOT FOUND THEN
      EXECUTE 'ALTER TYPE public.process_status ADD VALUE ''AGD-RESP''';
    END IF;
  END IF;

  ----------------------------------------------------------------
  -- 2.1) Enum process_status: garantir novo status KML/KMZ
  ----------------------------------------------------------------
  PERFORM 1
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'process_status';

  IF FOUND THEN
    PERFORM 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'process_status'
      AND e.enumlabel = 'KML/KMZ';

    IF NOT FOUND THEN
      EXECUTE 'ALTER TYPE public.process_status ADD VALUE ''KML/KMZ''';
    END IF;
  END IF;

  ----------------------------------------------------------------
  -- 3) Função de normalização de NUP
  ----------------------------------------------------------------
  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.normalize_nup(n text)
    RETURNS text
    LANGUAGE plpgsql
    STABLE
    AS $$
    DECLARE
      d text := regexp_replace(coalesce(n,''), '\D', '', 'g');
    BEGIN
      IF length(d) > 5 THEN
        d := substr(d, 6);
      END IF;

      IF length(d) >= 12 THEN
        RETURN substr(d,1,6) || '/' || substr(d,7,4) || '-' || substr(d,11,2);
      END IF;

      RETURN n;
    END;
    $$;
  $sql$;

  ----------------------------------------------------------------
  -- 4) Constraint de NUP (normaliza dados existentes e valida)
  ----------------------------------------------------------------
  IF EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  table_schema = 'public'
      AND  table_name   = 'processes'
      AND  constraint_name = 'nup_format'
  ) THEN
    EXECUTE 'ALTER TABLE public.processes DROP CONSTRAINT nup_format';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='processes' AND column_name='nup'
  ) THEN
    EXECUTE $sql$
      UPDATE public.processes
         SET nup = public.normalize_nup(nup)
       WHERE nup IS NOT NULL
         AND nup <> public.normalize_nup(nup)
    $sql$;
  END IF;

  EXECUTE $sql$
    ALTER TABLE public.processes
    ADD CONSTRAINT nup_format
    CHECK (nup ~ '^[0-9]{6}/[0-9]{4}-[0-9]{2}$')
    NOT VALID
  $sql$;

  EXECUTE 'ALTER TABLE public.processes VALIDATE CONSTRAINT nup_format';

  ----------------------------------------------------------------
  -- 5) Trigger para manter NUP normalizado
  ----------------------------------------------------------------
  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.trg_processes_normalize_nup()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.nup := public.normalize_nup(NEW.nup);
      RETURN NEW;
    END;
    $$;
  $sql$;

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_processes_normalize_nup') THEN
    EXECUTE 'DROP TRIGGER trg_processes_normalize_nup ON public.processes';
  END IF;

  EXECUTE $sql$
    CREATE TRIGGER trg_processes_normalize_nup
    BEFORE INSERT OR UPDATE ON public.processes
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_processes_normalize_nup()
  $sql$;

  ----------------------------------------------------------------
  -- 6) Políticas: remover “profiles self update name”
  ----------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'profiles'
      AND  policyname = 'profiles self update name'
  ) THEN
    EXECUTE 'DROP POLICY "profiles self update name" ON public.profiles';
  END IF;

  ----------------------------------------------------------------
  -- 7) Pareceres internos: liberar (sem checagem de status do processo)
  ----------------------------------------------------------------
  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.check_opinion_allowed()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN NEW;
    END;
    $$;
  $sql$;

  ----------------------------------------------------------------
  -- 8) Views: timezone 'America/Recife'
  ----------------------------------------------------------------
  -- v_prazo_ad_hel
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_prazo_ad_hel') THEN
    EXECUTE $sql$
      CREATE OR REPLACE VIEW public.v_prazo_ad_hel AS
      WITH fav AS (
        SELECT n.process_id,
               max(date(timezone('America/Recife', n.read_at))) AS read_date
        FROM public.notifications n
        JOIN public.processes p_1 ON p_1.id = n.process_id
        WHERE n.type = 'FAV-AD_HEL'::public.notification_type
          AND n.status = 'LIDA'::public.notification_status
          AND p_1.type = 'Inscrição'::public.process_type
        GROUP BY n.process_id
      )
      SELECT p.id AS process_id,
             p.nup,
             fav.read_date,
             (fav.read_date + 1) AS start_count,
             (((fav.read_date + 1) + interval '2 years')::date) AS due_date,
             ((((fav.read_date + 1) + interval '2 years')::date) - CURRENT_DATE) AS days_remaining
      FROM fav
      JOIN public.processes p ON p.id = fav.process_id
    $sql$;
  END IF;

  -- v_prazo_pareceres
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_prazo_pareceres') THEN
    EXECUTE $sql$
      CREATE OR REPLACE VIEW public.v_prazo_pareceres AS
      WITH base AS (
        SELECT io.process_id,
               p.nup,
               io.type,
               date(timezone('America/Recife', io.requested_at)) AS requested_at,
               (date(timezone('America/Recife', io.requested_at)) + 1) AS start_count,
               CASE
                 WHEN io.type IN ('ATM'::public.opinion_type, 'DT'::public.opinion_type) THEN 10
                 ELSE 30
               END AS deadline_days
        FROM public.internal_opinions io
        JOIN public.processes p ON p.id = io.process_id
        WHERE io.status = 'SOLICITADO'::public.opinion_status
          AND io.type IN ('ATM'::public.opinion_type, 'DT'::public.opinion_type, 'CGNA'::public.opinion_type)
      )
      SELECT process_id,
             nup,
             type,
             requested_at,
             deadline_days,
             (start_count + (deadline_days - 1)) AS due_date,
             start_count,
             ((start_count + (deadline_days - 1)) - CURRENT_DATE) AS days_remaining
      FROM base
    $sql$;
  END IF;

  -- v_prazo_pareceres_externos
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_prazo_pareceres_externos') THEN
    EXECUTE $sql$
      CREATE OR REPLACE VIEW public.v_prazo_pareceres_externos AS
      WITH base AS (
        SELECT s.process_id,
               p.nup,
               s.type,
               date(timezone('America/Recife', s.expedit_at)) AS requested_at,
               (date(timezone('America/Recife', s.expedit_at)) + 1) AS start_count,
               s.deadline_days
        FROM public.sigadaer s
        JOIN public.processes p ON p.id = s.process_id
        WHERE s.status = 'EXPEDIDO'::public.sigadaer_status
          AND s.received_at IS NULL
          AND s.deadline_days IS NOT NULL
      )
      SELECT process_id,
             nup,
             type,
             requested_at,
             deadline_days,
             (start_count + (deadline_days - 1)) AS due_date,
             start_count,
             ((start_count + (deadline_days - 1)) - CURRENT_DATE) AS days_remaining
      FROM base
    $sql$;
  END IF;

  -- v_prazo_remocao_rebaixamento
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_prazo_remocao_rebaixamento') THEN
    EXECUTE $sql$
      CREATE OR REPLACE VIEW public.v_prazo_remocao_rebaixamento AS
      WITH base AS (
        SELECT n.process_id,
               p.nup,
               date(timezone('America/Recife', n.read_at)) AS read_date
        FROM public.notifications n
        JOIN public.processes p ON p.id = n.process_id
        WHERE n.type = 'DESF-REM_REB'::public.notification_type
          AND n.status = 'LIDA'::public.notification_status
      )
      SELECT process_id,
             nup,
             read_date AS read_at,
             ((read_date + 1) + (120 - 1)) AS due_date,
             (read_date + 1) AS start_count,
             (((read_date + 1) + (120 - 1)) - CURRENT_DATE) AS days_remaining
      FROM base
    $sql$;
  END IF;

  -- v_prazo_sobrestamento
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_prazo_sobrestamento') THEN
    EXECUTE $sql$
      CREATE OR REPLACE VIEW public.v_prazo_sobrestamento AS
      WITH base AS (
        SELECT p.id AS process_id,
               p.nup,
               p.status,
               date(timezone('America/Recife', p.status_since)) AS status_start_date,
               CASE p.status
                 WHEN 'SOB-TEC'::public.process_status THEN 120
                 WHEN 'SOB-DOC'::public.process_status THEN 60
                 ELSE NULL::integer
               END AS deadline_days
        FROM public.processes p
        WHERE p.status IN ('SOB-TEC'::public.process_status, 'SOB-DOC'::public.process_status)
      )
      SELECT process_id,
             nup,
             CASE WHEN status_start_date IS NOT NULL THEN ((status_start_date + 1) + (deadline_days - 1)) END AS due_date,
             CASE WHEN status_start_date IS NOT NULL THEN (status_start_date + 1) END AS start_count,
             CASE WHEN status_start_date IS NOT NULL THEN (((status_start_date + 1) + (deadline_days - 1)) - CURRENT_DATE) END AS days_remaining
      FROM base
      WHERE status_start_date IS NOT NULL
    $sql$;
  END IF;

  -- v_prazo_termino_obra
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_prazo_termino_obra') THEN
    EXECUTE $sql$
      CREATE OR REPLACE VIEW public.v_prazo_termino_obra AS
      SELECT process_id,
             nup,
             requested_at,
             CASE WHEN em_atraso THEN (start_count + 29)
                  ELSE requested_at END AS due_date,
             start_count,
             CASE WHEN em_atraso THEN ((start_count + 29) - CURRENT_DATE)
                  ELSE (requested_at - CURRENT_DATE) END AS days_remaining,
             em_atraso
      FROM (
        WITH term_atra AS (
          SELECT n.process_id, min(n.read_at) AS read_at
          FROM public.notifications n
          WHERE n.type = 'TERM-ATRA'::public.notification_type
            AND n.status = 'LIDA'::public.notification_status
          GROUP BY n.process_id
        ),
        fav_term AS (
          SELECT DISTINCT n.process_id
          FROM public.notifications n
          WHERE n.type = 'FAV-TERM'::public.notification_type
            AND n.status = 'LIDA'::public.notification_status
        )
        SELECT p.id AS process_id,
               p.nup,
               CASE WHEN ta.read_at IS NOT NULL
                    THEN date(timezone('America/Recife', ta.read_at))
                    ELSE p.obra_termino_date END AS requested_at,
               CASE WHEN ta.read_at IS NOT NULL
                    THEN (date(timezone('America/Recife', ta.read_at)) + 1)
                    ELSE NULL::date END AS start_count,
               (ta.read_at IS NOT NULL) AS em_atraso
        FROM public.processes p
        JOIN fav_term f ON f.process_id = p.id
        LEFT JOIN term_atra ta ON ta.process_id = p.id
        WHERE p.obra_concluida = false
      ) base
    $sql$;
  END IF;

  ----------------------------------------------------------------
  -- 9) deadline_flags (tabela, índices, RLS/policies)
  ----------------------------------------------------------------
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS public.deadline_flags (
      id bigserial PRIMARY KEY,
      process_id uuid NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
      card text NOT NULL,
      item_key text NOT NULL,
      nup text NOT NULL,
      details jsonb DEFAULT '{}'::jsonb,
      created_by uuid DEFAULT auth.uid(),
      created_by_name text,
      created_at timestamptz NOT NULL DEFAULT timezone('America/Recife', now()),
      updated_at timestamptz NOT NULL DEFAULT timezone('America/Recife', now())
    )
  $sql$;

  EXECUTE $sql$
    CREATE UNIQUE INDEX IF NOT EXISTS deadline_flags_card_item_key_idx
      ON public.deadline_flags (card, item_key)
  $sql$;

  EXECUTE $sql$
    CREATE INDEX IF NOT EXISTS deadline_flags_process_id_idx
      ON public.deadline_flags (process_id)
  $sql$;

  EXECUTE $sql$
    ALTER TABLE public.deadline_flags
      ALTER COLUMN created_by SET DEFAULT auth.uid()
  $sql$;

  EXECUTE $sql$
    ALTER TABLE public.deadline_flags
      ALTER COLUMN created_at SET DEFAULT timezone('America/Recife', now())
  $sql$;

  EXECUTE $sql$
    ALTER TABLE public.deadline_flags
      ALTER COLUMN updated_at SET DEFAULT timezone('America/Recife', now())
  $sql$;

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_deadline_flags_set_updated_at') THEN
    EXECUTE 'DROP TRIGGER trg_deadline_flags_set_updated_at ON public.deadline_flags';
  END IF;

  EXECUTE $sql$
    CREATE TRIGGER trg_deadline_flags_set_updated_at
      BEFORE UPDATE ON public.deadline_flags
      FOR EACH ROW
      EXECUTE FUNCTION extensions.moddatetime(updated_at)
  $sql$;

  EXECUTE 'ALTER TABLE public.deadline_flags ENABLE ROW LEVEL SECURITY';

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'deadline_flags'
      AND  policyname = 'deadline_flags_select_authenticated'
  ) THEN
    EXECUTE 'CREATE POLICY "deadline_flags_select_authenticated" ON public.deadline_flags FOR SELECT TO authenticated USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'deadline_flags'
      AND  policyname = 'deadline_flags_insert_authenticated'
  ) THEN
    EXECUTE 'CREATE POLICY "deadline_flags_insert_authenticated" ON public.deadline_flags FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'deadline_flags'
      AND  policyname = 'deadline_flags_update_owner'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "deadline_flags_update_owner"
        ON public.deadline_flags
        FOR UPDATE
        TO authenticated
        USING (
          created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'Administrador'
          )
        )
        WITH CHECK (
          created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'Administrador'
          )
        )
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'deadline_flags'
      AND  policyname = 'deadline_flags_delete_admin'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "deadline_flags_delete_admin"
        ON public.deadline_flags
        FOR DELETE
        TO authenticated
        USING (
          created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'Administrador'
          )
        )
    $pol$;
  END IF;

  ----------------------------------------------------------------
  -- 10) history (tabela, índices, RLS/policies)
  ----------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='history'
  ) THEN
    EXECUTE $sql$
      CREATE TABLE public.history (
        id          bigserial PRIMARY KEY,
        process_id  bigint NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
        action      text   NOT NULL,
        details     jsonb  NULL,
        user_id     uuid   NOT NULL,
        user_name   text   NULL,
        created_at  timestamptz NOT NULL DEFAULT timezone('America/Recife', now())
      )
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='history' AND column_name='details'
  ) THEN
    EXECUTE 'ALTER TABLE public.history ADD COLUMN details jsonb';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='history' AND column_name='user_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.history ADD COLUMN user_id uuid';
  END IF;

  BEGIN
    EXECUTE 'ALTER TABLE public.history ALTER COLUMN user_id SET NOT NULL';
  EXCEPTION WHEN others THEN
    NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='history' AND column_name='user_name'
  ) THEN
    EXECUTE 'ALTER TABLE public.history ADD COLUMN user_name text';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='history' AND indexname='idx_history_process_id'
  ) THEN
    EXECUTE 'CREATE INDEX idx_history_process_id ON public.history(process_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='history' AND indexname='idx_history_created_at'
  ) THEN
    EXECUTE 'CREATE INDEX idx_history_created_at ON public.history(created_at DESC)';
  END IF;

  EXECUTE 'ALTER TABLE public.history ENABLE ROW LEVEL SECURITY';

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='history' AND policyname='history_select_authenticated'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "history_select_authenticated"
      ON public.history
      FOR SELECT
      TO authenticated
      USING (true)
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='history' AND policyname='history_insert_own'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "history_insert_own"
      ON public.history
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid())
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='history' AND policyname='history_delete_admin'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "history_delete_admin"
        ON public.history
        FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'Administrador'
          )
        )
    $pol$;
  END IF;

  ----------------------------------------------------------------
  -- 11) user_unavailabilities (tabela, índices, RLS/policies)
  ----------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_unavailabilities'
  ) THEN
    EXECUTE $sql$
      CREATE TABLE public.user_unavailabilities (
        id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
        profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        description text NOT NULL,
        starts_at timestamptz NOT NULL,
        ends_at timestamptz NOT NULL,
        created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT timezone('America/Recife', now()),
        updated_at timestamptz NOT NULL DEFAULT timezone('America/Recife', now())
      )
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'user_unavailabilities'
      AND constraint_name = 'user_unavailabilities_chk_range'
  ) THEN
    EXECUTE 'ALTER TABLE public.user_unavailabilities
      ADD CONSTRAINT user_unavailabilities_chk_range CHECK (ends_at > starts_at)';
  END IF;

  EXECUTE $sql$
    ALTER TABLE public.user_unavailabilities
      ALTER COLUMN created_by SET DEFAULT auth.uid()
  $sql$;

  EXECUTE $sql$
    ALTER TABLE public.user_unavailabilities
      ALTER COLUMN created_at SET DEFAULT timezone('America/Recife', now())
  $sql$;

  EXECUTE $sql$
    ALTER TABLE public.user_unavailabilities
      ALTER COLUMN updated_at SET DEFAULT timezone('America/Recife', now())
  $sql$;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_user_unavailabilities_set_updated_at'
      AND tgrelid = 'public.user_unavailabilities'::regclass
  ) THEN
    EXECUTE 'DROP TRIGGER trg_user_unavailabilities_set_updated_at ON public.user_unavailabilities';
  END IF;

  EXECUTE $sql$
    CREATE TRIGGER trg_user_unavailabilities_set_updated_at
      BEFORE UPDATE ON public.user_unavailabilities
      FOR EACH ROW
      EXECUTE FUNCTION extensions.moddatetime(updated_at)
  $sql$;

  EXECUTE $sql$
    CREATE INDEX IF NOT EXISTS user_unavailabilities_profile_id_idx
      ON public.user_unavailabilities (profile_id)
  $sql$;

  EXECUTE $sql$
    CREATE INDEX IF NOT EXISTS user_unavailabilities_starts_at_idx
      ON public.user_unavailabilities (starts_at DESC)
  $sql$;

  EXECUTE 'ALTER TABLE public.user_unavailabilities ENABLE ROW LEVEL SECURITY';

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_unavailabilities' AND policyname='user_unavailabilities_select_authenticated'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "user_unavailabilities_select_authenticated"
        ON public.user_unavailabilities
        FOR SELECT
        TO authenticated
        USING (true)
    $pol$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_unavailabilities' AND policyname='user_unavailabilities_insert_self_or_admin'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "user_unavailabilities_insert_self_or_admin"
        ON public.user_unavailabilities
        FOR INSERT
        TO authenticated
        WITH CHECK (
          profile_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'Administrador'
          )
        )
    $pol$;
  END IF;

  -- >>> PATCH: permitir UPDATE por si mesmo ou Admin <<<
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_unavailabilities' AND policyname='user_unavailabilities_update_self_or_admin'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "user_unavailabilities_update_self_or_admin"
        ON public.user_unavailabilities
        FOR UPDATE
        TO authenticated
        USING (
          profile_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'Administrador'
          )
        )
        WITH CHECK (
          profile_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'Administrador'
          )
        )
    $pol$;
  END IF;

  ----------------------------------------------------------------
  -- 12) SIGADAER: colunas municipality_name / municipality_uf
  ----------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'sigadaer'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sigadaer'
        AND column_name = 'municipality_name'
    ) THEN
      EXECUTE 'ALTER TABLE public.sigadaer ADD COLUMN municipality_name text';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sigadaer'
        AND column_name = 'municipality_uf'
    ) THEN
      EXECUTE 'ALTER TABLE public.sigadaer ADD COLUMN municipality_uf text';
    END IF;
  END IF;

END
$mig$;


/* ====================================================== */
/*  BLOCO 2 — 06c_allow_multiple_finals.sql (idempotente) */
/* ====================================================== */

-- 1) Remover índice único de FINALS (se existir)
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'uq_checklist_final_unique'
      AND n.nspname = 'public'
  ) THEN
    EXECUTE 'DROP INDEX public.uq_checklist_final_unique';
  END IF;
END;
$mig$;

-- 2) Garantir exclusividade de DRAFT (um por processo+template) — legado
DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND c.relname = 'uq_checklist_draft_unique'
      AND n.nspname = 'public'
  ) THEN
    EXECUTE $SQL$
      CREATE UNIQUE INDEX uq_checklist_draft_unique
        ON public.checklist_responses (process_id, template_id)
        WHERE status = 'draft';
    $SQL$;
  END IF;
END;
$mig$;

-- 3) Índices úteis para FINALS (não exclusivos)
CREATE INDEX IF NOT EXISTS idx_ck_final_lookup
  ON public.checklist_responses (process_id, template_id, filled_at DESC)
  WHERE status = 'final';

CREATE INDEX IF NOT EXISTS idx_ck_status
  ON public.checklist_responses (status);

-- 4) Reinsere FINALS do arquivo (se existir a tabela de arquivo)
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='checklist_responses_archive'
  ) THEN
    EXECUTE $SQL$
      INSERT INTO public.checklist_responses
        (id, process_id, template_id, answers, extra_obs, status,
         started_at, filled_by, filled_at, updated_at,
         version, lock_owner, lock_acquired_at, lock_expires_at)
      SELECT
        a.id, a.process_id, a.template_id, a.answers, a.extra_obs, a.status,
        a.started_at, a.filled_by, a.filled_at, a.updated_at,
        a.version, a.lock_owner, a.lock_acquired_at, a.lock_expires_at
      FROM public.checklist_responses_archive a
      WHERE a.status = 'final'
        AND NOT EXISTS (
          SELECT 1 FROM public.checklist_responses r WHERE r.id = a.id
        );
    $SQL$;
  END IF;
END;
$mig$;

-- 5) Views de apoio
CREATE OR REPLACE VIEW public.v_checklist_latest_final AS
SELECT DISTINCT ON (r.process_id, r.template_id)
  r.*
FROM public.checklist_responses r
WHERE r.status = 'final'
ORDER BY
  r.process_id,
  r.template_id,
  r.filled_at DESC NULLS LAST,
  r.updated_at DESC NULLS LAST,
  r.started_at DESC NULLS LAST,
  r.id DESC;

CREATE OR REPLACE VIEW public.v_checklist_finals_ranked AS
SELECT
  r.*,
  ROW_NUMBER() OVER (
    PARTITION BY r.process_id, r.template_id
    ORDER BY
      r.filled_at DESC NULLS LAST,
      r.updated_at DESC NULLS LAST,
      r.started_at DESC NULLS LAST,
      r.id DESC
  ) AS final_rank
FROM public.checklist_responses r
WHERE r.status = 'final';


/* ====================================================== */
/*  BLOCO 3 — 07_checklist_locks_and_rpcs.sql (harmon.)   */
/* ====================================================== */

-- Extensão para UUID (se necessário)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
    CREATE EXTENSION "uuid-ossp";
  END IF;
END $$;

-- Locks de checklist
CREATE TABLE IF NOT EXISTS public.checklist_locks (
  process_id      uuid    NOT NULL,
  template_id     uuid    NOT NULL,
  holder_user_id  uuid    NOT NULL,
  acquired_at     timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  PRIMARY KEY (process_id, template_id)
);

CREATE INDEX IF NOT EXISTS checklist_locks_expires_at_idx ON public.checklist_locks (expires_at);
CREATE INDEX IF NOT EXISTS checklist_locks_holder_idx  ON public.checklist_locks (holder_user_id);

-- Rascunhos de checklist
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

-- Utilitário now()
CREATE OR REPLACE FUNCTION public._now() RETURNS timestamptz
LANGUAGE sql STABLE AS $$ SELECT now() $$;

-- RPC: adquirir lock
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
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  DELETE FROM public.checklist_locks WHERE expires_at <= v_now;

  SELECT holder_user_id INTO v_holder
  FROM public.checklist_locks
  WHERE process_id = p_process_id AND template_id = p_template_id;

  IF v_holder IS NULL THEN
    INSERT INTO public.checklist_locks(process_id, template_id, holder_user_id, acquired_at, expires_at)
    VALUES (p_process_id, p_template_id, v_user_id, v_now, v_expires);
    RETURN jsonb_build_object('status','acquired');
  ELSIF v_holder = v_user_id THEN
    UPDATE public.checklist_locks
      SET expires_at = v_expires
    WHERE process_id = p_process_id AND template_id = p_template_id;
    RETURN jsonb_build_object('status','renewed');
  ELSE
    RETURN jsonb_build_object('status','held_by_other', 'holder', v_holder::text);
  END IF;
END;
$$;

-- RPC: renovar lock
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

-- RPC: liberar lock
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

-- >>> Harmonização: criar checklist_responses (apenas se não existir)
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
      status       text NOT NULL DEFAULT 'final', -- 'draft' | 'final' (legado)
      started_at   timestamptz,
      filled_by    uuid,
      filled_at    timestamptz,
      updated_at   timestamptz,
      version      integer,
      lock_owner   uuid,
      lock_acquired_at timestamptz,
      lock_expires_at  timestamptz
    );
    CREATE INDEX checklist_responses_process_idx  ON public.checklist_responses(process_id);
    CREATE INDEX checklist_responses_template_idx ON public.checklist_responses(template_id);
  END IF;
END $$;

-- RPC: salvar/atualizar rascunho
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

-- RPC: finalizar checklist (insere como 'final') — PATCH aplicado
CREATE OR REPLACE FUNCTION public.rpc_finalize_checklist(
  p_answers jsonb,
  p_extra_obs text,
  p_process_id uuid,
  p_template_id uuid,
  p_draft_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_user_id uuid;
  v_started_at timestamptz;
  v_history_id bigint;
  v_effective_draft_id uuid;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  v_effective_draft_id := p_draft_id;

  IF v_effective_draft_id IS NULL THEN
    SELECT id INTO v_effective_draft_id
    FROM public.checklist_drafts
    WHERE process_id = p_process_id
      AND template_id = p_template_id
    ORDER BY updated_at DESC
    LIMIT 1;
  END IF;

  IF v_effective_draft_id IS NOT NULL THEN
    SELECT h.created_at, h.id
      INTO v_started_at, v_history_id
    FROM public.history h
    WHERE h.process_id::text = p_process_id::text
      AND h.details->>'template_id' = p_template_id::text
      AND h.details->>'event' = 'start'
      AND h.details->>'draft_id' = v_effective_draft_id::text
    ORDER BY h.created_at DESC
    LIMIT 1;
  END IF;

  IF v_started_at IS NULL THEN
    SELECT h.created_at, h.id
      INTO v_started_at, v_history_id
    FROM public.history h
    WHERE h.process_id::text = p_process_id::text
      AND h.details->>'template_id' = p_template_id::text
      AND h.details->>'event' = 'start'
      AND NOT (h.details ? 'response_id')
    ORDER BY h.created_at DESC
    LIMIT 1;
  END IF;

  v_started_at := COALESCE(v_started_at, now());

  INSERT INTO public.checklist_responses (process_id, template_id, answers, extra_obs, status, started_at, filled_by, filled_at, updated_at)
  VALUES (p_process_id, p_template_id, COALESCE(p_answers,'{}'::jsonb), p_extra_obs, 'final', v_started_at, v_user_id, now(), now())
  RETURNING id INTO v_id;

  -- Limpa rascunho e lock do usuário
  DELETE FROM public.checklist_drafts
   WHERE process_id = p_process_id AND template_id = p_template_id;

  DELETE FROM public.checklist_locks
   WHERE process_id = p_process_id AND template_id = p_template_id AND holder_user_id = v_user_id;

  IF v_history_id IS NOT NULL THEN
    BEGIN
      UPDATE public.history
         SET details = COALESCE(details, '{}'::jsonb) || jsonb_build_object('response_id', v_id)
       WHERE id = v_history_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN v_id;
END;
$$;

-- Grants (ajuste papéis se necessário)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_locks   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_drafts  TO authenticated;
GRANT SELECT, INSERT                   ON public.checklist_responses TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_acquire_checklist_lock(uuid,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_renew_checklist_lock(uuid,uuid,integer)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_release_checklist_lock(uuid,uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_checklist_draft(jsonb,text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_checklist(jsonb,text,uuid,uuid,uuid) TO authenticated;


/* ====================================================== */
/*  BLOCO 4 — adhel_airfields_from_sbre.sql               */
/* ====================================================== */

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='adhel_airfields'
  ) THEN
    CREATE TABLE public.adhel_airfields (
      id         bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      tipo       text,
      oaci       text,
      ciad       text,
      name       text,
      municipio  text,
      uf         text NOT NULL CHECK (char_length(uf) = 2),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='adhel_airfields_oaci_idx') THEN
    CREATE INDEX adhel_airfields_oaci_idx ON public.adhel_airfields (oaci);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='adhel_airfields_ciad_idx') THEN
    CREATE INDEX adhel_airfields_ciad_idx ON public.adhel_airfields (ciad);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='adhel_airfields_municipio_idx') THEN
    CREATE INDEX adhel_airfields_municipio_idx ON public.adhel_airfields (municipio);
  END IF;
END
$mig$;

