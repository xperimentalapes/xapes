-- Recompute is_business_dao, is_crown, is_cowboy from metadata_json.attributes.
-- Exact matches (case-insensitive, trimmed) — same as lib/holder/trait-flags.js:
--   Clothes value = Business Suit
--   Head|Hat|Headwear  value = Mutated Crown
--   Head|Hat|Headwear  value = Mutant Cowboy

UPDATE nfts
SET
  is_business_dao = EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(metadata_json -> 'attributes', '[]'::jsonb)) AS elem
    WHERE lower(trim(elem ->> 'trait_type')) = 'clothes'
      AND lower(trim(elem ->> 'value')) = 'business suit'
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
