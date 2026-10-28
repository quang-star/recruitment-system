"""Immutable job matching scope and versioned hybrid comparison results."""
from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("job_matching_domains", sa.Column("job_version_id", sa.Uuid(), primary_key=True),
                    sa.Column("domain", sa.String(20), nullable=False),
                    sa.CheckConstraint("domain IN ('IT', 'OUTSIDE_IT')", name="ck_job_matching_scope"))
    op.create_table("matching_shadow_results", sa.Column("matching_result_id", sa.Uuid(), primary_key=True),
                    sa.Column("application_id", sa.Uuid(), nullable=False),
                    sa.Column("cv_version_id", sa.Uuid(), nullable=False),
                    sa.Column("algorithm_version", sa.String(80), nullable=False),
                    sa.Column("model_id", sa.String(120), nullable=False),
                    sa.Column("model_revision", sa.String(40), nullable=False),
                    sa.Column("baseline_score", sa.Float(), nullable=False),
                    sa.Column("semantic_score", sa.Float()), sa.Column("hybrid_score", sa.Float(), nullable=False),
                    sa.Column("status", sa.String(30), nullable=False),
                    sa.Column("fallback_code", sa.String(80)), sa.Column("semantic_weight", sa.Float(), nullable=False),
                    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_matching_shadow_cv", "matching_shadow_results", ["cv_version_id"])
    op.create_index("ix_matching_shadow_application", "matching_shadow_results", ["application_id"])


def downgrade():
    op.drop_table("matching_shadow_results")
    op.drop_table("job_matching_domains")
