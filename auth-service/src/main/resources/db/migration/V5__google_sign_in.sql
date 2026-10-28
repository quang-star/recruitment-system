CREATE TABLE google_identities (
    subject VARCHAR(255) PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES auth_users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_google_subject_not_blank CHECK (char_length(btrim(subject)) > 0)
);

-- Only a digest is persisted. A successful login/link deletes its challenge atomically.
CREATE TABLE google_login_challenges (
    nonce_hash CHAR(64) PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_google_nonce_sha256 CHECK (nonce_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX ix_google_login_challenges_expiry ON google_login_challenges (expires_at);
