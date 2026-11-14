ALTER TABLE cv_drafts
    DROP CONSTRAINT ck_cv_drafts_template,
    ADD CONSTRAINT ck_cv_drafts_template CHECK (template_id IN ('classic', 'modern', 'minimal', 'executive'));
