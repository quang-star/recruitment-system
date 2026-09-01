ALTER TABLE application_matching_projections
    ADD COLUMN algorithm_version VARCHAR(80) NOT NULL DEFAULT 'legacy-unknown',
    ADD COLUMN taxonomy_version VARCHAR(32) NOT NULL DEFAULT 'legacy-unknown';
