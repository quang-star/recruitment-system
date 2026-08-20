"""add CV processing fields

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("processing_tasks", sa.Column("resource_id", sa.Uuid(), nullable=True))
    op.add_column("processing_tasks", sa.Column("object_ref", sa.String(length=1024), nullable=True))
    op.add_column("processing_tasks", sa.Column("source_hash", sa.String(length=64), nullable=True))
    op.add_column("processing_tasks", sa.Column("result_payload", sa.JSON(), nullable=True))
    op.create_unique_constraint("uk_processing_tasks_resource_id", "processing_tasks", ["resource_id"])
    op.create_check_constraint(
        "ck_processing_tasks_source_hash",
        "processing_tasks",
        "source_hash IS NULL OR source_hash ~ '^[0-9a-f]{64}$'",
    )


def downgrade() -> None:
    op.drop_constraint("ck_processing_tasks_source_hash", "processing_tasks", type_="check")
    op.drop_constraint("uk_processing_tasks_resource_id", "processing_tasks", type_="unique")
    op.drop_column("processing_tasks", "result_payload")
    op.drop_column("processing_tasks", "source_hash")
    op.drop_column("processing_tasks", "object_ref")
    op.drop_column("processing_tasks", "resource_id")
