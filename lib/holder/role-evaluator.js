/**
 * Decide which configured Discord roles apply given owned NFT rows + XMA balance.
 */

const { inferTraitFlagsFromMetadata } = require('./trait-flags');

function traitMatch(metadata, traitType, traitValue) {
  if (!metadata || !traitType || traitValue == null) return false;
  const wantT = String(traitType).toLowerCase();
  const wantV = String(traitValue).toLowerCase();
  const attrs = Array.isArray(metadata.attributes) ? metadata.attributes : [];
  for (const a of attrs) {
    const t = String(a.trait_type != null ? a.trait_type : '').toLowerCase();
    const v = String(a.value != null ? a.value : '').toLowerCase();
    if (t.includes(wantT) || wantT === t) {
      if (v.includes(wantV) || wantV === v) return true;
    }
  }
  return false;
}

/**
 * @param {object} role - row from discord_roles
 * @param {{ ownedNfts: object[], collectionMint: string, xmaBalanceHuman: number }} ctx
 */
function roleApplies(role, ctx) {
  const ownedNfts = ctx.ownedNfts || [];
  const xmaBalanceHuman = Number(ctx.xmaBalanceHuman) || 0;
  const config = role.rule_config || {};
  const type = role.rule_type;

  if (type === 'collection_min_one') {
    return ownedNfts.length >= 1;
  }

  if (type === 'collection_min_nfts') {
    const min = Number(config.min);
    if (!Number.isFinite(min) || min < 1) return false;
    return ownedNfts.length >= min;
  }

  if (type === 'nft_column_true') {
    const col = config.column;
    if (col !== 'is_crown' && col !== 'is_cowboy' && col !== 'is_burn_squad') return false;
    return ownedNfts.some((n) => n[col] === true);
  }

  if (type === 'metadata_trait') {
    const tt = config.trait_type;
    const tv = config.trait_value;
    return ownedNfts.some((n) => traitMatch(n.metadata_json || {}, tt, tv));
  }

  if (type === 'token_balance_min') {
    const min = Number(config.min);
    if (!Number.isFinite(min) || min < 0) return false;
    return xmaBalanceHuman >= min;
  }

  return false;
}

/**
 * @param {Array<object>} activeRoles
 * @param {Array<object>} ownedNfts
 * @param {string} collectionMint
 * @param {number} [xmaBalanceHuman]
 * @returns {Set<string>}
 */
function expectedDiscordRoleIds(activeRoles, ownedNfts, collectionMint, xmaBalanceHuman) {
  const ctx = {
    ownedNfts,
    collectionMint: collectionMint || '',
    xmaBalanceHuman: xmaBalanceHuman != null ? xmaBalanceHuman : 0,
  };
  const set = new Set();
  for (const role of activeRoles) {
    if (!role.discord_role_id) continue;
    if (roleApplies(role, ctx)) {
      set.add(String(role.discord_role_id));
    }
  }
  return set;
}

/**
 * Map live Helius DAS items (+ optional DB overlay) to evaluator shape.
 */
function mergeLiveItemsWithDb(collectionItems, dbRows) {
  const byMint = new Map();
  for (const row of dbRows || []) {
    if (row.mint_address) byMint.set(row.mint_address, row);
  }
  const out = [];
  for (const item of collectionItems || []) {
    const mint = item.id;
    if (!mint) continue;
    const meta = item.content?.metadata || {};
    const inferred = inferTraitFlagsFromMetadata(meta);
    const db = byMint.get(mint);
    out.push({
      mint_address: mint,
      metadata_json: db?.metadata_json || meta,
      is_crown: db?.is_crown != null ? !!db.is_crown : inferred.is_crown,
      is_cowboy: db?.is_cowboy != null ? !!db.is_cowboy : inferred.is_cowboy,
      is_burn_squad: db?.is_burn_squad != null ? !!db.is_burn_squad : inferred.is_burn_squad,
    });
  }
  return out;
}

/**
 * @param {object[]} nftsRows - from nfts where owner_wallet in wallets
 */
function ownedNftsFromDbRows(nftsRows) {
  return (nftsRows || []).map((row) => ({
    mint_address: row.mint_address,
    metadata_json: row.metadata_json || {},
    is_crown: !!row.is_crown,
    is_cowboy: !!row.is_cowboy,
    is_burn_squad: !!row.is_burn_squad,
  }));
}

module.exports = {
  inferTraitFlagsFromMetadata,
  traitMatch,
  roleApplies,
  expectedDiscordRoleIds,
  mergeLiveItemsWithDb,
  ownedNftsFromDbRows,
};
