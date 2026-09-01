ALTER TABLE applications
    ADD COLUMN cover_letter TEXT,
    ADD COLUMN submission_idempotency_key_hash CHAR(64),
    ADD COLUMN submission_request_hash CHAR(64);

ALTER TABLE applications
    ADD CONSTRAINT uk_applications_candidate_idempotency
        UNIQUE (candidate_user_id, submission_idempotency_key_hash),
    ADD CONSTRAINT ck_applications_cover_letter
        CHECK (cover_letter IS NULL OR char_length(cover_letter) <= 5000),
    ADD CONSTRAINT ck_applications_submission_hashes
        CHECK (
            (submission_idempotency_key_hash IS NULL AND submission_request_hash IS NULL)
            OR (
                submission_idempotency_key_hash ~ '^[0-9a-f]{64}$'
                AND submission_request_hash ~ '^[0-9a-f]{64}$'
            )
        );
