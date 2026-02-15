-- T Paulino - Gestao de Fretes
-- Schema inicial: motoristas, veiculos, terminais, fretes, aliases, auth

-- Enable UUID
create extension if not exists "pgcrypto";

-- ============================================
-- TABELAS FASE 1
-- ============================================

-- Motoristas
create table tp_motoristas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nome_normalizado text not null,
  telefone text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  whatsapp_group_jid text,
  created_at timestamptz not null default now()
);

-- Veiculos
create table tp_veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique,
  placa_normalizada text not null,
  reboque_placa text,
  motorista_fixo_id uuid references tp_motoristas(id),
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  created_at timestamptz not null default now()
);

-- Terminais (lookup)
create table tp_terminais (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  aliases text[] not null default '{}',
  valor_frete numeric(10,2) not null,
  pedagio numeric(10,2) not null default 0
);

-- Fretes
create table tp_fretes (
  id uuid primary key default gen_random_uuid(),
  data_frete date not null,
  container text,
  motorista_id uuid references tp_motoristas(id),
  veiculo_id uuid references tp_veiculos(id),
  terminal_id uuid references tp_terminais(id),
  sequencia integer,
  tipo_frete text not null default 'VIRA',
  valor_bruto numeric(10,2) not null default 0,
  pedagio numeric(10,2) not null default 0,
  comissao numeric(10,2) not null default 0,
  valor_liquido numeric(10,2) not null default 0,
  ocr_raw jsonb,
  ai_corrections jsonb,
  status text not null default 'PENDENTE',
  n8n_execution_id text,
  created_at timestamptz not null default now()
);

-- Aliases de placa (correcoes OCR)
create table tp_placa_aliases (
  placa_ocr text primary key,
  veiculo_id uuid not null references tp_veiculos(id)
);

-- Auth (PIN simples)
create table tp_auth (
  id uuid primary key default gen_random_uuid(),
  pin_hash text not null,
  nome text not null
);

-- ============================================
-- STUBS FASE 2 (so DDL)
-- ============================================

create table tp_abastecimentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  veiculo_id uuid references tp_veiculos(id),
  motorista_id uuid references tp_motoristas(id),
  litros numeric(10,2),
  valor numeric(10,2),
  km_atual integer,
  posto text,
  created_at timestamptz not null default now()
);

create table tp_manutencoes (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  veiculo_id uuid references tp_veiculos(id),
  tipo text,
  descricao text,
  valor numeric(10,2),
  oficina text,
  created_at timestamptz not null default now()
);

-- ============================================
-- INDICES
-- ============================================

create index idx_tp_fretes_data on tp_fretes(data_frete desc);
create index idx_tp_fretes_motorista on tp_fretes(motorista_id);
create index idx_tp_fretes_terminal on tp_fretes(terminal_id);
create index idx_tp_fretes_container on tp_fretes(container);
create index idx_tp_fretes_status on tp_fretes(status);

-- ============================================
-- RPC: Verificar PIN
-- ============================================

create or replace function tp_verify_pin(pin_input text)
returns table(nome text)
language plpgsql
security definer
as $$
begin
  return query
  select a.nome
  from tp_auth a
  where a.pin_hash = crypt(pin_input, a.pin_hash);
end;
$$;

-- ============================================
-- RPC: Dashboard mensal
-- ============================================

create or replace function tp_dashboard_monthly(mes text)
returns table(
  total_fretes bigint,
  receita_liquida numeric,
  media_diaria numeric,
  fretes_hoje bigint
)
language plpgsql
as $$
declare
  inicio_mes date;
  fim_mes date;
  hoje date;
begin
  inicio_mes := (mes || '-01')::date;
  fim_mes := (inicio_mes + interval '1 month' - interval '1 day')::date;
  hoje := current_date;

  return query
  select
    count(*)::bigint as total_fretes,
    coalesce(sum(f.valor_liquido), 0)::numeric as receita_liquida,
    case
      when count(distinct f.data_frete) > 0
      then (coalesce(sum(f.valor_liquido), 0) / count(distinct f.data_frete))::numeric
      else 0::numeric
    end as media_diaria,
    count(*) filter (where f.data_frete = hoje)::bigint as fretes_hoje
  from tp_fretes f
  where f.data_frete between inicio_mes and fim_mes;
end;
$$;

-- ============================================
-- RLS (basico - anon pode ler, service_role pode tudo)
-- ============================================

