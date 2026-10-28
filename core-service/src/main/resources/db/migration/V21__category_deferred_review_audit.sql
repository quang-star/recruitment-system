ALTER TABLE job_category_catalog
    DROP CONSTRAINT IF EXISTS job_category_catalog_status_check;
ALTER TABLE job_category_catalog
    ADD CONSTRAINT job_category_catalog_status_check
    CHECK (status IN ('PENDING','DEFERRED','ACTIVE','MERGED','REJECTED'));

-- Deferred proposals retain their names, so a second proposal cannot bypass review.
DROP INDEX uk_job_category_current_root_name;
CREATE UNIQUE INDEX uk_job_category_current_root_name ON job_category_catalog(kind,normalized_name)
    WHERE parent_id IS NULL AND status IN ('PENDING','DEFERRED','ACTIVE');
DROP INDEX uk_job_category_current_child_name;
CREATE UNIQUE INDEX uk_job_category_current_child_name ON job_category_catalog(kind,parent_id,normalized_name)
    WHERE parent_id IS NOT NULL AND status IN ('PENDING','DEFERRED','ACTIVE');

-- Existing history remains unchanged; metadata unavailable at the time stays NULL.
ALTER TABLE job_category_history ADD COLUMN reason VARCHAR(1000);
ALTER TABLE job_category_history ADD COLUMN correlation_id UUID;
ALTER TABLE job_category_history ADD COLUMN version BIGINT;
ALTER TABLE job_category_history ADD CONSTRAINT ck_job_category_history_reason
    CHECK (reason IS NULL OR (length(btrim(reason)) BETWEEN 1 AND 1000));
ALTER TABLE job_category_history ADD CONSTRAINT ck_job_category_history_version
    CHECK (version IS NULL OR version >= 0);
