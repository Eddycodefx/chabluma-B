alter table public.teacher_profiles
add column if not exists role text not null default 'teacher'
check (role in ('admin', 'teacher'));

insert into public.teacher_profiles (user_id, school_name, full_name, role)
select
  id,
  'Wenda High School',
  coalesce(raw_user_meta_data->>'full_name', email),
  'admin'
from auth.users
where lower(email) = lower('edgerm14@gmail.com')
on conflict (user_id) do update
set role = 'admin',
    updated_at = now();
