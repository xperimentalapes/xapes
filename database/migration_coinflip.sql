-- Coin Flip game: persist flips and rounds across refreshes/disconnects

-- Player state: purchased flips and totals
CREATE TABLE IF NOT EXISTS coinflip_players (
    wallet_address TEXT PRIMARY KEY,
    flips_remaining INTEGER DEFAULT 0,
    cost_per_flip BIGINT DEFAULT 0,
    total_wagered BIGINT DEFAULT 0,
    total_won BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Each flip round: bet, prediction, result, payout
CREATE TABLE IF NOT EXISTS coinflip_rounds (
    id BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL REFERENCES coinflip_players(wallet_address) ON DELETE CASCADE,
    bet_amount BIGINT NOT NULL,
    prediction TEXT NOT NULL CHECK (prediction IN ('heads', 'tails')),
    result TEXT NOT NULL CHECK (result IN ('heads', 'tails')),
    won_amount BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coinflip_rounds_wallet ON coinflip_rounds(wallet_address);
CREATE INDEX IF NOT EXISTS idx_coinflip_rounds_created_at ON coinflip_rounds(created_at DESC);

-- Trigger to update updated_at on coinflip_players
CREATE TRIGGER update_coinflip_players_updated_at
    BEFORE UPDATE ON coinflip_players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE coinflip_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE coinflip_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coinflip players read" ON coinflip_players FOR SELECT USING (true);
CREATE POLICY "Coinflip players insert" ON coinflip_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Coinflip players update" ON coinflip_players FOR UPDATE USING (true);

CREATE POLICY "Coinflip rounds read" ON coinflip_rounds FOR SELECT USING (true);
CREATE POLICY "Coinflip rounds insert" ON coinflip_rounds FOR INSERT WITH CHECK (true);
