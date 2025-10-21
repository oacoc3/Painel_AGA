
/* ===========================================================
   Patch SQL — Autosave/Histórico para Checklists
   - Ajusta RPCs para:
     (1) Registrar início de preenchimento no histórico na 1ª vez que o rascunho é criado
     (2) Registrar finalização no histórico quando a checklist é finalizada
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

  INSERT INTO public.checklist_drafts AS cd (process_id, template_id, answers, extra_obs, updated_by, updated_at)
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
        -- Atenção: usar o mesmo tipo de process_id da sua tabela 'history'
        -- Se 'history.process_id' for UUID, este cast não é necessário
        p_process_id,
        'Checklist: início de preenchimento',
        jsonb_build_object(
          'template_id', p_template_id,
          'draft_id', v_id,
          'event', 'start'
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

-- 2) Finalizar checklist com registro no histórico
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

  INSERT INTO public.checklist_responses (process_id, template_id, answers, extra_obs, status, filled_by, filled_at, updated_at)
  VALUES (p_process_id, p_template_id, COALESCE(p_answers,'{}'::jsonb), p_extra_obs, 'final', v_user_id, now(), now())
  RETURNING id INTO v_id;

  -- Limpa rascunho e lock do usuário
  DELETE FROM public.checklist_drafts
   WHERE process_id = p_process_id AND template_id = p_template_id;

  DELETE FROM public.checklist_locks
   WHERE process_id = p_process_id AND template_id = p_template_id AND holder_user_id = v_user_id;

  -- Registro no histórico
  BEGIN
    INSERT INTO public.history (process_id, action, details, user_id, user_name)
    VALUES (
      p_process_id,
      'Checklist finalizada',
      jsonb_build_object(
        'template_id', p_template_id,
        'response_id', v_id,
        'event', 'finish'
      ),
      v_user_id,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_id;
END;
$$;
