ALTER TABLE application_matching_projections
    ADD COLUMN result_generation BIGINT,
    ADD CONSTRAINT ck_application_matching_result_generation CHECK (result_generation IS NULL OR result_generation >= 1);

COMMENT ON COLUMN application_matching_projections.result_generation IS
    'Monotonic AI matching result generation; NULL preserves unknown legacy ordering.';
