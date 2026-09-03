-- Leverage schema.
--
-- Access is server-mediated: the browser never talks to PostgREST directly. Privy is the
-- identity provider, so bridging it into Supabase auth would mean inventing a custom JWT
-- path, and inventing an auth path is how auth bugs happen. The Next.js server verifies
-- the Privy token, resolves the workspace, and queries with the secret key.
--
-- RLS is still enabled on every table with a default-deny policy. Belt and braces: if the
-- Data API is ever exposed, or an anon key leaks, the tables are closed rather than open.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- identity

create table users (
  id           uuid primary key default gen_random_uuid(),
  privy_did    text unique not null,
  display_name text,
  email        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  created_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- ---------------------------------------------------------------- missions

create table missions (
  id               text primary key,
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  created_by       uuid references users(id) on delete set null,
  goal             text not null,
  status           text not null,
  budget_max_usd   numeric(12, 6) not null default 0 check (budget_max_usd >= 0),
  budget_hard      boolean not null default true,
  quality_target   numeric(4, 3) not null default 0.95,
  privacy_mode     text not null default 'prefer-local'
                   check (privacy_mode in ('local-only', 'prefer-local', 'cloud-allowed')),
  parallelism_mode text not null default 'auto',
  max_workers      integer,
  -- Idempotency key, unique per workspace: replaying a create must not spawn a second
  -- workforce.
  idempotency_key  text,
  deadline_at      timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);

create index missions_workspace_created_idx on missions (workspace_id, created_at desc);

create table mission_tasks (
  id              text not null,
  mission_id      text not null references missions(id) on delete cascade,
  title           text not null,
  description     text not null default '',
  category        text not null,
  status          text not null,
  risk            text not null default 'medium',
  quality_target  numeric(4, 3) not null default 0.95,
  budget_usd      numeric(12, 6) not null default 0,
  file_scope      text[] not null default '{}',
  reference_files text[] not null default '{}',
  attempt_count   integer not null default 0,
  checkpoint_id   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (mission_id, id)
);

create table task_dependencies (
  mission_id           text not null,
  task_id              text not null,
  depends_on_task_id   text not null,
  primary key (mission_id, task_id, depends_on_task_id),
  foreign key (mission_id, task_id) references mission_tasks (mission_id, id) on delete cascade,
  -- A task cannot depend on itself. Cycles are caught in the DAG validator; this stops
  -- the most trivial case at the storage layer.
  check (task_id <> depends_on_task_id)
);

-- ---------------------------------------------------------------- execution

create table worker_runs (
  id                 text primary key,
  mission_id         text not null references missions(id) on delete cascade,
  task_id            text not null,
  model_key          text not null,
  provider_id        text not null,
  display_name       text not null,
  role               text not null,
  cost_class         text not null check (cost_class in ('local', 'free', 'paid')),
  status             text not null,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  prompt_tokens      integer,
  completion_tokens  integer,
  context_tokens     integer,
  actual_cost_usd    numeric(12, 6) not null default 0,
  failure_type       text,
  resumed_from       text,
  auction_rationale  text
);

create index worker_runs_mission_idx on worker_runs (mission_id, started_at);

create table checkpoints (
  id                      text primary key,
  mission_id              text not null references missions(id) on delete cascade,
  task_id                 text not null,
  from_worker_run_id      text,
  from_model_key          text not null,
  reason                  text not null,
  payload                 jsonb not null,
  original_context_tokens integer not null default 0,
  checkpoint_tokens       integer not null default 0,
  created_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------- proof

create table proof_packs (
  id              text primary key,
  mission_id      text not null references missions(id) on delete cascade,
  task_id         text,
  status          text not null check (status in ('verified', 'partial', 'failed')),
  files_changed   text[] not null default '{}',
  patch_hash      text,
  quality_total   numeric(6, 2) not null default 0,
  quality_detail  jsonb not null default '{}'::jsonb,
  duration_ms     integer not null default 0,
  actual_cost_usd numeric(12, 6) not null default 0,
  created_at      timestamptz not null default now()
);

create table proof_checks (
  id            uuid primary key default gen_random_uuid(),
  proof_pack_id text not null references proof_packs(id) on delete cascade,
  check_id      text not null,
  label         text not null,
  status        text not null check (status in ('pass', 'fail', 'skipped')),
  detail        text not null default '',
  duration_ms   integer not null default 0,
  weight        numeric(6, 2) not null default 1
);

-- ---------------------------------------------------------------- audit

create table mission_events (
  mission_id     text not null references missions(id) on delete cascade,
  seq            integer not null,
  type           text not null,
  at             timestamptz not null default now(),
  elapsed_ms     integer not null default 0,
  task_id        text,
  worker_run_id  text,
  message        text not null,
  data           jsonb,
  primary key (mission_id, seq)
);

-- ---------------------------------------------------------------- learning

create table model_observations (
  id            uuid primary key default gen_random_uuid(),
  model_key     text not null,
  provider_id   text not null,
  category      text not null,
  verified      boolean not null,
  quality_score numeric(6, 2) not null default 0,
  duration_ms   integer not null default 0,
  cost_usd      numeric(12, 6) not null default 0,
  failure_type  text,
  handed_off    boolean not null default false,
  at            timestamptz not null default now()
);

create index model_observations_model_idx on model_observations (model_key, category, at desc);

-- ---------------------------------------------------------------- credentials

-- BYOK, if it ever has to be persisted. Ciphertext only: no column here can hold a
-- readable secret, and the master key lives in the deployment secret store.
create table provider_credentials (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  provider_id   text not null,
  ciphertext    bytea not null,
  nonce         bytea not null,
  auth_tag      bytea not null,
  created_at    timestamptz not null default now(),
  unique (workspace_id, provider_id)
);

-- ---------------------------------------------------------------- approvals

create table approvals (
  id           uuid primary key default gen_random_uuid(),
  mission_id   text not null references missions(id) on delete cascade,
  action       text not null,
  risk         text not null,
  requested_by text not null,
  detail       jsonb not null default '{}'::jsonb,
  resolution   text check (resolution in ('approved', 'rejected')),
  resolved_by  uuid references users(id) on delete set null,
  requested_at timestamptz not null default now(),
  resolved_at  timestamptz
);

-- ---------------------------------------------------------------- RLS

alter table users                 enable row level security;
alter table workspaces            enable row level security;
alter table workspace_members     enable row level security;
alter table missions              enable row level security;
alter table mission_tasks         enable row level security;
alter table task_dependencies     enable row level security;
alter table worker_runs           enable row level security;
alter table checkpoints           enable row level security;
alter table proof_packs           enable row level security;
alter table proof_checks          enable row level security;
alter table mission_events        enable row level security;
alter table model_observations    enable row level security;
alter table provider_credentials  enable row level security;
alter table approvals             enable row level security;

-- No permissive policies are defined. With RLS on and no policy, every role except the
-- table owner and the secret key is denied by default. That is deliberate: the browser
-- has no path to these tables, and adding one should be an explicit decision with its
-- own migration and its own review, not an accident of setup.

revoke all on all tables in schema public from anon, authenticated;
