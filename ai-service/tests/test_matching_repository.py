from identity_fixtures import new_id

from itertools import count

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app.matching.repository import MatchingHeadRecord, MatchingResultRecord, MatchingResultRepository
from app.shared.database import Base


def _sqlite_session(engine) -> Session:
    session = Session(engine, expire_on_commit=False)
    ids = count(1)

    @event.listens_for(session, "before_flush")
    def assign_bigint_identity(_session, _context, _instances) -> None:
        for record in _session.new:
            if isinstance(record, MatchingResultRecord) and record.id is None:
                record.id = next(ids)

    return session


def test_input_unavailable_result_is_replaced_when_inputs_become_ready() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    application_id, cv_version_id, job_version_id = new_id(), new_id(), new_id()

    with _sqlite_session(engine) as session:
        repository = MatchingResultRepository(session)
        unavailable = repository.save(
            application_id, cv_version_id, job_version_id,
            "INSUFFICIENT_DATA", 0.0, ["INPUT_REVISION_UNAVAILABLE"], [], [],
        )
        session.commit()

        replay = repository.save(application_id, cv_version_id, job_version_id,
                                 "INSUFFICIENT_DATA", 0.0, ["INPUT_REVISION_UNAVAILABLE"], [], [])
        assert replay.id == unavailable.id

        completed = repository.save(
            application_id, cv_version_id, job_version_id,
            "COMPLETED", 82.5, [], [{"name": "REQUIRED_SKILLS"}], [],
        )
        session.commit()

        assert completed.id != unavailable.id
        assert repository.find_latest(application_id).id == completed.id
        assert repository.find_input_unavailable(cv_version_id=cv_version_id) == []
        assert session.get(MatchingHeadRecord, application_id).result_id is not None


def test_non_retryable_insufficient_result_remains_idempotent() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    application_id, cv_version_id, job_version_id = new_id(), new_id(), new_id()

    with _sqlite_session(engine) as session:
        repository = MatchingResultRepository(session)
        first = repository.save(
            application_id, cv_version_id, job_version_id,
            "INSUFFICIENT_DATA", 0.0, ["NO_APPLICABLE_COMPONENTS"], [], [],
        )
        session.commit()
        replay = repository.save(
            application_id, cv_version_id, job_version_id,
            "INSUFFICIENT_DATA", 0.0, ["NO_APPLICABLE_COMPONENTS"], [], [],
        )

        assert replay.id == first.id


def test_matching_persists_exact_input_revisions_and_keeps_previous_results():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    application, cv, jd, cv_revision, jd_revision = [new_id() for _ in range(5)]
    with _sqlite_session(engine) as session:
        repo = MatchingResultRepository(session)
        first = repo.save(application, cv, jd, "COMPLETED", 70, [], [], [],
                          cv_revision_id=cv_revision, jd_revision_id=jd_revision, as_of_month="2026-09")
        session.commit()
        assert first.cv_revision_id == cv_revision
        assert first.jd_revision_id == jd_revision
        assert first.as_of_month == "2026-09"
        replay = repo.save(application, cv, jd, "COMPLETED", 90, [], [], [],
                           cv_revision_id=cv_revision, jd_revision_id=jd_revision, as_of_month="2026-10")
        assert replay.id == first.id
        assert replay.as_of_month == "2026-09"
        changed = repo.save(application, cv, jd, "COMPLETED", 90, [], [], [],
                            cv_revision_id=new_id(), jd_revision_id=jd_revision, as_of_month="2026-10")
        assert changed.id != first.id
        assert repo.find_latest(application).id == changed.id
