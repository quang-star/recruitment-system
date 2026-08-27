"""seed versioned IT skill taxonomy and tag matching results

Revision ID: 0006
Revises: 0005
"""
from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "taxonomy_versions",
        sa.Column("semantic_version", sa.String(length=32), primary_key=True),
        sa.Column("schema_version", sa.String(length=60), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("language_scope", sa.JSON(), nullable=False),
        sa.Column("source_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("status IN ('DRAFT','ACTIVE','RETIRED')", name="ck_taxonomy_versions_status"),
    )
    op.create_table(
        "taxonomy_skills",
        sa.Column("stable_id", sa.Uuid(), primary_key=True),
        sa.Column("taxonomy_version", sa.String(length=32), nullable=False),
        sa.Column("canonical_name", sa.String(length=160), nullable=False),
        sa.Column("normalized_name", sa.String(length=160), nullable=False),
        sa.Column("skill_type", sa.String(length=40), nullable=False),
        sa.Column("category", sa.String(length=60), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.ForeignKeyConstraint(["taxonomy_version"], ["taxonomy_versions.semantic_version"],
                                name="fk_taxonomy_skills_version"),
        sa.UniqueConstraint("taxonomy_version", "normalized_name",
                            name="uk_taxonomy_skills_normalized"),
    )
    op.create_table(
        "taxonomy_skill_aliases",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("taxonomy_version", sa.String(length=32), nullable=False),
        sa.Column("skill_id", sa.Uuid(), nullable=False),
        sa.Column("value", sa.String(length=160), nullable=False),
        sa.Column("normalized", sa.String(length=160), nullable=False),
        sa.Column("language", sa.String(length=20), nullable=False),
        sa.ForeignKeyConstraint(["taxonomy_version"], ["taxonomy_versions.semantic_version"],
                                name="fk_taxonomy_aliases_version"),
        sa.ForeignKeyConstraint(["skill_id"], ["taxonomy_skills.stable_id"],
                                name="fk_taxonomy_aliases_skill"),
        sa.UniqueConstraint("taxonomy_version", "normalized", name="uk_taxonomy_aliases_normalized"),
    )

    source, raw = _load_seed()
    payload = json.loads(raw)
    version = payload["semanticVersion"]
    version_table = sa.table(
        "taxonomy_versions",
        sa.column("semantic_version", sa.String), sa.column("schema_version", sa.String),
        sa.column("status", sa.String), sa.column("language_scope", sa.JSON),
        sa.column("source_hash", sa.String),
    )
    op.bulk_insert(version_table, [{
        "semantic_version": version,
        "schema_version": payload["schemaVersion"],
        "status": "ACTIVE" if payload["status"] == "DRAFT" else payload["status"],
        "language_scope": payload["languageScope"],
        "source_hash": sha256(raw).hexdigest(),
    }])
    skills_table = sa.table(
        "taxonomy_skills",
        sa.column("stable_id", sa.Uuid), sa.column("taxonomy_version", sa.String),
        sa.column("canonical_name", sa.String), sa.column("normalized_name", sa.String),
        sa.column("skill_type", sa.String), sa.column("category", sa.String), sa.column("status", sa.String),
    )
    op.bulk_insert(skills_table, [{
        "stable_id": skill["stableId"], "taxonomy_version": version,
        "canonical_name": skill["canonicalName"], "normalized_name": skill["normalizedName"],
        "skill_type": skill["type"], "category": skill["category"], "status": skill["status"],
    } for skill in payload["skills"]])
    aliases_table = sa.table(
        "taxonomy_skill_aliases",
        sa.column("taxonomy_version", sa.String), sa.column("skill_id", sa.Uuid),
        sa.column("value", sa.String), sa.column("normalized", sa.String), sa.column("language", sa.String),
    )
    aliases = [{
        "taxonomy_version": version, "skill_id": skill["stableId"],
        "value": alias["value"], "normalized": alias["normalized"], "language": alias["language"],
    } for skill in payload["skills"] for alias in skill.get("aliases", [])]
    if aliases:
        op.bulk_insert(aliases_table, aliases)

    op.add_column("matching_results", sa.Column(
        "taxonomy_version", sa.String(length=32), nullable=False, server_default=version,
    ))
    op.create_foreign_key("fk_matching_results_taxonomy", "matching_results", "taxonomy_versions",
                          ["taxonomy_version"], ["semantic_version"])
    op.alter_column("matching_results", "taxonomy_version", server_default=None)


def downgrade() -> None:
    op.drop_constraint("fk_matching_results_taxonomy", "matching_results", type_="foreignkey")
    op.drop_column("matching_results", "taxonomy_version")
    op.drop_table("taxonomy_skill_aliases")
    op.drop_table("taxonomy_skills")
    op.drop_table("taxonomy_versions")


def _load_seed() -> tuple[Path, bytes]:
    migration = Path(__file__).resolve()
    candidates = (
        migration.parents[3] / "contracts" / "taxonomy" / "it-skills-v1.seed.json",
        migration.parents[2] / "contracts" / "taxonomy" / "it-skills-v1.seed.json",
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate, candidate.read_bytes()
    raise RuntimeError("it-skills-v1 taxonomy seed is unavailable")

