"""add deterministic matching result heads

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "matching_results",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("public_id", sa.Uuid(), nullable=False, unique=True),
        sa.Column("application_id", sa.Uuid(), nullable=False),
        sa.Column("cv_version_id", sa.Uuid(), nullable=False),
        sa.Column("job_version_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("final_score", sa.Numeric(5, 2), nullable=False),
        sa.Column("quality_flags", sa.JSON(), nullable=False),
        sa.Column("components", sa.JSON(), nullable=False),
        sa.Column("claims", sa.JSON(), nullable=False),
        sa.Column("algorithm_version", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("status IN ('COMPLETED','DEGRADED','INSUFFICIENT_DATA')",
                           name="ck_matching_results_status"),
        sa.CheckConstraint("final_score >= 0 AND final_score <= 100",
                           name="ck_matching_results_score"),
    )
    op.create_index("ix_matching_results_application_created", "matching_results",
                    ["application_id", "created_at"], unique=False)
    op.create_table(
        "matching_heads",
        sa.Column("application_id", sa.Uuid(), primary_key=True),
        sa.Column("result_id", sa.BigInteger(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["result_id"], ["matching_results.id"],
                                name="fk_matching_heads_result"),
    )


def downgrade() -> None:
    op.drop_table("matching_heads")
    op.drop_index("ix_matching_results_application_created", table_name="matching_results")
    op.drop_table("matching_results")
