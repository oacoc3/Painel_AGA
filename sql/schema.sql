-- ============================================================
-- Migração AGA (revisada) - NUP, Extensões, Fuso, Políticas, Pareceres
-- Idempotente e segura para reexecução.
-- ============================================================

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
  -- 3) Função de normalização de NUP
  --    Regras:
  --      - mantém apenas dígitos
  --      - se tiver 5 dígitos de prefixo, descarta
  --      - formata como XXXXXX/XXXX-XX (6/4-2)
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
  -- 4) Constraint de NUP
  --    - Remover a antiga (qualquer definição)
  --    - Normalizar os DADOS EXISTENTES primeiro
  --    - Adicionar a nova como NOT VALID e, em seguida, VALIDATE
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

  -- Normaliza os registros já existentes antes de criar a nova constraint
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='processes' AND column_name='nup') THEN
    EXECUTE $sql$
      UPDATE public.processes
         SET nup = public.normalize_nup(nup)
       WHERE nup IS NOT NULL
         AND nup <> public.normalize_nup(nup)
    $sql$;
  END IF;

  -- Cria a nova constraint como NOT VALID (para não falhar agora)
  EXECUTE $sql$
    ALTER TABLE public.processes
    ADD CONSTRAINT nup_format
    CHECK (nup ~ '^[0-9]{6}/[0-9]{4}-[0-9]{2}$')
    NOT VALID
  $sql$;

  -- Valida a constraint (lança erro se existirem linhas inválidas)
  PERFORM 1
  FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid
  JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE c.conname='nup_format' AND n.nspname='public' AND t.relname='processes';

  EXECUTE 'ALTER TABLE public.processes VALIDATE CONSTRAINT nup_format';

  ----------------------------------------------------------------
  -- 5) Trigger para manter o formato em novos INSERT/UPDATE
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
  -- (mantém políticas de Administrador já presentes)

  ----------------------------------------------------------------
  -- 7) Pareceres internos: liberar (sem exigir ANATEC-PRE/ANATEC)
  ----------------------------------------------------------------
  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.check_opinion_allowed()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      -- Libera inserções/atualizações de pareceres internos, sem checagem de status do processo
      RETURN NEW;
    END;
    $$;
  $sql$;

  ----------------------------------------------------------------
  -- 8) Views: usar timezone 'America/Recife'
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
  -- 9) Sinalizações dos cards de prazos (destacar itens VALIDADOS)
  ----------------------------------------------------------------
  EXECUTE $sql$
    CREATE TABLE IF NOT EXISTS public.deadline_flags (
      id bigserial PRIMARY KEY,
      -- IMPORTANTE: mantenha o tipo de process_id compatível com public.processes(id).
      -- Se processes.id for BIGINT (bigserial), use BIGINT aqui.
      -- Se for UUID no seu esquema, troque para UUID e mantenha a FK abaixo.
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
  -- 10) HISTORY: tabela + índices + RLS + policies (idempotente)
  --      Necessário para o registro do histórico após "Confirmar".
  ----------------------------------------------------------------
  -- Criar tabela se não existir (tipos compatíveis com o front)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='history'
  ) THEN
    EXECUTE $sql$
      CREATE TABLE public.history (
        id          bigserial PRIMARY KEY,
        -- Ajuste o tipo de process_id para bater com public.processes(id)
        process_id  bigint NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
        action      text   NOT NULL,
        details     jsonb  NULL,
        user_id     uuid   NOT NULL,
        user_name   text   NULL,
        created_at  timestamptz NOT NULL DEFAULT timezone('America/Recife', now())
      )
    $sql$;
  END IF;

  -- Garantias de colunas (caso a tabela já exista diferente)
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
    -- Se existirem linhas antigas nulas, mantém sem NOT NULL para não quebrar
    NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='history' AND column_name='user_name'
  ) THEN
    EXECUTE 'ALTER TABLE public.history ADD COLUMN user_name text';
  END IF;

  -- Índices úteis
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

  -- RLS
  EXECUTE 'ALTER TABLE public.history ENABLE ROW LEVEL SECURITY';

  -- SELECT: qualquer usuário autenticado pode consultar histórico
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

  -- INSERT: somente se user_id = auth.uid()  (compatível com o front)
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

  -- (Opcional) DELETE: permitir apenas Administrador
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
  -- USER UNAVAILABILITIES: tabela e políticas
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

  ----------------------------------------------------------------
  -- SIGADAER: garantir colunas de município/UF (para integração com IBGE)
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
