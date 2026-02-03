-- Create players table
CREATE TABLE IF NOT EXISTS players (
    wallet_address TEXT PRIMARY KEY,
    total_spins INTEGER DEFAULT 0,
    total_won BIGINT DEFAULT 0,
    total_wagered BIGINT DEFAULT 0,
    unclaimed_rewards BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create game_history table
CREATE TABLE IF NOT EXISTS game_history (
    id BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL REFERENCES players(wallet_address) ON DELETE CASCADE,
    spin_cost BIGINT NOT NULL,
    result_symbols INTEGER[] NOT NULL,
    won_amount BIGINT DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_game_history_wallet ON game_history(wallet_address);
CREATE INDEX IF NOT EXISTS idx_game_history_timestamp ON game_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_players_total_won ON players(total_won DESC);
CREATE INDEX IF NOT EXISTS idx_players_total_spins ON players(total_spins DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_history ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all operations for now - can restrict later)
-- Players can read their own data
CREATE POLICY "Players can read own data" ON players
    FOR SELECT USING (true);

CREATE POLICY "Players can insert own data" ON players
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Players can update own data" ON players
    FOR UPDATE USING (true);

-- Game history policies
CREATE POLICY "Anyone can read game history" ON game_history
    FOR SELECT USING (true);

CREATE POLICY "Players can insert own game history" ON game_history
    FOR INSERT WITH CHECK (true);
