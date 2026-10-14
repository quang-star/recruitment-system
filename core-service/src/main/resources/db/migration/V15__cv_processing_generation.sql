-- Keep every existing CV/file; fence late results from earlier retry attempts.
ALTER TABLE cv_versions ADD COLUMN processing_generation BIGINT NOT NULL DEFAULT 0;
ALTER TABLE cv_versions ADD CONSTRAINT ck_cv_processing_generation CHECK (processing_generation >= 0);
