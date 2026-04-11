/**
 * XMA collection trait rules for is_burn_squad / is_crown / is_cowboy (sync, verify, backfill).
 * Exact value matches (case-insensitive, trimmed) from trait inventory — see database/trait_inventory_body_head.json.
 */

/** @type {readonly [string, string, string]} */
const TRAIT_VALUES = Object.freeze(['volcanic ape', 'mutated crown', 'mutant cowboy']);

function norm(s) {
  return String(s == null ? '' : s)
    .trim()
    .toLowerCase();
}

/** Head / Hat / Headwear — inventory uses "Head" for crown & cowboy traits */
const HEAD_TRAIT_TYPES = new Set(['head', 'hat', 'headwear']);

const BURN_SQUAD_BODY = 'volcanic ape';
const CROWN_HEAD = 'mutated crown';
const COWBOY_HEAD = 'mutant cowboy';

/**
 * @param {object|null} metadata - typically { attributes: [{ trait_type, value }, ...] }
 * @returns {{ is_burn_squad: boolean, is_crown: boolean, is_cowboy: boolean }}
 */
function inferTraitFlagsFromMetadata(metadata) {
  let is_burn_squad = false;
  let is_crown = false;
  let is_cowboy = false;

  const attrs = metadata && Array.isArray(metadata.attributes) ? metadata.attributes : [];

  for (const a of attrs) {
    const t = norm(a.trait_type);
    const v = norm(a.value);

    if (t === 'body' && v === BURN_SQUAD_BODY) {
      is_burn_squad = true;
    }

    if (HEAD_TRAIT_TYPES.has(t) && v === CROWN_HEAD) {
      is_crown = true;
    }

    if (HEAD_TRAIT_TYPES.has(t) && v === COWBOY_HEAD) {
      is_cowboy = true;
    }
  }

  return { is_burn_squad, is_crown, is_cowboy };
}

module.exports = {
  inferTraitFlagsFromMetadata,
  HEAD_TRAIT_TYPES,
  BURN_SQUAD_BODY,
  CROWN_HEAD,
  COWBOY_HEAD,
};
