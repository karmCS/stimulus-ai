-- TTL-based cache for expensive research stages (topic/subdomain keyed).
-- Stores researcher outputs and ranked sources so we can skip re-researching common topics.

create extension if not exists "pgcrypto";

create table if not exists public.research_cache (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cache_key text not null unique,
  topic text not null,
  subdomain text,
  evidence jsonb,
  practical jsonb,
  limitations jsonb,
  ranked_sources jsonb,
  hit_count integer not null default 0,
  expires_at timestamptz not null
);

create index if not exists research_cache_expires_at_idx on public.research_cache (expires_at);
create index if not exists research_cache_topic_idx on public.research_cache (topic);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists research_cache_set_updated_at on public.research_cache;
create trigger research_cache_set_updated_at
before update on public.research_cache
for each row execute function public.set_updated_at();

