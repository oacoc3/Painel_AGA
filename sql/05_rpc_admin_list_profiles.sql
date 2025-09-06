-- 05_rpc_admin_list_profiles.sql
-- Função RPC (SECURITY DEFINER) para listar todos os perfis quando o chamador for Administrador.
-- Admin é reconhecido se: (a) JWT: user_metadata.role = 'Administrador'  OU
--                         (b) Banco: profiles.role = 'Administrador' (via uid atual)
-- A função é SECURITY DEFINER para poder ler 'profiles' sem esbarrar nas policies de RLS (Rodízio de Linhas).
-- ATENÇÃO: defina o search_path para evitar hijack.

create or replace function admin_list_profiles()
returns setof profiles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_is_admin boolean := false;
begin
  -- (a) Admin pelo JWT
  v_is_admin := coalesce(auth.jwt() -> 'user_metadata' ->> 'role','') = 'Administrador';

  -- (b) OU admin pelo banco (perfil do próprio chamador)
  if not v_is_admin then
    select exists(
      select 1 from profiles p
      where p.id = auth.uid()
        and p.role = 'Administrador'
    ) into v_is_admin;
  end if;

  if not v_is_admin then
    -- Sem privilégio: retorna apenas o próprio registro (comportamento conservador)
    return query
      select p.* from profiles p where p.id = auth.uid()
      order by p.created_at desc;
    return;
  end if;

  -- Admin: retorna todos
  return query
    select p.* from profiles p
    order by p.created_at desc;
end;
$$;

-- Permissões: permitir execução a usuários autenticados
grant execute on function admin_list_profiles() to authenticated;
