-- Holder verification, NFT index, Discord role rules (service-role / server only; RLS on, no policies)
-- Run in Supabase SQL editor after review.

CREATE TABLE IF NOT EXISTS discord_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    discord_role_id TEXT NOT NULL,
    display_name TEXT,
    rule_type TEXT NOT NULL,
    rule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_roles_active ON discord_roles (active, sort_order);

CREATE TABLE IF NOT EXISTS discord_wallet_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL,
    wallet_address TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_wallet_links_discord ON discord_wallet_links (discord_user_id);

CREATE TABLE IF NOT EXISTS nfts (
    mint_address TEXT PRIMARY KEY,
    collection_mint TEXT NOT NULL,
    collection_name TEXT,
    name TEXT,
    image_url TEXT,
    metadata_json JSONB,
    is_crown BOOLEAN NOT NULL DEFAULT false,
    is_cowboy BOOLEAN NOT NULL DEFAULT false,
    is_burn_squad BOOLEAN NOT NULL DEFAULT false,
    owner_wallet TEXT,
    discord_user_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nfts_collection ON nfts (collection_mint);
CREATE INDEX IF NOT EXISTS idx_nfts_owner ON nfts (owner_wallet);
CREATE INDEX IF NOT EXISTS idx_nfts_discord ON nfts (discord_user_id);

ALTER TABLE discord_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_wallet_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfts ENABLE ROW LEVEL SECURITY;

-- Optional: keep updated_at fresh (requires update_updated_at_column from schema.sql)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER update_discord_wallet_links_updated_at
      BEFORE UPDATE ON discord_wallet_links
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_nfts_updated_at
      BEFORE UPDATE ON nfts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
