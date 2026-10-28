from app.shared.database import BUSINESS_ID
from datetime import UTC, datetime
from sqlalchemy import String, Float, DateTime
from sqlalchemy.orm import Mapped, Session, mapped_column
from app.shared.database import Base
from app.matching.semantic import HybridComparison


class JobMatchingDomain(Base):
    __tablename__ = "job_matching_domains"
    job_version_id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True)
    domain: Mapped[str] = mapped_column(String(20), nullable=False)


def register_job_domain(session: Session, version_id: int, domain: str) -> None:
    if domain not in ("IT", "OUTSIDE_IT"):
        raise ValueError("Invalid matching domain")
    row = session.get(JobMatchingDomain, version_id)
    if row is not None:
        if row.domain != domain:
            raise ValueError("Immutable JD matching domain cannot change")
        return
    session.add(JobMatchingDomain(job_version_id=version_id, domain=domain))
    session.flush()


def supported_job(session: Session, version_id: int) -> bool:
    row = session.get(JobMatchingDomain, version_id)
    return row is None or row.domain == "IT"  # Legacy events predate the scope field.


class MatchingShadowResult(Base):
    __tablename__ = "matching_shadow_results"
    matching_result_id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True)
    application_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    cv_version_id: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False)
    algorithm_version: Mapped[str] = mapped_column(String(80), nullable=False)
    model_id: Mapped[str] = mapped_column(String(120), nullable=False)
    model_revision: Mapped[str] = mapped_column(String(40), nullable=False)
    baseline_score: Mapped[float] = mapped_column(Float, nullable=False)
    semantic_score: Mapped[float | None] = mapped_column(Float)
    hybrid_score: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    fallback_code: Mapped[str | None] = mapped_column(String(80))
    semantic_weight: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


def save_comparison(session: Session, result, comparison: HybridComparison) -> None:
    if session.get(MatchingShadowResult, result.id) is not None:
        return
    session.add(MatchingShadowResult(matching_result_id=result.id, application_id=result.application_id,
                cv_version_id=result.cv_version_id, algorithm_version=comparison.algorithm_version,
                model_id=comparison.model_id, model_revision=comparison.model_revision,
                baseline_score=comparison.baseline_score, semantic_score=comparison.semantic_score,
                hybrid_score=comparison.hybrid_score, status=comparison.status, fallback_code=comparison.fallback_code,
                semantic_weight=comparison.semantic_weight, created_at=datetime.now(UTC)))
    session.flush()
