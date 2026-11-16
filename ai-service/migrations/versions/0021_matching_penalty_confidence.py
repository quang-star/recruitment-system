"""Add nullable penalty, penalty_version, and confidence columns to matching_results."""
from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("matching_results", sa.Column("penalty", sa.Numeric(5, 2), nullable=True))
    op.add_column("matching_results", sa.Column("penalty_version", sa.String(32), nullable=True))
    op.add_column("matching_results", sa.Column("confidence", sa.Numeric(4, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("matching_results", "confidence")
    op.drop_column("matching_results", "penalty_version")
    op.drop_column("matching_results", "penalty")
