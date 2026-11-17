CREATE TABLE cv_erasure_queue (
    cv_version_id UUID PRIMARY KEY,
    object_key VARCHAR(600),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    CONSTRAINT ck_cv_erasure_attempts CHECK (attempts >= 0)
);
