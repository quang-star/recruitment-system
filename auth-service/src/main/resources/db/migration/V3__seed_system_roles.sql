INSERT INTO roles (public_id, code, name, description, system_role)
VALUES
    ('10000000-0000-4000-8000-000000000001', 'CANDIDATE', 'Candidate',
     'Creates a candidate profile, manages CVs, and submits applications.', TRUE),
    ('10000000-0000-4000-8000-000000000002', 'RECRUITER', 'Recruiter',
     'May join companies; company-scoped authorization remains in Core Service.', TRUE),
    ('10000000-0000-4000-8000-000000000003', 'SYSTEM_ADMIN', 'System administrator',
     'Performs explicitly audited system administration tasks.', TRUE);
