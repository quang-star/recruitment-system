"""AI-owned catalog used for the duration of a parse or review."""
import json
from sqlalchemy import Integer, JSON, select
from sqlalchemy.orm import Mapped, Session, mapped_column
from app.shared.database import Base
from app.taxonomy.normalizer import _taxonomy_path, build_taxonomy


class SkillCatalogRecord(Base):
    __tablename__ = "skill_catalog"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    skills: Mapped[list] = mapped_column(JSON, nullable=False)


def seed_skills() -> list:
    return json.loads(_taxonomy_path().read_text(encoding="utf-8"))["skills"]


def head(session: Session, *, lock=False) -> SkillCatalogRecord:
    query = select(SkillCatalogRecord).where(SkillCatalogRecord.id == 1)
    if lock:
        query = query.with_for_update()
    value = session.scalar(query.execution_options(populate_existing=True))
    if value is None:
        # Migrations always create this row; tests may seed it explicitly.
        raise RuntimeError("Published skill catalog is unavailable")
    return value


def snapshot(session: Session):
    value = head(session)
    return build_taxonomy({"semanticVersion": f"1.0.{value.version}",
                           "skills": [skill for skill in value.skills if skill["status"] == "ACTIVE"]})
