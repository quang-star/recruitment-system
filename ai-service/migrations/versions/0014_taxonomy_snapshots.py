"""Preserve published catalog snapshots and both input taxonomy versions."""
import json
from alembic import op
import sqlalchemy as sa
from app.taxonomy.normalizer import _taxonomy_path

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("taxonomy_versions", sa.Column("payload", sa.JSON()))
    op.add_column("matching_results", sa.Column("input_taxonomy_versions", sa.JSON()))
    table = sa.table("taxonomy_versions", sa.column("semantic_version", sa.String), sa.column("payload", sa.JSON))
    seed = json.loads(_taxonomy_path().read_text(encoding="utf-8"))
    op.get_bind().execute(table.update().where(table.c.semantic_version == seed["semanticVersion"]).values(payload=seed))


def downgrade():
    op.drop_column("matching_results", "input_taxonomy_versions")
    op.drop_column("taxonomy_versions", "payload")
