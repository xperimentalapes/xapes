-- GK founder compromised wallet (Jun 2026): unlink from Discord and clear NFT stamps.
-- Run in Supabase SQL editor after deploy.

DELETE FROM discord_wallet_links
WHERE wallet_address = '5ZpbzchZ6QacUDA5hAAXGkv6bcoqVaVqBrrry511fsw5';

UPDATE nfts
SET discord_user_id = NULL,
    updated_at = NOW()
WHERE owner_wallet = '5ZpbzchZ6QacUDA5hAAXGkv6bcoqVaVqBrrry511fsw5';
