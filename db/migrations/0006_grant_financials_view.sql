-- Grant the new `financials.view` permission to the ADMIN row.
--
-- A new key in PERMISSIONS is granted to nobody until a migration says so.
-- Without this, `financials.view` would exist in the type system, appear in the
-- matrix as a column, and be unticked for every role — which looks exactly like
-- a deliberate revocation rather than a permission that was never seeded.
--
-- SUPER_ADMIN has no row and needs none: its set is always every permission and
-- is never read from this table.
--
-- MANAGER IS DELIBERATELY NOT INCLUDED. A manager is a promoted seller; seeing
-- who exists is a different thing from seeing what everyone earns. A super
-- admin can tick it from the matrix, which is the point of the matrix.
--
-- array_append with a NOT-already-present guard rather than a rewrite: an
-- operator may have edited the ADMIN row since 0005, and a migration that reset
-- the matrix on deploy would be a permission screen that changes nothing.
UPDATE "admin_role_permissions"
SET "permissions" = array_append("permissions", 'financials.view')
WHERE "role" = 'ADMIN'
  AND NOT ('financials.view' = ANY("permissions"));
