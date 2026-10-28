"""Private skill occurrence ledger and revision lineage; no historical backfill."""
from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("skill_source_occurrences",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("identity_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("skill_id", sa.Uuid(), nullable=False),
        sa.Column("source_kind", sa.String(2), nullable=False),
        sa.Column("source_version_id", sa.Uuid(), nullable=False),
        sa.Column("normalized_term", sa.String(240), nullable=False),
        sa.Column("raw_term", sa.String(240), nullable=False),
        sa.Column("field_role", sa.String(30), nullable=False),
        sa.Column("first_revision_id", sa.Uuid(), nullable=False),
        sa.Column("latest_revision_id", sa.Uuid(), nullable=False),
        sa.Column("latest_revision_number", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("provenance", sa.String(20), nullable=False),
        sa.Column("normalization_status", sa.String(10), nullable=False),
        sa.Column("confidence", sa.Float()),
        sa.Column("evidence_refs", sa.JSON(), nullable=False),
        sa.Column("safe_context", sa.JSON(), nullable=False),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("source_kind IN ('CV','JD')", name="ck_occurrence_source_kind"),
        sa.CheckConstraint("field_role IN ('CV.skills','JD.requiredSkills','JD.preferredSkills')", name="ck_occurrence_field_role"),
        sa.CheckConstraint("latest_revision_number > 0", name="ck_occurrence_revision_number"),
        sa.CheckConstraint("provenance IN ('EXTRACTED','USER_CONFIRMED','USER_ASSERTED')", name="ck_occurrence_provenance"),
        sa.CheckConstraint("normalization_status IN ('KNOWN','PENDING')", name="ck_occurrence_normalization_status"),
        sa.CheckConstraint("confidence IS NULL OR (confidence >= 0 AND confidence <= 1)", name="ck_occurrence_confidence"),
        sa.UniqueConstraint("source_kind", "source_version_id", "normalized_term", "field_role", name="uk_occurrence_source_term_role"))
    op.create_index("ix_skill_source_occurrences_skill_id", "skill_source_occurrences", ["skill_id"])
    op.create_index("ix_skill_source_occurrences_source_version_id", "skill_source_occurrences", ["source_version_id"])
    op.create_index("ix_occurrence_queue", "skill_source_occurrences", ["skill_id", "active", "source_kind", "last_seen"])
    op.create_table("skill_occurrence_revisions",
        sa.Column("occurrence_id", sa.Uuid(), primary_key=True),
        sa.Column("revision_id", sa.Uuid(), primary_key=True),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("observed_canonical_skill_id", sa.Uuid()),
        sa.Column("normalization_status", sa.String(10), nullable=False),
        sa.Column("provenance", sa.String(20), nullable=False),
        sa.Column("confidence", sa.Float()),
        sa.Column("evidence_refs", sa.JSON(), nullable=False),
        sa.Column("safe_context", sa.JSON(), nullable=False),
        sa.Column("taxonomy_version", sa.String(32)),
        sa.Column("parser_version", sa.String(240)),
        sa.Column("correlation_id", sa.Uuid()),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["occurrence_id"], ["skill_source_occurrences.id"], ondelete="CASCADE", name="fk_occurrence_revision_source"),
        sa.CheckConstraint("revision_number > 0", name="ck_occurrence_link_revision_number"),
        sa.CheckConstraint("normalization_status IN ('KNOWN','PENDING')", name="ck_occurrence_link_normalization_status"),
        sa.CheckConstraint("provenance IN ('EXTRACTED','USER_CONFIRMED','USER_ASSERTED')", name="ck_occurrence_link_provenance"),
        sa.CheckConstraint("confidence IS NULL OR (confidence >= 0 AND confidence <= 1)", name="ck_occurrence_link_confidence"))
    op.create_index("ix_occurrence_revision_id", "skill_occurrence_revisions", ["revision_id"])


def downgrade():
    op.drop_table("skill_occurrence_revisions")
    op.drop_table("skill_source_occurrences")
