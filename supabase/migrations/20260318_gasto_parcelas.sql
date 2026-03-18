-- Parcelas de pagamento para despesas (issue #6)
-- Permite registrar entrada + boletos com status independente por parcela

create table tp_gasto_parcelas (
  id uuid primary key default gen_random_uuid(),
  gasto_id uuid not null references tp_gastos(id) on delete cascade,
  numero smallint not null,
  total_parcelas smallint not null,
  valor numeric(10,2) not null,
  vencimento date,
  forma_pagamento text not null,
  dados_pagamento text,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'PAGO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tp_gasto_parcelas_gasto on tp_gasto_parcelas(gasto_id);
create index idx_tp_gasto_parcelas_vencimento on tp_gasto_parcelas(vencimento)
  where status = 'PENDENTE';

alter table tp_gasto_parcelas enable row level security;
create policy "tp_gasto_parcelas_all" on tp_gasto_parcelas for all using (true) with check (true);
alter publication supabase_realtime add table tp_gasto_parcelas;
