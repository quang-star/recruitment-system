"""Separate review CAS from publication and preserve nullable legacy audit metadata."""
from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("skill_catalog", sa.Column("published_version", sa.Integer(), nullable=False, server_default="0"))
    catalog = sa.table("skill_catalog", sa.column("id", sa.Integer), sa.column("version", sa.Integer),
                       sa.column("published_version", sa.Integer), sa.column("skills", sa.JSON))
    connection = op.get_bind()
    for row in connection.execute(sa.select(catalog.c.id, catalog.c.version, catalog.c.skills)).mappings():
        # Preserve the live mapping as well as all historical payloads. Definition
        # compatibility is applied only when a subsequent publication is created.
        connection.execute(catalog.update().where(catalog.c.id == row["id"]).values(
            published_version=row["version"]))
    with op.batch_alter_table("skill_catalog") as batch:
        batch.alter_column("published_version", server_default=None)
        batch.create_check_constraint("ck_skill_catalog_published_version", "published_version >= 0 AND published_version <= version")
    op.add_column("skill_catalog_history", sa.Column("reason", sa.String(1000)))
    op.add_column("skill_catalog_history", sa.Column("correlation_id", sa.Uuid()))


def downgrade():
    op.drop_column("skill_catalog_history", "correlation_id")
    op.drop_column("skill_catalog_history", "reason")
    with op.batch_alter_table("skill_catalog") as batch:
        batch.drop_constraint("ck_skill_catalog_published_version", type_="check")
        batch.drop_column("published_version")
