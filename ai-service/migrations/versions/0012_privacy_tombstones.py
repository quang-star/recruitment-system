"""Durable fences for CV erasure and application access revocation."""
from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("privacy_tombstones", sa.Column("kind", sa.String(20), primary_key=True),
                    sa.Column("resource_id", sa.Uuid(), primary_key=True),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("privacy_tombstones")
