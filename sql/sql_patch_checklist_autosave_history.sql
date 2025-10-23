/* ===========================================================
   Patch SQL — Autosave/Histórico para Checklists
   - Ajusta RPCs para:
     (1) Registrar início de preenchimento no histórico na 1ª vez que o rascunho é criado
     (2) Utilizar o registro de início ao finalizar, preenchendo o started_at e vinculando o histórico
   - Idempotente via CREATE OR REPLACE FUNCTION
   =========================================================== */

-- 1) Salvar/atualizar rascunho com registro de início no histórico
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
  v_existed boolean := false;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT TRUE INTO v_existed
    FROM public.checklist_drafts
   WHERE process_id = p_process_id
     AND template_id = p_template_id
   LIMIT 1;

  INSERT INTO public.checklist_drafts AS cd
         (process_id, template_id, answers,      extra_obs, updated_by, updated_at)
  VALUES (p_process_id, p_template_id, COALESCE(p_answers,'{}'::jsonb), p_extra_obs, v_user_id, now())
  ON CONFLICT (process_id, template_id) DO UPDATE
     SET answers    = EXCLUDED.answers,
         extra_obs  = EXCLUDED.extra_obs,
         updated_by = EXCLUDED.updated_by,
         updated_at = EXCLUDED.updated_at
  RETURNING id INTO v_id;

  -- Registra início no histórico somente na 1ª criação do rascunho
  IF NOT v_existed THEN
    BEGIN
      INSERT INTO public.history (process_id, action, details, user_id, user_name)
      VALUES (
        p_process_id,
        'Checklist: início de preenchimento',
        jsonb_build_object(
          'template_id', p_template_id,
          'draft_id',    v_id,
          'event',       'start'
        ),
        v_user_id,
        NULL
      );
    EXCEPTION WHEN OTHERS THEN
      -- não falhar a operação principal por erro de histórico
      NULL;
    END;
  END IF;

  RETURN v_id;
END;
$$;

-- 2) Finalizar checklist utilizando o histórico de início (started_at) e vinculando o response_id
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

  -- Se não veio draft_id, tenta encontrar o rascunho mais recente
  IF v_effective_draft_id IS NULL THEN
    SELECT id
      INTO v_effective_draft_id
      FROM public.checklist_drafts
     WHERE process_id = p_process_id
       AND template_id = p_template_id
     ORDER BY updated_at DESC
     LIMIT 1;
  END IF;

  -- Primeiro, tenta casar com o histórico "start" do próprio draft_id
  IF v_effective_draft_id IS NOT NULL THEN
    SELECT h.created_at, h.id
      INTO v_started_at, v_history_id
      FROM public.history h
     WHERE h.process_id = p_process_id
       AND h.details->>'template_id' = p_template_id::text
       AND h.details->>'event'       = 'start'
       AND h.details->>'draft_id'    = v_effective_draft_id::text
     ORDER BY h.created_at DESC
     LIMIT 1;
  END IF;

  -- Se não achou, pega o último "start" sem response_id
  IF v_started_at IS NULL THEN
    SELECT h.created_at, h.id
      INTO v_started_at, v_history_id
      FROM public.history h
     WHERE h.process_id = p_process_id
       AND h.details->>'template_id' = p_template_id::text
       AND h.details->>'event'       = 'start'
       AND NOT (h.details ? 'response_id')
     ORDER BY h.created_at DESC
     LIMIT 1;
  END IF;

  v_started_at := COALESCE(v_started_at, now());

  INSERT INTO public.checklist_responses
         (process_id, template_id, answers,      extra_obs, status, started_at, filled_by, filled_at, updated_at)
  VALUES (p_process_id, p_template_id, COALESCE(p_answers,'{}'::jsonb), p_extra_obs, 'final', v_started_at, v_user_id, now(), now())
  RETURNING id INTO v_id;

  -- Limpa rascunho e lock do usuário
  DELETE FROM public.checklist_drafts
   WHERE process_id = p_process_id
     AND template_id = p_template_id;

  DELETE FROM public.checklist_locks
   WHERE process_id = p_process_id
     AND template_id = p_template_id
     AND holder_user_id = v_user_id;

  -- Vincula response_id ao histórico "start" (se encontrado)
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
