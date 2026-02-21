-- Migration: Create roulette tables
-- Run this AFTER migration_rename_slots_tables.sql

-- Roulette players (same structure as slots_players)
CREATE TABLE IF NOT EXISTS roulette_players (
    wallet_address TEXT PRIMARY KEY,
    total_spins INTEGER DEFAULT 0,
    total_won BIGINT DEFAULT 0,
    total_wagered BIGINT DEFAULT 0,
    unclaimed_rewards BIGINT DEFAULT 0,
    spins_remaining INTEGER DEFAULT 0,
    cost_per_spin INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Roulette game history (result_number TEXT for "0", "00", "1"-"36")
CREATE TABLE IF NOT EXISTS roulette_game_history (
    id BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL REFERENCES roulette_players(wallet_address) ON DELETE CASCADE,
    spin_cost BIGINT NOT NULL,
    result_number TEXT NOT NULL,
    won_amount BIGINT DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roulette_game_history_wallet ON roulette_game_history(wallet_address);
CREATE INDEX IF NOT EXISTS idx_roulette_game_history_timestamp ON roulette_game_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_roulette_players_total_won ON roulette_players(total_won DESC);
CREATE INDEX IF NOT EXISTS idx_roulette_players_total_spins ON roulette_players(total_spins DESC);

-- Trigger for updated_at
CREATE TRIGGER update_roulette_players_updated_at
    BEFORE UPDATE ON roulette_players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE roulette_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE roulette_game_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Roulette players can read" ON roulette_players FOR SELECT USING (true);
CREATE POLICY "Roulette players can insert" ON roulette_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Roulette players can update" ON roulette_players FOR UPDATE USING (true);
CREATE POLICY "Anyone can read roulette game history" ON roulette_game_history FOR SELECT USING (true);
CREATE POLICY "Roulette players can insert game history" ON roulette_game_history FOR INSERT WITH CHECK (true);
