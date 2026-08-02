# Wenda High School Mark Register

A single-teacher class, subject & grade tracker for Wenda High School, built as an
installable PWA with Supabase Auth and Supabase Postgres storage.

## What it does

- Save teacher information
- Sign in with Supabase Auth
- Admin users create Form One to Form Four classes, streams A, B, and C
- Admin users assign a subject and teacher to each class
- Teachers see only assigned class subjects, e.g. Mathematics in Form 1A
- Import student rosters from Excel/CSV files
- Admin users enroll or correct class rosters using admission number, full name, and sex
- Teachers add assessment columns per assigned class subject (e.g. "CAT 1", "Midterm", "Final Exam" — with a max score)
- Enter marks directly in the mark sheet; each student's average % is calculated live
- Installs to your phone's home screen like a native app

## Supabase setup

This project reads Supabase settings only from this repo's `.env` file:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

It does not use global Supabase CLI project state.

Before using the app, run [supabase/schema.sql](./supabase/schema.sql) in the SQL
editor for the Supabase project referenced by `.env`. This drops and recreates
only this app's tables, including `public.class_subjects`.

If you already have old test data that does not match the current inputs, this
same script is the reset path. [supabase/reset_schema.sql](./supabase/reset_schema.sql)
is kept as the same reset schema for compatibility.

Then create/sign up Edger's Auth account in the app or Supabase dashboard, edit
[supabase/make_admin.sql](./supabase/make_admin.sql), replace `edger@example.com`
with Edger's real login email, and run that SQL in the same Supabase SQL editor.

The schema creates:

- `teacher_profiles` with `admin` and `teacher` roles
- `school_classes` for Form/Stream
- `class_subjects` for class + subject + assigned teacher
- `students` once per class, shared by all class subjects
- `assessments` and `grades` per class subject

## Student roster import

Roster files can be `.xlsx`, `.xls`, or `.csv`. The first sheet/file should contain
these columns:

- admission number
- student fullname
- sex

The sex value can be `F`, `M`, `Female`, or `Male`. The header row can be below
school title rows; the importer searches the first 20 rows for the right columns.
Common header variations like `adm no`, `reg no`, `fullname`, `student name`,
`name of student`, and `gender` are also accepted.

## Run it locally

```bash
npm install
npm run dev
```

Open the printed localhost URL in your browser.

## Build for production / deploy

```bash
npm run build
npm run preview   # test the production build locally
```

The `dist/` folder is a static site — deploy it to any static host (Netlify, Vercel,
GitHub Pages, or your own Alibaba Cloud instance next to AN CLASSIC). Once deployed
over HTTPS, open it on your phone and use "Add to Home Screen".

## Data & storage

All teacher, class, student, assessment, and grade data is stored in Supabase.
Admins manage classes and rosters. Teachers can only work on class subjects
assigned to their account.

## Tech

Vue 3 + Vite, Supabase Auth/Postgres, SheetJS for Excel imports, and
`vite-plugin-pwa` for installability.
