"""Versioned AI-owned skill catalog and approval audit."""
import json
from alembic import op
import sqlalchemy as sa
from app.taxonomy.normalizer import _taxonomy_path

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    table = op.create_table(
        "skill_catalog", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("skills", sa.JSON(), nullable=False),
        sa.CheckConstraint("id = 1 AND version >= 0", name="ck_skill_catalog_head"),
    )
    seed = json.loads(_taxonomy_path().read_text(encoding="utf-8"))
    op.bulk_insert(table, [{"id": 1, "version": 0, "skills": seed["skills"]}])
    op.create_table(
        "skill_catalog_history", sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("skill_id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("catalog_version", sa.Integer(), nullable=False),
        sa.Column("before_state", sa.JSON()), sa.Column("after_state", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_skill_catalog_history_skill", "skill_catalog_history", ["skill_id", "created_at"])


def downgrade():
    op.drop_table("skill_catalog_history")
    op.drop_table("skill_catalog")
