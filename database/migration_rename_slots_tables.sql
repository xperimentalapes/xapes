-- Migration: Rename slots tables for clarity
-- Run this BEFORE migration_create_roulette_tables.sql

-- Rename players -> slots_players (FK references auto-update in PostgreSQL)
ALTER TABLE IF EXISTS players RENAME TO slots_players;

-- Rename game_history -> slots_game_history
-- FK to players will now point to slots_players after rename
ALTER TABLE IF EXISTS game_history RENAME TO slots_game_history;

-- Rename indexes for clarity (optional but recommended)
ALTER INDEX IF EXISTS idx_players_total_won RENAME TO idx_slots_players_total_won;
ALTER INDEX IF EXISTS idx_players_total_spins RENAME TO idx_slots_players_total_spins;
ALTER INDEX IF EXISTS idx_game_history_wallet RENAME TO idx_slots_game_history_wallet;
ALTER INDEX IF EXISTS idx_game_history_timestamp RENAME TO idx_slots_game_history_timestamp;

-- Update RLS policy names (drop and recreate with new names)
DROP POLICY IF EXISTS "Players can read own data" ON slots_players;
DROP POLICY IF EXISTS "Players can insert own data" ON slots_players;
DROP POLICY IF EXISTS "Players can update own data" ON slots_players;
CREATE POLICY "Slots players can read" ON slots_players FOR SELECT USING (true);
CREATE POLICY "Slots players can insert" ON slots_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Slots players can update" ON slots_players FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Anyone can read game history" ON slots_game_history;
DROP POLICY IF EXISTS "Players can insert own game history" ON slots_game_history;
CREATE POLICY "Anyone can read slots game history" ON slots_game_history FOR SELECT USING (true);
CREATE POLICY "Slots players can insert game history" ON slots_game_history FOR INSERT WITH CHECK (true);
