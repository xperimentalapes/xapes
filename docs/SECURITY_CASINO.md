# Casino Security

Production casino games use **server-authoritative** outcomes and **wallet-signed** API requests.

## Wallet authentication

Clients sign a message with Phantom:

```
XapeLabz Casino|<action>|<walletAddress>|<unixTimestamp>
```

Include headers on protected POSTs:

- `x-wallet-message`
- `x-wallet-signature`

Messages expire after 5 minutes (`AUTH_MAX_AGE_SEC`).

## Endpoints

| Endpoint | Action | Purpose |
|----------|--------|---------|
| `POST /api/spin-slots` | `spin-slots` | Server RNG + DB debit/credit |
| `POST /api/spin-roulette` | `spin-roulette` | Server spin from client bet map |
| `POST /api/record-game-purchase` | `purchase-slots` / `purchase-roulette` / `purchase-coinflip` | Verify on-chain XMA tx, credit plays |
| `POST /api/collect` | `collect` | Debit `unclaimed_rewards`, sign payout |
| `POST /api/confirm-collect` | — | Verify payout tx on-chain |
| `POST /api/open-chest` | `open-chest` | Consume open, server roll + reserve |
| `POST /api/coinflip-flip` | `coinflip-flip` | Server flip (existing) |
| `POST /api/coinflip-purchase` | `purchase-coinflip` | Verified purchase |
| `POST /api/coinflip-collect` | `collect` | Debit `total_won`, sign payout |

| `POST /api/confirm-chest-collect` | `confirm-chest-collect` / `collect-chest-restore` | Verify chest prize tx on-chain |
| `POST /api/reserve-chest-prize` | — | **410 deprecated** (use `open-chest`) |

## Follow-up migration

After `migration_casino_security.sql`, run `database/migration_casino_security_followup.sql`:

- `chest_reservations.status` for pending collect flow
- Drop anon INSERT on game history tables
- Chest table RLS

Verify: `npm run verify-casino`

## Restore / failed collect

Payout restore requires wallet auth (`collect-restore`) and either:

- A failed on-chain tx signature (`failSignature`), or
- Payout past `expires_at`

## Deprecated

- `POST /api/save-game` — returns **410**. Client must not send balances or outcomes.

## Database migration

Run `database/migration_casino_security.sql` in Supabase SQL Editor:

- `game_purchase_txs` — dedupe verified purchases
- `casino_pending_payouts` — track debit-before-sign collects
- Removes anon INSERT/UPDATE on player tables

## Env (Vercel)

- `TREASURY_PRIVATE_KEY` — slots/coinflip/roulette collect signer
- `BRONZE_WALLET_KEY` — chest prizes (unchanged)
- `HELIUS_API_KEY` — RPC + chest treasury inventory
- `SUPABASE_SERVICE_KEY` — all writes

## Collect flow

1. Client signs `collect` message.
2. API atomically zeros rewards and inserts `casino_pending_payouts`.
3. API returns signed SPL transfer tx + `payoutId` + `amountRaw`.
4. Client broadcasts tx.
5. Client calls confirm endpoint with `signature`, `payoutId`, `amountRaw`.
6. On broadcast failure, client may call confirm with `failed: true` to restore balance.
