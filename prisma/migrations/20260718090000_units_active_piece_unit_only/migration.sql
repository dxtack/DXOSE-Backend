-- Data-only: keep Piece + Unit active; deactivate every other unit.
-- Does not delete rows or change names, abbreviations, descriptions, or IDs.
UPDATE "units"
SET "isActive" = CASE
  WHEN "name" IN ('Piece', 'Unit') THEN true
  ELSE false
END;
