/**
 * XMA collection trait rules for is_business_dao / is_crown / is_cowboy (sync, verify, backfill).
 * Exact value matches (case-insensitive, trimmed) from trait inventory / on-chain metadata.
 */

/** @type {readonly [string, string, string]} */
const TRAIT_VALUES = Object.freeze(['business suit', 'mutated crown', 'mutant cowboy']);

function norm(s) {
  return String(s == null ? '' : s)
    .trim()
    .toLowerCase();
}

/** Head / Hat / Headwear — inventory uses "Head" for crown & cowboy traits */
const HEAD_TRAIT_TYPES = new Set(['head', 'hat', 'headwear']);

const BUSINESS_DAO_CLOTHES = 'business suit';
const CROWN_HEAD = 'mutated crown';
const COWBOY_HEAD = 'mutant cowboy';

/**
 * @param {object|null} metadata - typically { attributes: [{ trait_type, value }, ...] }
 * @returns {{ is_business_dao: boolean, is_crown: boolean, is_cowboy: boolean }}
 */
function inferTraitFlagsFromMetadata(metadata) {
  let is_business_dao = false;
  let is_crown = false;
  let is_cowboy = false;

  const attrs = metadata && Array.isArray(metadata.attributes) ? metadata.attributes : [];

  for (const a of attrs) {
    const t = norm(a.trait_type);
    const v = norm(a.value);

    if (t === 'clothes' && v === BUSINESS_DAO_CLOTHES) {
      is_business_dao = true;
    }

    if (HEAD_TRAIT_TYPES.has(t) && v === CROWN_HEAD) {
      is_crown = true;
    }

    if (HEAD_TRAIT_TYPES.has(t) && v === COWBOY_HEAD) {
      is_cowboy = true;
    }
  }

  return { is_business_dao, is_crown, is_cowboy };
}

module.exports = {
  inferTraitFlagsFromMetadata,
  HEAD_TRAIT_TYPES,
  BUSINESS_DAO_CLOTHES,
  CROWN_HEAD,
  COWBOY_HEAD,
};
