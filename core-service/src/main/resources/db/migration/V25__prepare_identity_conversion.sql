-- This staging table also accepts mappings exported by Auth and AI while the
-- application is offline. It contains identifiers only, never account data.
CREATE TABLE IF NOT EXISTS legacy_identity_map (
    service VARCHAR(20) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    legacy_id UUID NOT NULL,
    entity_id BIGINT NOT NULL CHECK (entity_id > 0),
    PRIMARY KEY (service, entity_type, legacy_id)
);

-- [jooq ignore start]
INSERT INTO legacy_identity_map SELECT 'core', 'candidate_profile', public_id, id FROM candidate_profiles
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
INSERT INTO legacy_identity_map SELECT 'core', 'recruiter_profile', public_id, id FROM recruiter_profiles
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
INSERT INTO legacy_identity_map SELECT 'core', 'company', public_id, id FROM companies
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
INSERT INTO legacy_identity_map SELECT 'core', 'company_member', public_id, id FROM company_members
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
INSERT INTO legacy_identity_map SELECT 'core', 'cv', public_id, id FROM cvs
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
INSERT INTO legacy_identity_map SELECT 'core', 'cv_version', public_id, id FROM cv_versions
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
INSERT INTO legacy_identity_map SELECT 'core', 'job', public_id, id FROM jobs
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
INSERT INTO legacy_identity_map SELECT 'core', 'job_version', public_id, id FROM job_versions
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
INSERT INTO legacy_identity_map SELECT 'core', 'application', public_id, id FROM applications
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
INSERT INTO legacy_identity_map SELECT 'core', 'application_status_change', public_id, id FROM application_status_history
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
INSERT INTO legacy_identity_map SELECT 'core', 'consent', public_id, id FROM candidate_consents
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
INSERT INTO legacy_identity_map SELECT 'core', 'cv_access_grant', public_id, id FROM application_cv_access_grants
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
INSERT INTO legacy_identity_map SELECT 'core', 'invitation', public_id, id FROM company_invitations
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;
INSERT INTO legacy_identity_map SELECT 'core', 'notification', public_id, id FROM notifications
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;

INSERT INTO legacy_identity_map
SELECT 'core', 'category', id,
       CASE WHEN id::text ~ '^10000000-0000-4000-8000-000000000[0-9]{3}$'
            THEN right(id::text, 12)::BIGINT
            ELSE 1000 + row_number() OVER (ORDER BY id) END
FROM job_category_catalog
ON CONFLICT (service, entity_type, legacy_id) DO UPDATE SET entity_id = EXCLUDED.entity_id;

-- [jooq ignore stop]
CREATE SEQUENCE job_category_catalog_id_seq START WITH 1001;
