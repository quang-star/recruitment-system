"""Audited reprocessing and honest result/revision lineage; legacy rows stay unchanged."""
from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("parsed_cv_revisions", "parsed_jd_revisions"):
        op.add_column(table, sa.Column("supersedes_revision_id", sa.Uuid(), nullable=True))
        op.add_column(table, sa.Column("reprocess_effect_key", sa.String(64), nullable=True))
        op.create_index(f"uk_{table}_reprocess_effect", table, ["reprocess_effect_key"], unique=True)
    op.add_column("matching_results", sa.Column("result_generation", sa.BigInteger(), nullable=True))
    op.add_column("matching_results", sa.Column("supersedes_matching_result_id", sa.Uuid(), nullable=True))
    op.add_column("matching_results", sa.Column("reprocess_effect_key", sa.String(64), nullable=True))
    op.create_index("uk_matching_results_reprocess_effect", "matching_results", ["reprocess_effect_key"], unique=True)
    op.create_check_constraint("ck_matching_result_generation", "matching_results", "result_generation IS NULL OR result_generation >=1")
    op.add_column("matching_heads", sa.Column("generation", sa.BigInteger(), nullable=False, server_default="0"))
    op.create_check_constraint("ck_matching_head_generation", "matching_heads", "generation >=0")
    op.create_table("reprocessing_batches",
        sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("idempotency_key_hash", sa.String(64), nullable=False), sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("operation", sa.String(30), nullable=False), sa.Column("target_config", sa.JSON(), nullable=False),
        sa.Column("target_hash", sa.String(64), nullable=False), sa.Column("state", sa.String(20), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("checkpoint", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("planned_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("actor_id", "idempotency_key_hash", name="uk_reprocessing_command"),
        sa.CheckConstraint("operation IN ('PARSE_CV','PARSE_JD','MATCH_APPLICATION')", name="ck_reprocessing_operation"),
        sa.CheckConstraint("state IN ('RUNNING','PAUSED','COMPLETED')", name="ck_reprocessing_batch_state"),
        sa.CheckConstraint("version >= 0 AND checkpoint >= 0 AND checkpoint <= planned_count AND planned_count BETWEEN 0 AND 1000",
                           name="ck_reprocessing_batch_bounds"))
    op.create_table("reprocessing_items",
        sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False), sa.Column("resource_id", sa.Uuid()),
        sa.Column("cv_version_id", sa.Uuid()), sa.Column("job_version_id", sa.Uuid()), sa.Column("application_id", sa.Uuid()),
        sa.Column("snapshot", sa.JSON()), sa.Column("current_hash", sa.String(64)), sa.Column("effect_key", sa.String(64)),
        sa.Column("reasons", sa.JSON(), nullable=False), sa.Column("state", sa.String(20), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False), sa.Column("lease_token", sa.Uuid()),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)), sa.Column("output_id", sa.Uuid()),
        sa.Column("safe_error_code", sa.String(80)), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["batch_id"], ["reprocessing_batches.id"], name="fk_reprocessing_item_batch"),
        sa.UniqueConstraint("batch_id", "ordinal", name="uk_reprocessing_item_order"),
        sa.CheckConstraint("state IN ('PENDING','PROCESSING','RETRYING','COMPLETED','SKIPPED','FAILED')", name="ck_reprocessing_item_state"),
        sa.CheckConstraint("ordinal >= 0 AND attempt_count BETWEEN 0 AND 3", name="ck_reprocessing_item_bounds"),
        sa.CheckConstraint("(state='PROCESSING') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)", name="ck_reprocessing_lease"))
    for field in ("batch_id", "resource_id", "cv_version_id", "application_id"):
        op.create_index(f"ix_reprocessing_items_{field}", "reprocessing_items", [field])
    op.create_index("ix_reprocessing_item_claim", "reprocessing_items", ["batch_id", "state", "available_at", "ordinal"])
    op.create_table("reprocessing_attempts",
        sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False), sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("correlation_id", sa.Uuid(), nullable=False), sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)), sa.Column("outcome", sa.String(20)), sa.Column("safe_error_code", sa.String(80)),
        sa.ForeignKeyConstraint(["item_id"], ["reprocessing_items.id"], name="fk_reprocessing_attempt_item"),
        sa.UniqueConstraint("item_id", "number", name="uk_reprocessing_attempt_number"),
        sa.CheckConstraint("number BETWEEN 1 AND 3", name="ck_reprocessing_attempt_bounds"))
    op.create_index("ix_reprocessing_attempts_item_id", "reprocessing_attempts", ["item_id"])
    op.create_table("reprocessing_audit",
        sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("batch_id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False), sa.Column("correlation_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(20), nullable=False), sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["batch_id"], ["reprocessing_batches.id"], name="fk_reprocessing_audit_batch"),
        sa.CheckConstraint("action IN ('CREATE','PAUSE','RESUME')", name="ck_reprocessing_audit_action"))
    op.create_index("ix_reprocessing_audit_batch_id", "reprocessing_audit", ["batch_id"])


def downgrade() -> None:
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT EXISTS(SELECT 1 FROM reprocessing_batches)")) or connection.scalar(
        sa.text("SELECT EXISTS(SELECT 1 FROM matching_results WHERE result_generation IS NOT NULL OR reprocess_effect_key IS NOT NULL)")):
        raise RuntimeError("Cannot downgrade after reprocessing/result lineage has been recorded")
    for table in ("parsed_cv_revisions", "parsed_jd_revisions"):
        if connection.scalar(sa.text(f"SELECT EXISTS(SELECT 1 FROM {table} WHERE reprocess_effect_key IS NOT NULL)")):
            raise RuntimeError("Cannot downgrade recorded parsed reprocessing lineage")
    for table in ("reprocessing_audit", "reprocessing_attempts", "reprocessing_items", "reprocessing_batches"):
        op.drop_table(table)
    op.drop_constraint("ck_matching_head_generation", "matching_heads", type_="check")
    op.drop_column("matching_heads", "generation")
    op.drop_constraint("ck_matching_result_generation", "matching_results", type_="check")
    op.drop_index("uk_matching_results_reprocess_effect", table_name="matching_results")
    for column in ("reprocess_effect_key", "supersedes_matching_result_id", "result_generation"):
        op.drop_column("matching_results", column)
    for table in ("parsed_cv_revisions", "parsed_jd_revisions"):
        op.drop_index(f"uk_{table}_reprocess_effect", table_name=table)
        op.drop_column(table, "reprocess_effect_key")
        op.drop_column(table, "supersedes_revision_id")
