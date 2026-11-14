-- Index-only migration: no data or constraint changes.

-- CV erasure locks and rewrites every application of a CV (JooqCvPrivacyRepository).
CREATE INDEX ix_applications_cv_version ON applications (cv_id, cv_version_id);

-- Referencing side of access-grant foreign keys (RESTRICT checks and per-CV/company lookups).
CREATE INDEX ix_application_grants_cv_version ON application_cv_access_grants (cv_version_id);
CREATE INDEX ix_application_grants_company ON application_cv_access_grants (company_id);
CREATE INDEX ix_application_grants_consent ON application_cv_access_grants (consent_id);

-- Erasure worker claims incomplete entries ordered by next attempt.
CREATE INDEX ix_cv_erasure_queue_pending ON cv_erasure_queue (next_attempt_at)
    WHERE completed_at IS NULL;

-- Retention cleanup of delivered outbox events.
CREATE INDEX ix_outbox_events_published ON outbox_events (published_at)
    WHERE published_at IS NOT NULL;

-- Public job search and counts filter published jobs and order by publication time.
CREATE INDEX ix_jobs_published ON jobs (published_at DESC, id)
    WHERE status = 'PUBLISHED';
