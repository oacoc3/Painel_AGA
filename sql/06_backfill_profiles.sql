-- sql/06_backfill_profiles.sql
-- Cria registros em public.profiles para usuários existentes em auth.users que ainda não têm perfil.
-- Útil para administradores criados manualmente no dashboard do Supabase.
insert into profiles (id, email, name, role, must_change_password)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'name',''),
  coalesce(u.raw_user_meta_data->>'role','Visitante')::user_role,
  false
from auth.users u
left join profiles p on p.id = u.id
where p.id is null;

-- Opcional: sincroniza o campo 'role' de perfis já existentes se o JWT tiver um papel diferente (apenas quando não for Administrador no banco).
update profiles p
set role = (u.raw_user_meta_data->>'role')::user_role
from auth.users u
where p.id = u.id
  and (u.raw_user_meta_data ? 'role')
  and p.role <> 'Administrador'
  and (u.raw_user_meta_data->>'role') is not null;
