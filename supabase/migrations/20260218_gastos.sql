-- Gastos operacionais dos caminhões
create table tp_gastos (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  veiculo_id uuid references tp_veiculos(id),
  tipo text not null,
  descricao text,
  valor numeric(10,2) not null default 0,
  vencimento date,
  forma_pagamento text not null default 'PIX',
  dados_pagamento text,
  foto_url text,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'PAGO')),
  created_at timestamptz not null default now()
);

create index idx_tp_gastos_data on tp_gastos(data desc);
create index idx_tp_gastos_veiculo on tp_gastos(veiculo_id);

alter table tp_gastos enable row level security;
create policy "tp_gastos_all" on tp_gastos for all using (true) with check (true);
alter publication supabase_realtime add table tp_gastos;
