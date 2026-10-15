ALTER TABLE job_versions ADD COLUMN industry_id UUID;
ALTER TABLE job_versions ADD COLUMN industry_name VARCHAR(160) NOT NULL DEFAULT 'Công nghệ thông tin';
ALTER TABLE job_versions ADD COLUMN specialization_id UUID;
ALTER TABLE job_versions ADD COLUMN specialization_name VARCHAR(160);
ALTER TABLE job_versions ADD COLUMN position_id UUID;
ALTER TABLE job_versions ADD COLUMN position_name VARCHAR(240);
ALTER TABLE job_versions ADD COLUMN matching_domain VARCHAR(20) NOT NULL DEFAULT 'IT';
UPDATE job_versions SET industry_id = '10000000-0000-4000-8000-000000000001', position_name = title;
ALTER TABLE job_versions ALTER COLUMN position_name SET NOT NULL;
ALTER TABLE job_versions ADD CONSTRAINT ck_job_matching_domain CHECK (matching_domain IN ('IT', 'OUTSIDE_IT'));
-- Snapshot IDs intentionally have no catalog FK: approval/merge must never rewrite historical JD classification.
