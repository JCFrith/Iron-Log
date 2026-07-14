-- Iron Log v2 foundation migration
-- Review before applying to production Supabase.

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goals jsonb not null default '{}'::jsonb,
  equipment jsonb not null default '[]'::jsonb,
  injuries jsonb not null default '[]'::jsonb,
  training_preferences jsonb not null default '{}'::jsonb,
  ai_memory jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at timestamptz not null default now(),
  weight_kg numeric,
  body_fat_pct numeric,
  lean_mass_kg numeric,
  fat_mass_kg numeric,
  waist_cm numeric,
  chest_cm numeric,
  arms_cm numeric,
  thighs_cm numeric,
  source text not null default 'manual',
  notes text
);

create table if not exists public.nutrition_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  hydration_ml numeric,
  electrolytes jsonb not null default '{}'::jsonb,
  supplements jsonb not null default '[]'::jsonb,
  primary key (user_id, day)
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consumed_at timestamptz not null default now(),
  name text not null,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  barcode text,
  items jsonb not null default '[]'::jsonb
);

create table if not exists public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  movement_pattern text,
  equipment text[] not null default '{}',
  difficulty text,
  fatigue_cost numeric,
  strength_curve text,
  technique text,
  common_mistakes text[] not null default '{}',
  alternatives jsonb not null default '[]'::jsonb,
  video_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid references public.exercise_library(id) on delete set null,
  exercise_name text not null,
  record_type text not null,
  load_kg numeric,
  reps integer,
  volume_kg numeric,
  estimated_1rm_kg numeric,
  achieved_at timestamptz not null default now(),
  source_session_id bigint
);

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  priority integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  xp integer not null default 0,
  icon text
);

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.user_preferences enable row level security;
alter table public.body_measurements enable row level security;
alter table public.nutrition_days enable row level security;
alter table public.meals enable row level security;
alter table public.personal_records enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.user_achievements enable row level security;

create policy "own preferences" on public.user_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own body measurements" on public.body_measurements for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "coach reads body measurements" on public.body_measurements for select using (me_is_coach());
create policy "own nutrition days" on public.nutrition_days for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own meals" on public.meals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own personal records" on public.personal_records for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "coach reads personal records" on public.personal_records for select using (me_is_coach());
create policy "own ai recommendations" on public.ai_recommendations for select using (user_id = auth.uid());
create policy "own achievement rows" on public.user_achievements for select using (user_id = auth.uid());

-- Public read-only catalog tables.
alter table public.exercise_library enable row level security;
alter table public.achievements enable row level security;
create policy "authenticated exercise library read" on public.exercise_library for select using (auth.role() = 'authenticated');
create policy "authenticated achievements read" on public.achievements for select using (auth.role() = 'authenticated');
