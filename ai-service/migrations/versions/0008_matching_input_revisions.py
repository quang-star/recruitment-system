"""Record the immutable parser inputs used for each matching result."""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    # Nullable for existing results whose inputs cannot be reconstructed safely.
    op.add_column("matching_results", sa.Column("cv_revision_id", sa.Uuid(), nullable=True))
    op.add_column("matching_results", sa.Column("jd_revision_id", sa.Uuid(), nullable=True))
    op.add_column("matching_results", sa.Column("as_of_month", sa.String(7), nullable=True))


def downgrade():
    op.drop_column("matching_results", "as_of_month")
    op.drop_column("matching_results", "jd_revision_id")
    op.drop_column("matching_results", "cv_revision_id")
