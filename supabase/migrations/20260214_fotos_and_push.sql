-- ============================================
-- FOTOS: colunas + storage bucket
-- ============================================

-- Foto do veiculo
ALTER TABLE tp_veiculos ADD COLUMN IF NOT EXISTS foto_url text;

-- Foto do ticket original (preenchido pelo N8N)
ALTER TABLE tp_fretes ADD COLUMN IF NOT EXISTS foto_ticket_url text;

-- ============================================
-- PUSH SUBSCRIPTIONS: persistencia no Supabase
-- ============================================

CREATE TABLE IF NOT EXISTS tp_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text UNIQUE NOT NULL,
  keys jsonb NOT NULL,
  device_name text DEFAULT 'Desconhecido',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: allow all via anon key (single-tenant app, PIN auth)
ALTER TABLE tp_push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all push ops" ON tp_push_subscriptions FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- STORAGE: bucket publico para fotos
-- ============================================

-- Criar bucket 'fotos' via SQL (Supabase Storage)
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos', 'fotos', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: qualquer um pode ler (bucket publico)
CREATE POLICY "Public read fotos" ON storage.objects
  FOR SELECT USING (bucket_id = 'fotos');

-- Policy: qualquer autenticado/anonimo pode fazer upload
CREATE POLICY "Allow upload fotos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'fotos');

-- Policy: qualquer um pode atualizar (upsert)
CREATE POLICY "Allow update fotos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'fotos') WITH CHECK (bucket_id = 'fotos');
