-- Drop dead-code tables: staff_profiles and awards_recognition have zero
-- callers in server/ and are completely unreachable at runtime.
DROP TABLE IF EXISTS staff_profiles;
DROP TABLE IF EXISTS awards_recognition;
