ALTER TABLE cv_versions ADD COLUMN external_ai_consent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cv_versions ADD COLUMN external_ai_policy_version VARCHAR(40);
ALTER TABLE cv_versions ADD CONSTRAINT ck_cv_external_ai_consent CHECK (
    (external_ai_consent AND external_ai_policy_version IS NOT NULL AND length(external_ai_policy_version) > 0)
    OR (NOT external_ai_consent AND external_ai_policy_version IS NULL)
);

ALTER TABLE job_versions ADD COLUMN external_ai_consent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE job_versions ADD COLUMN external_ai_policy_version VARCHAR(40);
ALTER TABLE job_versions ADD CONSTRAINT ck_job_external_ai_consent CHECK (
    (external_ai_consent AND external_ai_policy_version IS NOT NULL AND length(external_ai_policy_version) > 0)
    OR (NOT external_ai_consent AND external_ai_policy_version IS NULL)
);
