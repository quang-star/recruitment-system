"""Durable AI event publication.

Revision ID: 0007
Revises: 0006
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("ai_outbox_events",
        sa.Column("event_id", sa.Uuid(), primary_key=True),
        sa.Column("topic", sa.String(255), nullable=False),
        sa.Column("message_key", sa.String(255), nullable=False),
        sa.Column("envelope", sa.JSON(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.String(100)))
    op.create_index("ix_ai_outbox_pending", "ai_outbox_events", ["available_at", "created_at"],
                    postgresql_where=sa.text("published_at IS NULL"))


def downgrade():
    op.drop_table("ai_outbox_events")
