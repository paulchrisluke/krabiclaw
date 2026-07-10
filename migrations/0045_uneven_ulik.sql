-- Migration-lineage reconciliation after merging two branches that had each
-- generated a distinct 0041 migration. The OAuth/CIMD DDL represented by this
-- migration's generated snapshot is already applied by the immutable
-- 0041_slow_franklin_richards.sql migration. Blawby environments also retain
-- their immutable 0041_youthful_blizzard.sql through 0044_small_tigra.sql
-- filenames. This no-op joins both snapshot histories without replaying DDL.
SELECT 1;
