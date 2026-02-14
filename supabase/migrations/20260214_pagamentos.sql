-- T Paulino - Pagamentos semanais (fechamento semanal)
create table tp_pagamentos (
  id uuid primary key default gen_random_uuid(),
  motorista_id uuid not null references tp_motoristas(id),
  semana_inicio date not null,
  semana_fim date not null,
  total_fretes integer not null default 0,
  valor_total numeric(10,2) not null default 0,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'PAGO')),
  data_pagamento timestamptz,
  observacao text,
  created_at timestamptz not null default now(),
  unique(motorista_id, semana_inicio)
);

create index idx_tp_pagamentos_semana on tp_pagamentos(semana_inicio desc);
create index idx_tp_pagamentos_motorista on tp_pagamentos(motorista_id);

alter table tp_pagamentos enable row level security;
create policy "tp_pagamentos_read" on tp_pagamentos for select using (true);
create policy "tp_pagamentos_insert" on tp_pagamentos for insert with check (true);
create policy "tp_pagamentos_update" on tp_pagamentos for update using (true);
