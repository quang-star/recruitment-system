from app.shared.database import BUSINESS_ID
from datetime import UTC, datetime

from sqlalchemy import DateTime, Integer, JSON, String, UniqueConstraint, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.shared.database import Base
from app.task.application import ProcessingTaskRepository
from app.task.domain import ProcessingTask, TaskState, TaskType


class ProcessingTaskRecord(Base):
    __tablename__ = "processing_tasks"
    __table_args__ = (UniqueConstraint("task_type", "resource_id", name="uk_processing_task_resource"),)

    id: Mapped[int] = mapped_column(BUSINESS_ID, primary_key=True, autoincrement=True)
    task_type: Mapped[str] = mapped_column(String(40), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processing_generation: Mapped[int] = mapped_column(BUSINESS_ID, nullable=False, default=0, server_default="0")
    safe_error_code: Mapped[str | None] = mapped_column(String(80))
    resource_id: Mapped[int | None] = mapped_column(BUSINESS_ID)
    object_ref: Mapped[str | None] = mapped_column(String(1024))
    source_hash: Mapped[str | None] = mapped_column(String(64))
    result_payload: Mapped[dict | None] = mapped_column(JSON)
    owner_user_id: Mapped[int | None] = mapped_column(BUSINESS_ID)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SqlAlchemyProcessingTaskRepository(ProcessingTaskRepository):
    def __init__(self, session: Session):
        self._session = session

    def find_by_id(self, task_id: int) -> ProcessingTask | None:
        record = self._session.scalar(
            select(ProcessingTaskRecord).where(ProcessingTaskRecord.id == task_id)
        )
        if record is None:
            return None
        return _to_domain(record)

    def find_by_resource_id(self, resource_id: int, task_type: TaskType = TaskType.PARSE_CV) -> ProcessingTask | None:
        record = self._session.scalar(
            select(ProcessingTaskRecord).where(ProcessingTaskRecord.resource_id == resource_id,
                                               ProcessingTaskRecord.task_type == task_type.value)
        )
        return _to_domain(record) if record else None

    def start_cv(self, resource_id: int, owner_user_id: int,
                 object_ref: str, source_hash: str, processing_generation: int = 0) -> ProcessingTask:
        return self._start(resource_id, owner_user_id, object_ref, source_hash,
                           TaskType.PARSE_CV, processing_generation)

    def start_jd(self, resource_id: int, owner_user_id: int,
                 object_ref: str, source_hash: str) -> ProcessingTask:
        return self._start(resource_id, owner_user_id, object_ref, source_hash,
                           TaskType.PARSE_JD)

    def _start(self, resource_id: int, owner_user_id: int,
               object_ref: str, source_hash: str, task_type: TaskType,
               processing_generation: int = 0) -> ProcessingTask:
        if processing_generation < 0:
            raise ValueError("processing_generation must not be negative")
        existing = self._session.scalar(
            select(ProcessingTaskRecord).where(ProcessingTaskRecord.resource_id == resource_id,
                                               ProcessingTaskRecord.task_type == task_type.value)
        )
        now = _stored_time(self._session, datetime.now(UTC))
        if existing is None:
            existing = ProcessingTaskRecord(

                task_type=task_type.value,
                state=TaskState.PROCESSING.value,
                attempt_count=1,
                processing_generation=processing_generation,
                resource_id=resource_id,
                owner_user_id=owner_user_id,
                object_ref=object_ref,
                source_hash=source_hash,
                submitted_at=now,
                updated_at=now,
            )
            self._session.add(existing)
        else:
            if existing.owner_user_id != owner_user_id or existing.source_hash != source_hash \
                    or existing.object_ref != object_ref or existing.task_type != task_type.value:
                raise ValueError("Processing source identity mismatch")
            if processing_generation < existing.processing_generation:
                return _to_domain(existing)
            existing.processing_generation = processing_generation
            if existing.state != TaskState.COMPLETED.value:
                existing.state = TaskState.PROCESSING.value
                existing.attempt_count += 1
                existing.safe_error_code = None
                existing.updated_at = _stored_time(self._session, _update_time(existing))
        self._session.flush()
        return _to_domain(existing)

    def complete(self, task_id: int, result_payload: dict[str, object]) -> ProcessingTask:
        record = self._record(task_id)
        record.state = TaskState.COMPLETED.value
        record.safe_error_code = None
        record.result_payload = result_payload
        record.updated_at = _stored_time(self._session, _update_time(record))
        self._session.flush()
        return _to_domain(record)

    def fail(self, task_id: int, safe_error_code: str) -> ProcessingTask:
        record = self._record(task_id)
        record.state = TaskState.FAILED.value
        record.safe_error_code = safe_error_code
        record.updated_at = _stored_time(self._session, _update_time(record))
        self._session.flush()
        return _to_domain(record)

    def retry(self, task_id: int) -> ProcessingTask:
        record = self._record(task_id)
        record.state = TaskState.RETRYING.value
        record.safe_error_code = None
        record.updated_at = _stored_time(self._session, _update_time(record))
        self._session.flush()
        return _to_domain(record)

    def _record(self, task_id: int) -> ProcessingTaskRecord:
        record = self._session.scalar(
            select(ProcessingTaskRecord).where(ProcessingTaskRecord.id == task_id)
        )
        if record is None:
            raise LookupError("processing task was not found")
        return record


def _update_time(record: ProcessingTaskRecord) -> datetime:
    # Wall-clock corrections must not violate the persisted timestamp invariant.
    return max(datetime.now(UTC), _utc_time(record.submitted_at), _utc_time(record.updated_at))


def _utc_time(value: datetime) -> datetime:
    # Legacy SQLite rows store local wall time without an offset. astimezone
    # interprets those naive values locally; PostgreSQL TIMESTAMPTZ stays aware.
    return value.astimezone(UTC)


def _stored_time(session: Session, value: datetime) -> datetime:
    if session.get_bind().dialect.name == "sqlite":
        # Keep the legacy SQLite convention so old and new rows remain readable.
        return value.astimezone().replace(tzinfo=None)
    return value.astimezone(UTC)


def _to_domain(record: ProcessingTaskRecord) -> ProcessingTask:
    return ProcessingTask(
        id=record.id,
        task_type=TaskType(record.task_type),
        state=TaskState(record.state),
        attempt_count=record.attempt_count,
        submitted_at=_utc_time(record.submitted_at),
        updated_at=_utc_time(record.updated_at),
        safe_error_code=record.safe_error_code,
        resource_id=record.resource_id,
        result_payload=record.result_payload,
        owner_user_id=record.owner_user_id,
        processing_generation=record.processing_generation,
    )
