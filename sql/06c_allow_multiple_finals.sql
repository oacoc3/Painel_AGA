-- ==========================================================
-- 06c_allow_multiple_finals.sql
-- Permite várias checklists FINAL para o mesmo (process_id, template_id)
-- Mantém exclusividade APENAS para DRAFT.
-- ==========================================================

-- 1) Remover o índice único de 'final' caso exista
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

-- 2) Garantir que a exclusividade de DRAFT permanece (um por processo+template)
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

-- 3) Índices úteis para consulta de finais (não exclusivos)
CREATE INDEX IF NOT EXISTS idx_ck_final_lookup
  ON public.checklist_responses (process_id, template_id, filled_at DESC)
  WHERE status = 'final';

CREATE INDEX IF NOT EXISTS idx_ck_status
  ON public.checklist_responses (status);

-- 4) (Opcional) Se você rodou o script de DEDUPE/ARQUIVO e quer reverter,
--    este bloco re-insere FINALS arquivadas para a tabela principal.
--    Caso não exista a tabela de arquivo, este bloco é ignorado.
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='checklist_responses_archive'
  ) THEN
    -- Reinsere apenas registros que ainda não estão no principal (mesmo id)
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

-- 5) Views de apoio para consultas:

-- 5.1 Última FINAL por (processo, template)
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

-- 5.2 Todas as FINALS ranqueadas (1 = mais recente)
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
