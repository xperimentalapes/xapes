-- Chest opens: track unpaid opens per user (persists across refresh)
CREATE TABLE IF NOT EXISTS chest_opens_available (
    user_wallet TEXT PRIMARY KEY,
    opens_remaining INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prevent double-counting the same purchase tx
CREATE TABLE IF NOT EXISTS chest_purchase_txs (
    tx_signature TEXT PRIMARY KEY,
    user_wallet TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reserve a prize for a user (expires after 5 min so we don't lock forever)
CREATE TABLE IF NOT EXISTS chest_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_wallet TEXT NOT NULL,
    prize_type TEXT NOT NULL CHECK (prize_type IN ('nft', 'token')),
    mint TEXT,
    token_mint TEXT,
    amount NUMERIC,
    decimals INT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chest_reservations_expires ON chest_reservations(expires_at);
CREATE INDEX IF NOT EXISTS idx_chest_reservations_user ON chest_reservations(user_wallet);
CREATE INDEX IF NOT EXISTS idx_chest_reservations_mint ON chest_reservations(mint) WHERE mint IS NOT NULL;

COMMENT ON TABLE chest_opens_available IS 'Unused chest opens per user (incremented on verified purchase, decremented on open)';
COMMENT ON TABLE chest_purchase_txs IS 'Tx signatures already counted for a chest purchase';
COMMENT ON TABLE chest_reservations IS 'Reserved prize for a user; must collect before expires_at';
