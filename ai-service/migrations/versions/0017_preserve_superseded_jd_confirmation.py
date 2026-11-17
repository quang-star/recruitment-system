"""Preserve confirmation metadata when a newer JD revision becomes the head."""
from alembic import op
import sqlalchemy as sa


revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None
CONSTRAINT = "ck_parsed_jd_revisions_confirmation"
PREVIOUS = "(status = 'CONFIRMED') = (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)"


def upgrade():
    # Relax only SUPERSEDED. Every row valid under the previous constraint
    # remains valid; no payload, actor, timestamp, status or head is rewritten.
    with op.batch_alter_table("parsed_jd_revisions") as batch:
        batch.drop_constraint(CONSTRAINT, type_="check")
        batch.create_check_constraint(CONSTRAINT, f"({PREVIOUS}) OR status = 'SUPERSEDED'")


def downgrade():
    retained = op.get_bind().scalar(sa.text("SELECT count(*) FROM parsed_jd_revisions WHERE status='SUPERSEDED' "
                                          "AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL"))
    if retained:
        raise RuntimeError("Cannot downgrade while superseded JD revisions retain confirmation history")
    with op.batch_alter_table("parsed_jd_revisions") as batch:
        batch.drop_constraint(CONSTRAINT, type_="check")
        batch.create_check_constraint(CONSTRAINT, PREVIOUS)
