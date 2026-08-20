"""create processing tasks

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "processing_tasks",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("public_id", sa.Uuid(), nullable=False, unique=True),
        sa.Column("task_type", sa.String(length=40), nullable=False),
        sa.Column("state", sa.String(length=20), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("safe_error_code", sa.String(length=80)),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("task_type IN ('PARSE_CV','PARSE_JD','MATCH_APPLICATION','REPROCESS')",
                           name="ck_processing_tasks_type"),
        sa.CheckConstraint("state IN ('QUEUED','PROCESSING','RETRYING','COMPLETED','FAILED')",
                           name="ck_processing_tasks_state"),
        sa.CheckConstraint("attempt_count >= 0", name="ck_processing_tasks_attempt_count"),
        sa.CheckConstraint(
            "(state = 'FAILED' AND safe_error_code IS NOT NULL) OR "
            "(state <> 'FAILED' AND safe_error_code IS NULL)",
            name="ck_processing_tasks_safe_error",
        ),
        sa.CheckConstraint("updated_at >= submitted_at", name="ck_processing_tasks_timestamps"),
    )
    op.create_index("ix_processing_tasks_claim", "processing_tasks",
                    ["state", "updated_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_processing_tasks_claim", table_name="processing_tasks")
    op.drop_table("processing_tasks")
