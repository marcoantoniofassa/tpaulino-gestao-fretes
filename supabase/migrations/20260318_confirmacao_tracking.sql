-- Track WhatsApp confirmation delivery status
-- Issue: #4 - confirmacao best-effort falha silenciosa
ALTER TABLE tp_fretes ADD COLUMN IF NOT EXISTS confirmacao_enviada boolean DEFAULT false;
ALTER TABLE tp_fretes ADD COLUMN IF NOT EXISTS confirmacao_erro text;

-- Backfill existing fretes as confirmed
UPDATE tp_fretes SET confirmacao_enviada = true WHERE status = 'OK';
