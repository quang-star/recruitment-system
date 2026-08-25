"""add owned ParsedJD revisions and confirmed heads

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "parsed_jd_revisions",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("public_id", sa.Uuid(), nullable=False, unique=True),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("job_version_id", sa.Uuid(), nullable=False),
        sa.Column("owner_user_id", sa.Uuid(), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("source_hash", sa.String(length=64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PARSED"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("confirmed_by", sa.Uuid(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="0"),
        sa.UniqueConstraint("job_version_id", "revision_number",
                            name="uk_parsed_jd_revisions_version"),
        sa.CheckConstraint("revision_number > 0", name="ck_parsed_jd_revisions_number"),
        sa.CheckConstraint("source_hash ~ '^[0-9a-f]{64}$'",
                           name="ck_parsed_jd_revisions_source_hash"),
        sa.CheckConstraint("status IN ('PARSED','CONFIRMED','SUPERSEDED')",
                           name="ck_parsed_jd_revisions_status"),
        sa.CheckConstraint("version >= 0", name="ck_parsed_jd_revisions_version"),
        sa.CheckConstraint("(status = 'CONFIRMED') = (confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)",
                           name="ck_parsed_jd_revisions_confirmation"),
        sa.CheckConstraint("updated_at >= created_at", name="ck_parsed_jd_revisions_timestamps"),
    )
    op.create_index("ix_parsed_jd_revisions_owner_version", "parsed_jd_revisions",
                    ["owner_user_id", "job_version_id"], unique=False)

    op.create_table(
        "parsed_jd_heads",
        sa.Column("job_version_id", sa.Uuid(), primary_key=True),
        sa.Column("revision_id", sa.BigInteger(), nullable=False),
        sa.Column("confirmed_by", sa.Uuid(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["revision_id"], ["parsed_jd_revisions.id"],
                                name="fk_parsed_jd_heads_revision"),
        sa.CheckConstraint("version >= 0", name="ck_parsed_jd_heads_version"),
    )


def downgrade() -> None:
    op.drop_table("parsed_jd_heads")
    op.drop_index("ix_parsed_jd_revisions_owner_version", table_name="parsed_jd_revisions")
    op.drop_table("parsed_jd_revisions")
