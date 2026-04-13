-- Migration 016: P2P in-order chat messages
-- One table stores all chat messages for P2P orders.
-- RLS: each party can read/write only to orders they're part of.

CREATE TABLE IF NOT EXISTS p2p_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES p2p_orders(id) ON DELETE CASCADE,
  sender_uid  UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  message     TEXT NOT NULL CHECK (char_length(message) <= 300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_p2p_messages_order_id ON p2p_messages(order_id, created_at);

-- Enable Realtime for the chat UI
ALTER PUBLICATION supabase_realtime ADD TABLE p2p_messages;

-- RLS
ALTER TABLE p2p_messages ENABLE ROW LEVEL SECURITY;

-- Only parties to the order can read or insert messages
CREATE POLICY "p2p_messages_party_access" ON p2p_messages
  USING (
    EXISTS (
      SELECT 1 FROM p2p_orders o
      WHERE o.id = p2p_messages.order_id
        AND (o.buyer_uid = get_app_uid() OR o.seller_uid = get_app_uid())
    )
  )
  WITH CHECK (
    sender_uid = get_app_uid()
    AND EXISTS (
      SELECT 1 FROM p2p_orders o
      WHERE o.id = p2p_messages.order_id
        AND (o.buyer_uid = get_app_uid() OR o.seller_uid = get_app_uid())
    )
  );

COMMENT ON TABLE p2p_messages IS 'In-order chat messages between P2P trade parties.';
