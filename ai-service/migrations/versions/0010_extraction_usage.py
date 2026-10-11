"""Durable external extraction admission budgets and metadata."""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "extraction_daily_budgets",
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("scope", sa.String(50), primary_key=True),
        sa.Column("call_count", sa.Integer(), nullable=False),
        sa.CheckConstraint("call_count >= 0", name="ck_extraction_budget_count"),
    )
    op.create_table(
        "extraction_usage",
        sa.Column("request_key", sa.String(64), primary_key=True),
        sa.Column("owner_user_id", sa.Uuid(), nullable=False),
        sa.Column("resource_id", sa.Uuid(), nullable=False),
        sa.Column("document_kind", sa.String(2), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("model", sa.String(120), nullable=False),
        sa.Column("policy_version", sa.String(40), nullable=False),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("input_tokens IS NULL OR input_tokens >= 0", name="ck_extraction_input_tokens"),
        sa.CheckConstraint("output_tokens IS NULL OR output_tokens >= 0", name="ck_extraction_output_tokens"),
    )


def downgrade():
    op.drop_table("extraction_usage")
    op.drop_table("extraction_daily_budgets")