alter table tp_motoristas enable row level security;
alter table tp_veiculos enable row level security;
alter table tp_terminais enable row level security;
alter table tp_fretes enable row level security;
alter table tp_placa_aliases enable row level security;
alter table tp_auth enable row level security;

-- Read policies (anon)
create policy "tp_motoristas_read" on tp_motoristas for select using (true);
create policy "tp_veiculos_read" on tp_veiculos for select using (true);
create policy "tp_terminais_read" on tp_terminais for select using (true);
create policy "tp_fretes_read" on tp_fretes for select using (true);
create policy "tp_placa_aliases_read" on tp_placa_aliases for select using (true);

-- Write policies (anon - para o app funcionar sem backend)
create policy "tp_fretes_insert" on tp_fretes for insert with check (true);
create policy "tp_fretes_update" on tp_fretes for update using (true);

-- Auth: apenas verify via RPC (security definer), no direct read
create policy "tp_auth_no_read" on tp_auth for select using (false);

-- ============================================
-- ENABLE REALTIME
-- ============================================

alter publication supabase_realtime add table tp_fretes;

-- ============================================
-- SEED DATA
-- ============================================

-- Motoristas
insert into tp_motoristas (nome, nome_normalizado, telefone, whatsapp_group_jid) values
  ('ALESSANDRO', 'ALESSANDRO', null, '120363039509825419@g.us'),
  ('RONALDO', 'RONALDO', null, '120363039509825419@g.us'),
  ('CHRISTIAN', 'CHRISTIAN', null, '120363423313474684@g.us'),
  ('VALTER', 'VALTER', null, '120363027158529382@g.us');

-- Terminais
insert into tp_terminais (codigo, nome, aliases, valor_frete, pedagio) values
  ('BTP', 'Brasil Terminal Portuario', '{"BTP", "Brasil Terminal", "BRASIL TERMINAL PORTUARIO"}', 580.00, 0.00),
  ('ECOPORTO', 'EcoPorto', '{"ECOPORTO", "ECO PORTO", "ECOP"}', 580.00, 0.00),
  ('DPW', 'DPW Santos', '{"DPW", "DP WORLD", "DPWORLD"}', 680.00, 54.90),
  ('SANTOS_BRASIL', 'Santos Brasil', '{"SANTOS BRASIL", "SB", "SANTOS BR"}', 680.00, 54.90);

-- Veiculos (precisa dos IDs dos motoristas)
do $$
declare
  alessandro_id uuid;
  ronaldo_id uuid;
  christian_id uuid;
  valter_id uuid;
  v_fjr uuid;
  v_ecs uuid;
  v_fei uuid;
  v_gfr uuid;
  v_dvs uuid;
begin
  select id into alessandro_id from tp_motoristas where nome_normalizado = 'ALESSANDRO';
  select id into ronaldo_id from tp_motoristas where nome_normalizado = 'RONALDO';
  select id into christian_id from tp_motoristas where nome_normalizado = 'CHRISTIAN';
  select id into valter_id from tp_motoristas where nome_normalizado = 'VALTER';

  insert into tp_veiculos (placa, placa_normalizada, motorista_fixo_id) values
    ('FJR7B87', 'FJR7B87', alessandro_id),
    ('ECS0E09', 'ECS0E09', ronaldo_id),
    ('FEI3D86', 'FEI3D86', christian_id),
    ('GFR6A86', 'GFR6A86', valter_id),
    ('DVS8J28', 'DVS8J28', null);

  -- Buscar IDs gerados para aliases
  select id into v_fjr from tp_veiculos where placa = 'FJR7B87';
  select id into v_ecs from tp_veiculos where placa = 'ECS0E09';
  select id into v_fei from tp_veiculos where placa = 'FEI3D86';
  select id into v_gfr from tp_veiculos where placa = 'GFR6A86';
  select id into v_dvs from tp_veiculos where placa = 'DVS8J28';

  insert into tp_placa_aliases (placa_ocr, veiculo_id) values
    ('ECSOE09', v_ecs),
    ('ECS0EO9', v_ecs),
    ('FE13D86', v_fei),
    ('FEI3086', v_fei),
    ('GFR6486', v_gfr),
    ('FJR7887', v_fjr),
    ('DVS8128', v_dvs);
end $$;

-- Auth: PIN 1234 (para teste inicial)
-- Usamos pgcrypto crypt + gen_salt
insert into tp_auth (pin_hash, nome) values
  (crypt('1234', gen_salt('bf')), 'T Paulino');
