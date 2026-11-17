-- [jooq ignore start]
CREATE FUNCTION pg_temp.auth_business_id(legacy UUID) RETURNS BIGINT
LANGUAGE plpgsql STRICT AS $$
DECLARE converted BIGINT; variants BIGINT;
BEGIN
    SELECT MIN(entity_id),COUNT(DISTINCT entity_id) INTO converted,variants
    FROM legacy_identity_map WHERE service='auth' AND legacy_id=legacy;
    IF variants<>1 THEN RAISE EXCEPTION 'Auth resource identity mapping is missing or ambiguous'; END IF;
    RETURN converted;
END $$;
ALTER TABLE auth_audit_logs ALTER COLUMN resource_id TYPE BIGINT USING pg_temp.auth_business_id(resource_id);
ALTER TABLE idempotency_records ALTER COLUMN resource_id TYPE BIGINT USING pg_temp.auth_business_id(resource_id);
ALTER TABLE outbox_events ALTER COLUMN aggregate_id TYPE BIGINT USING pg_temp.auth_business_id(aggregate_id);
-- [jooq ignore stop]
-- The offline jOOQ interpreter has no data or migration functions.
ALTER TABLE auth_audit_logs ALTER COLUMN resource_id TYPE BIGINT;
ALTER TABLE idempotency_records ALTER COLUMN resource_id TYPE BIGINT;
ALTER TABLE outbox_events ALTER COLUMN aggregate_id TYPE BIGINT;
