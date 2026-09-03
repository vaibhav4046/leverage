-- Auctions.
--
-- The initial schema stored every part of a mission snapshot except the auction
-- record — which is the part that explains *why* each worker was hired, and the one
-- thing a reviewer asks about first. Without it a snapshot could be written to
-- Postgres and read back missing its reasoning, which would make the repository
-- swap lossy rather than transparent.

create table auctions (
  id           uuid primary key default gen_random_uuid(),
  mission_id   text not null references missions(id) on delete cascade,
  task_id      text not null,
  seq          integer not null,
  winner_key   text,
  rationale    text not null default '',
  -- The full candidate list, each with its score and, for the ineligible, the policy
  -- that removed it. Kept as one document because it is written once, read whole,
  -- and never queried by field.
  candidates   jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  unique (mission_id, seq)
);

create index auctions_mission_idx on auctions (mission_id, seq);

alter table auctions enable row level security;

-- Same default-deny posture as every other table in 0001: no policy is defined, so
-- only the table owner and the secret key can read it.
revoke all on table auctions from anon, authenticated;

-- ---------------------------------------------------------------- proof gaps

-- A proof pack records which worker produced it and what it could not resolve.
-- Neither had a column, so a snapshot written to Postgres and read back lost the
-- attribution and the caveats — the two things that make a proof honest rather than
-- a green tick.
alter table proof_packs add column if not exists worker jsonb;
alter table proof_packs add column if not exists unresolved text[] not null default '{}';
