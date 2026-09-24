-- cz_events was CocoZuri's audit trail (migration 0165). 0167 dropped the other
-- 72 tables of the removed modules and missed this one: it was left with Row
-- Level Security OFF, which the Security check reported as "1 table
-- unprotected". It was empty (0 rows, checked 24 Sept 2026) and nothing reads it.
DROP TABLE IF EXISTS "cz_events";
