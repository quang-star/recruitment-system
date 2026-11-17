-- Expand allowed states without rewriting existing applications or history.
ALTER TABLE applications DROP CONSTRAINT ck_applications_status;
ALTER TABLE applications ADD CONSTRAINT ck_applications_status
    CHECK (status IN ('SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN'));
