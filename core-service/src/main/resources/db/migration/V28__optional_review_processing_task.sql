-- Human review/confirmation refers to an actual parsed revision. A task ID is
-- populated only when a worker task exists; never invent a second identity.
ALTER TABLE job_processing_projections ALTER COLUMN processing_task_id DROP NOT NULL;
