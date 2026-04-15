-- Agent observability tables for claim-first pipeline

create extension if not exists "pgcrypto";

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_query text not null,
  allowed boolean,
  risk_level text,
  domain text,
  subdomain text,
  model text,
  final_answer jsonb,
  debug jsonb
);

create index if not exists agent_runs_created_at_idx on public.agent_runs (created_at desc);

create table if not exists public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  agent_name text not null,
  status text not null default 'ok',
  latency_ms integer,
  input jsonb,
  output jsonb,
  error text
);

create index if not exists agent_steps_run_id_idx on public.agent_steps (run_id);
create index if not exists agent_steps_created_at_idx on public.agent_steps (created_at desc);

