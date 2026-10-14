"""Fence CV results belonging to previous user retry attempts."""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("processing_tasks", sa.Column("processing_generation", sa.BigInteger(),
                                               nullable=False, server_default="0"))
    op.create_check_constraint("ck_task_processing_generation", "processing_tasks", "processing_generation >= 0")


def downgrade():
    op.drop_constraint("ck_task_processing_generation", "processing_tasks", type_="check")
    op.drop_column("processing_tasks", "processing_generation")
