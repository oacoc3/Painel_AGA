-- ============================================================
-- Views do Dashboard (idempotentes) - Painel DO-AGA
-- - Cria/recria as views mínimas consumidas pelo frontend
-- - SECURITY INVOKER para respeitar RLS (Row-Level Security)
-- - Concede SELECT a anon e authenticated
-- - Recarrega o cache do PostgREST ao final
-- ============================================================

DO $mig$
BEGIN
  ----------------------------------------------------------------
  -- v_dashboard_processes
  ----------------------------------------------------------------
  EXECUTE $sql$
    CREATE OR REPLACE VIEW public.v_dashboard_processes AS
    SELECT
      p.id,
      p.status,
      p.status_since,
      p.first_entry_date
    FROM public.processes AS p
  $sql$;

  -- SECURITY INVOKER e comentário
  EXECUTE $sql$ ALTER VIEW public.v_dashboard_processes SET (security_invoker = on) $sql$;
  EXECUTE $sql$ COMMENT ON VIEW public.v_dashboard_processes IS
    'Dashboard: projeção mínima de processes (id, status, status_since, first_entry_date).' $sql$;

  -- Grants
  EXECUTE $sql$ GRANT SELECT ON public.v_dashboard_processes TO anon, authenticated $sql$;

  ----------------------------------------------------------------
  -- v_dashboard_notifications
  ----------------------------------------------------------------
  EXECUTE $sql$
    CREATE OR REPLACE VIEW public.v_dashboard_notifications AS
    SELECT
      n.requested_at,
      n.read_at
    FROM public.notifications AS n
  $sql$;

  EXECUTE $sql$ ALTER VIEW public.v_dashboard_notifications SET (security_invoker = on) $sql$;
  EXECUTE $sql$ COMMENT ON VIEW public.v_dashboard_notifications IS
    'Dashboard: projeção mínima de notifications (requested_at, read_at).' $sql$;

  EXECUTE $sql$ GRANT SELECT ON public.v_dashboard_notifications TO anon, authenticated $sql$;

  ----------------------------------------------------------------
  -- v_dashboard_sigadaer
  ----------------------------------------------------------------
  EXECUTE $sql$
    CREATE OR REPLACE VIEW public.v_dashboard_sigadaer AS
    SELECT
      s.type,
      s.status,
      s.requested_at,
      s.expedit_at
    FROM public.sigadaer AS s
  $sql$;

  EXECUTE $sql$ ALTER VIEW public.v_dashboard_sigadaer SET (security_invoker = on) $sql$;
  EXECUTE $sql$ COMMENT ON VIEW public.v_dashboard_sigadaer IS
    'Dashboard: projeção mínima de sigadaer (type, status, requested_at, expedit_at).' $sql$;

  EXECUTE $sql$ GRANT SELECT ON public.v_dashboard_sigadaer TO anon, authenticated $sql$;

  ----------------------------------------------------------------
  -- v_dashboard_opinions
  ----------------------------------------------------------------
  EXECUTE $sql$
    CREATE OR REPLACE VIEW public.v_dashboard_opinions AS
    SELECT
      io.type,
      io.requested_at
    FROM public.internal_opinions AS io
  $sql$;

  EXECUTE $sql$ ALTER VIEW public.v_dashboard_opinions SET (security_invoker = on) $sql$;
  EXECUTE $sql$ COMMENT ON VIEW public.v_dashboard_opinions IS
    'Dashboard: projeção mínima de internal_opinions (type, requested_at).' $sql$;

  EXECUTE $sql$ GRANT SELECT ON public.v_dashboard_opinions TO anon, authenticated $sql$;

  ----------------------------------------------------------------
  -- Recarregar cache de schema do PostgREST (Supabase)
  ----------------------------------------------------------------
  PERFORM pg_notify('pgrst', 'reload schema');
END
$mig$;
