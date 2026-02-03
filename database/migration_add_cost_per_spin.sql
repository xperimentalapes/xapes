-- Migration: Add cost_per_spin column to players table
-- This stores the cost per spin for any remaining spins
-- This ensures prize calculations use the correct cost per spin when player reconnects

ALTER TABLE players 
ADD COLUMN IF NOT EXISTS cost_per_spin INTEGER DEFAULT 100;

-- Update existing rows to have default cost per spin of 100
UPDATE players 
SET cost_per_spin = 100 
WHERE cost_per_spin IS NULL;

-- Add comment
COMMENT ON COLUMN players.cost_per_spin IS 'Cost per spin (in XMA) for remaining spins. Used for prize calculations.';
