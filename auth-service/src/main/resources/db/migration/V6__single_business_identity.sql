-- Retain UUID-to-ID mappings for the coordinated Core/AI data conversion.
-- Existing BIGINT keys and their foreign keys remain unchanged.
CREATE TABLE legacy_identity_map (
    service VARCHAR(20) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    legacy_id UUID NOT NULL,
    entity_id BIGINT NOT NULL CHECK (entity_id > 0),
    PRIMARY KEY (service, entity_type, legacy_id),
    UNIQUE (service, entity_type, entity_id)
);

INSERT INTO legacy_identity_map SELECT 'auth', 'user', public_id, id FROM auth_users;
INSERT INTO legacy_identity_map SELECT 'auth', 'session', public_id, id FROM auth_sessions;
INSERT INTO legacy_identity_map SELECT 'auth', 'role', public_id, id FROM roles;
INSERT INTO legacy_identity_map SELECT 'auth', 'permission', public_id, id FROM permissions;
INSERT INTO legacy_identity_map SELECT 'auth', 'refresh_token', public_id, id FROM refresh_tokens;
INSERT INTO legacy_identity_map SELECT 'auth', 'one_time_token', public_id, id FROM one_time_tokens;
INSERT INTO legacy_identity_map SELECT 'auth', 'audit_log', public_id, id FROM auth_audit_logs;
INSERT INTO legacy_identity_map SELECT 'auth', 'idempotency_record', public_id, id FROM idempotency_records;

ALTER TABLE auth_users DROP COLUMN public_id;
ALTER TABLE auth_sessions DROP COLUMN public_id;
ALTER TABLE roles DROP COLUMN public_id;
ALTER TABLE permissions DROP COLUMN public_id;
ALTER TABLE refresh_tokens DROP COLUMN public_id;
ALTER TABLE one_time_tokens DROP COLUMN public_id;
ALTER TABLE auth_audit_logs DROP COLUMN public_id;
ALTER TABLE idempotency_records DROP COLUMN public_id;
-- The outbox UUID identifies a message independently of its aggregate.
ALTER TABLE outbox_events RENAME COLUMN public_id TO event_id;
