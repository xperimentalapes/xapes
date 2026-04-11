-- Recompute is_burn_squad, is_crown, is_cowboy from metadata_json.attributes.
-- Exact matches (case-insensitive) — same as lib/holder/trait-flags.js:
--   Body  value = Volcanic Ape
--   Head|Hat|Headwear  value = Mutated Crown
--   Head|Hat|Headwear  value = Mutant Cowboy

UPDATE nfts
SET
  is_burn_squad = EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(metadata_json -> 'attributes', '[]'::jsonb)) AS elem
    WHERE lower(trim(elem ->> 'trait_type')) = 'body'
      AND lower(trim(elem ->> 'value')) = 'volcanic ape'
  ),
  is_crown = EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(metadata_json -> 'attributes', '[]'::jsonb)) AS elem
    WHERE lower(trim(elem ->> 'trait_type')) IN ('head', 'hat', 'headwear')
      AND lower(trim(elem ->> 'value')) = 'mutated crown'
  ),
  is_cowboy = EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(metadata_json -> 'attributes', '[]'::jsonb)) AS elem
    WHERE lower(trim(elem ->> 'trait_type')) IN ('head', 'hat', 'headwear')
      AND lower(trim(elem ->> 'value')) = 'mutant cowboy'
  ),
  updated_at = NOW();
