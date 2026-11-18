-- Extend admin company review actions beyond initial approval so admins can also reject pending
-- registrations, suspend active companies, and reactivate suspended companies with audit trail.
DO $$
DECLARE
    con_name text;
BEGIN
    FOR con_name IN
        SELECT DISTINCT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'company_review_history'::regclass
          AND c.contype = 'c'
          AND a.attname IN ('action', 'from_status', 'to_status')
    LOOP
        EXECUTE format('ALTER TABLE company_review_history DROP CONSTRAINT %I', con_name);
    END LOOP;
END $$;

ALTER TABLE company_review_history
    ADD CONSTRAINT chk_company_review_action
        CHECK (action IN ('APPROVE', 'REJECT', 'SUSPEND', 'REACTIVATE')),
    ADD CONSTRAINT chk_company_review_from_status
        CHECK (from_status IN ('PENDING', 'ACTIVE', 'SUSPENDED')),
    ADD CONSTRAINT chk_company_review_to_status
        CHECK (to_status IN ('ACTIVE', 'SUSPENDED', 'CLOSED'));
