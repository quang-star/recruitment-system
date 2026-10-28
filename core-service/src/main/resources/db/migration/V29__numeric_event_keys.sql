-- [jooq ignore start]
CREATE FUNCTION pg_temp.numeric_event_key(original TEXT) RETURNS TEXT LANGUAGE plpgsql STRICT AS $$
DECLARE result TEXT := original; legacy TEXT; converted BIGINT; variants BIGINT;
BEGIN
    FOR legacy IN SELECT match[1] FROM regexp_matches(original,
        '([0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})','g') AS match LOOP
        SELECT MIN(entity_id),COUNT(DISTINCT entity_id) INTO converted,variants
        FROM legacy_identity_map WHERE legacy_id=legacy::uuid;
        IF variants<>1 THEN RAISE EXCEPTION 'Event key requires complete, unambiguous identity mappings'; END IF;
        result := replace(result,legacy,converted::text);
    END LOOP;
    RETURN replace(result,'.v1:', '.v2:');
END $$;
UPDATE outbox_events SET event_type=regexp_replace(event_type,'\.v1$','.v2'),
    schema_version=2,idempotency_key=pg_temp.numeric_event_key(idempotency_key);
-- [jooq ignore stop]
