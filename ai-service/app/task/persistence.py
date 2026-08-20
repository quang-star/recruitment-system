from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, Integer, JSON, String, Uuid, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.shared.database import Base
from app.task.application import ProcessingTaskRepository
from app.task.domain import ProcessingTask, TaskState, TaskType


class ProcessingTaskRecord(Base):
    __tablename__ = "processing_tasks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    public_id: Mapped[UUID] = mapped_column(Uuid, unique=True, nullable=False)
    task_type: Mapped[str] = mapped_column(String(40), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    safe_error_code: Mapped[str | None] = mapped_column(String(80))
    resource_id: Mapped[UUID | None] = mapped_column(Uuid, unique=True)
    object_ref: Mapped[str | None] = mapped_column(String(1024))
    source_hash: Mapped[str | None] = mapped_column(String(64))
    result_payload: Mapped[dict | None] = mapped_column(JSON)
    owner_user_id: Mapped[UUID | None] = mapped_column(Uuid)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SqlAlchemyProcessingTaskRepository(ProcessingTaskRepository):
    def __init__(self, session: Session):
        self._session = session

    def find_by_public_id(self, task_id: UUID) -> ProcessingTask | None:
        record = self._session.scalar(
            select(ProcessingTaskRecord).where(ProcessingTaskRecord.public_id == task_id)
        )
        if record is None:
            return None
        return ProcessingTask(
            public_id=record.public_id,
            task_type=TaskType(record.task_type),
            state=TaskState(record.state),
            attempt_count=record.attempt_count,
            submitted_at=record.submitted_at,
            updated_at=record.updated_at,
            safe_error_code=record.safe_error_code,
            resource_id=record.resource_id,
            result_payload=record.result_payload,
            owner_user_id=record.owner_user_id,
        )

    def find_by_resource_id(self, resource_id: UUID) -> ProcessingTask | None:
        record = self._session.scalar(
            select(ProcessingTaskRecord).where(ProcessingTaskRecord.resource_id == resource_id)
        )
        return _to_domain(record) if record else None

    def start_cv(self, resource_id: UUID, owner_user_id: UUID,
                 object_ref: str, source_hash: str) -> ProcessingTask:
        existing = self._session.scalar(
            select(ProcessingTaskRecord).where(ProcessingTaskRecord.resource_id == resource_id)
        )
        now = datetime.now().astimezone()
        if existing is None:
            existing = ProcessingTaskRecord(
                public_id=UUID(int=resource_id.int ^ UUID(int=1).int),
                task_type=TaskType.PARSE_CV.value,
                state=TaskState.PROCESSING.value,
                attempt_count=1,
                resource_id=resource_id,
                owner_user_id=owner_user_id,
                object_ref=object_ref,
                source_hash=source_hash,
                submitted_at=now,
                updated_at=now,
            )
            self._session.add(existing)
        elif existing.state != TaskState.COMPLETED.value:
            existing.state = TaskState.PROCESSING.value
            existing.attempt_count += 1
            existing.safe_error_code = None
            existing.updated_at = now
        self._session.flush()
        return _to_domain(existing)

    def complete(self, task_id: UUID, result_payload: dict[str, object]) -> ProcessingTask:
        record = self._record(task_id)
        record.state = TaskState.COMPLETED.value
        record.safe_error_code = None
        record.result_payload = result_payload
        record.updated_at = datetime.now().astimezone()
        self._session.flush()
        return _to_domain(record)

    def fail(self, task_id: UUID, safe_error_code: str) -> ProcessingTask:
        record = self._record(task_id)
        record.state = TaskState.FAILED.value
        record.safe_error_code = safe_error_code
        record.updated_at = datetime.now().astimezone()
        self._session.flush()
        return _to_domain(record)

    def _record(self, task_id: UUID) -> ProcessingTaskRecord:
        record = self._session.scalar(
            select(ProcessingTaskRecord).where(ProcessingTaskRecord.public_id == task_id)
        )
        if record is None:
            raise LookupError("processing task was not found")
        return record


def _to_domain(record: ProcessingTaskRecord) -> ProcessingTask:
    return ProcessingTask(
        public_id=record.public_id,
        task_type=TaskType(record.task_type),
        state=TaskState(record.state),
        attempt_count=record.attempt_count,
        submitted_at=record.submitted_at,
        updated_at=record.updated_at,
        safe_error_code=record.safe_error_code,
        resource_id=record.resource_id,
        result_payload=record.result_payload,
        owner_user_id=record.owner_user_id,
    )
