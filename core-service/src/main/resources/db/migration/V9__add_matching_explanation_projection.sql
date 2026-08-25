ALTER TABLE application_matching_projections
    ADD COLUMN explanation JSONB NOT NULL DEFAULT '{}'::jsonb;
