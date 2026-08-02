drop table if exists public.grades cascade;
drop table if exists public.assessments cascade;
drop table if exists public.students cascade;
drop table if exists public.class_subjects cascade;
drop table if exists public.school_classes cascade;
drop table if exists public.teacher_profiles cascade;

create extension if not exists pgcrypto;

create table public.teacher_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_name text not null default 'Wenda High School',
  full_name text not null,
  phone text,
  role text not null default 'teacher' check (role in ('admin', 'teacher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table public.school_classes (
  id uuid primary key default gen_random_uuid(),
  form int not null check (form between 1 and 4),
  stream text not null check (stream in ('A', 'B', 'C')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (form, stream)
);

create table public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.school_classes(id) on delete cascade,
  subject_name text not null,
  teacher_id uuid references auth.users(id) on delete set null,
  color text not null default '#f3701e',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (class_id, subject_name)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.school_classes(id) on delete cascade,
  admission_number text not null,
  full_name text not null,
  sex text not null check (sex in ('F', 'M')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (class_id, admission_number)
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  label text not null,
  max_score numeric not null check (max_score > 0),
  sort_order int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  class_subject_id uuid not null references public.class_subjects(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  score numeric not null check (score >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, assessment_id)
);

create index school_classes_form_stream_idx on public.school_classes(form, stream);
create index class_subjects_class_id_idx on public.class_subjects(class_id);
create index class_subjects_teacher_id_idx on public.class_subjects(teacher_id);
create index students_class_id_idx on public.students(class_id);
create index assessments_class_subject_id_idx on public.assessments(class_subject_id);
create index grades_class_subject_id_idx on public.grades(class_subject_id);
create index grades_student_id_idx on public.grades(student_id);
create index grades_assessment_id_idx on public.grades(assessment_id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_profiles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

alter table public.teacher_profiles enable row level security;
alter table public.school_classes enable row level security;
alter table public.class_subjects enable row level security;
alter table public.students enable row level security;
alter table public.assessments enable row level security;
alter table public.grades enable row level security;

create policy "profiles_select_self_or_admin"
on public.teacher_profiles for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "profiles_insert_self"
on public.teacher_profiles for insert
to authenticated
with check (auth.uid() = user_id);

create policy "profiles_update_self_or_admin"
on public.teacher_profiles for update
to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

create policy "classes_select_authenticated"
on public.school_classes for select
to authenticated
using (true);

create policy "classes_admin_all"
on public.school_classes for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "class_subjects_select_assigned_or_admin"
on public.class_subjects for select
to authenticated
using (teacher_id = auth.uid() or public.is_admin());

create policy "class_subjects_admin_all"
on public.class_subjects for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "students_select_class_teacher_or_admin"
on public.students for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.class_subjects cs
    where cs.class_id = students.class_id
      and cs.teacher_id = auth.uid()
  )
);

create policy "students_admin_all"
on public.students for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "assessments_select_assigned_or_admin"
on public.assessments for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.class_subjects cs
    where cs.id = assessments.class_subject_id
      and cs.teacher_id = auth.uid()
  )
);

create policy "assessments_teacher_insert"
on public.assessments for insert
to authenticated
with check (
  public.is_admin()
  or exists (
    select 1
    from public.class_subjects cs
    where cs.id = assessments.class_subject_id
      and cs.teacher_id = auth.uid()
  )
);

create policy "assessments_teacher_update_delete"
on public.assessments for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.class_subjects cs
    where cs.id = assessments.class_subject_id
      and cs.teacher_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.class_subjects cs
    where cs.id = assessments.class_subject_id
      and cs.teacher_id = auth.uid()
  )
);

create policy "grades_select_assigned_or_admin"
on public.grades for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.class_subjects cs
    where cs.id = grades.class_subject_id
      and cs.teacher_id = auth.uid()
  )
);

create policy "grades_teacher_all"
on public.grades for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.class_subjects cs
    where cs.id = grades.class_subject_id
      and cs.teacher_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.class_subjects cs
    where cs.id = grades.class_subject_id
      and cs.teacher_id = auth.uid()
  )
);
