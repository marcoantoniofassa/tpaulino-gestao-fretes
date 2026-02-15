-- Push subscriptions persistence (survives server restarts/deploys)
create table tp_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  keys jsonb not null,
  device_name text default 'Desconhecido',
  created_at timestamptz not null default now()
);

-- RLS: allow all via anon key (single-tenant app)
alter table tp_push_subscriptions enable row level security;
create policy "Allow all push ops" on tp_push_subscriptions for all using (true) with check (true);
