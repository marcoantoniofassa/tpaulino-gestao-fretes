-- v2-01: tabela tp_mensagens_raw (fila de processamento OCR)
CREATE TABLE tp_mensagens_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  msg_id text NOT NULL,
  chat_jid text NOT NULL,
  sender_jid text,
  timestamp_msg timestamptz NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  media_base64 text,
  media_supabase_path text,
  caption text,
  source text NOT NULL DEFAULT 'evolution',
  status text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE','PROCESSANDO','OK','ERRO','IGNORADO','DUPLICADO')),
  ocr_resultado jsonb,
  frete_id uuid REFERENCES tp_fretes(id),
  erro_detalhe text,
  tentativas int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (msg_id, chat_jid)
);

CREATE INDEX idx_tp_msgs_status ON tp_mensagens_raw(status);
CREATE INDEX idx_tp_msgs_timestamp ON tp_mensagens_raw(timestamp_msg DESC);
CREATE INDEX idx_tp_msgs_chat_jid ON tp_mensagens_raw(chat_jid);
CREATE INDEX idx_tp_msgs_frete_id ON tp_mensagens_raw(frete_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION tp_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tp_msgs_raw_updated
  BEFORE UPDATE ON tp_mensagens_raw
  FOR EACH ROW EXECUTE FUNCTION tp_update_updated_at();

-- RLS
ALTER TABLE tp_mensagens_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tp_mensagens_raw_read" ON tp_mensagens_raw FOR SELECT USING (true);
