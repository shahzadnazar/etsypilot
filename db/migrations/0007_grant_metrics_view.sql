-- Grant the new `metrics.view` permission to the ADMIN row.
--
-- A new key in PERMISSIONS is granted to nobody until a migration says so.
-- Without this, `metrics.view` would exist in the type system, appear in the
-- matrix as a column, and be unticked for every role — which looks exactly like
-- a deliberate revocation rather than a permission that was never seeded.
--
-- SUPER_ADMIN has no row and needs none: its set is always every permission and
-- is never read from this table.
--
-- MANAGER IS DELIBERATELY NOT INCLUDED, the same shape as 0006. Not because
-- the figures are sensitive — no account is named on that screen — but because
-- a manager is a promoted seller, and how the business is doing is not part of
-- the job they were promoted into. A super admin can tick it from the matrix.
--
-- array_append with a NOT-already-present guard rather than a rewrite: an
-- operator may have edited the ADMIN row, and a migration that reset the matrix
-- on deploy would be a permission screen that changes nothing.
UPDATE "admin_role_permissions"
SET "permissions" = array_append("permissions", 'metrics.view')
WHERE "role" = 'ADMIN'
  AND NOT ('metrics.view' = ANY("permissions"));
