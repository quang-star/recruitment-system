from app.shared.identities import parse_id
import asyncio
from collections.abc import Callable
from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import json
from uuid import UUID

from minio import Minio
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.cv.parser import parse_pdf
from app.cv.repository import ParsedCvRevisionRepository
from app.jd.parser import parse_jd
from app.jd.repository import ParsedJdRevisionRepository
from app.matching.algorithm import MatchResult, compute_match
from app.matching.repository import MatchingResultRepository
from app.matching.semantic import HybridComparison, compare_hybrid
from app.matching.shadow import save_comparison, supported_job
from app.outbox import enqueue
from app.reprocessing.impact import digest, impact_items, target_config
from app.reprocessing.models import EligibilityRequest, ImpactRequest, ReprocessingBatch
from app.reprocessing.repository import (Claim, batch_record, claim_one, fail_claim, finish_item,
                                         public_batch, valid_claim)
from app.reprocessing.source_state import ReprocessingFailure, SourceStateReader
from app.shared.api import ApiContractError
from app.shared.config import Settings
from app.shared.privacy import erased, lock_resource
from app.shared.processing_errors import ProcessingFailure, storage_failure
from app.shared.source_extraction import _contract
from app.task.persistence import ProcessingTaskRecord
from app.taxonomy.catalog import TaxonomyVersionRecord
from app.taxonomy.normalizer import build_taxonomy, use_taxonomy
from app.taxonomy.occurrences import record_cv_revision, record_jd_revision


@dataclass(frozen=True, slots=True)
class Prepared:
    parsed: dict | None = None
    match: MatchResult | None = None
    shadow: HybridComparison | None = None


class ReprocessingService:
    def __init__(self, factory: sessionmaker[Session], settings: Settings, reader: SourceStateReader,
                 read_object: Callable[[str], bytes] | None = None):
        self.factory, self.settings, self.reader = factory, settings, reader
        self.read_object = read_object or self._read_object

    def _read_object(self, object_ref: str) -> bytes:
        bucket, separator, key = object_ref.partition("/")
        if not separator or not bucket or not key:
            raise ReprocessingFailure("SOURCE_OBJECT_INVALID")
        storage = Minio(self.settings.storage_endpoint.removeprefix("http://").removeprefix("https://"),
                        access_key=self.settings.storage_access_key, secret_key=self.settings.storage_secret_key,
                        secure=self.settings.storage_secure)
        response = None
        try:
            response = storage.get_object(bucket, key)
            raw = response.read(10 * 1024 * 1024 + 1)
            if len(raw) > 10 * 1024 * 1024:
                raise ReprocessingFailure("SOURCE_OBJECT_TOO_LARGE")
            return raw
        except ReprocessingFailure:
            raise
        except Exception as error:
            failure = storage_failure(error)
            raise ReprocessingFailure(failure.code, retryable=failure.retryable) from None
        finally:
            if response is not None:
                response.close()
                response.release_conn()

    @staticmethod
    def _lock_scope(session: Session, claim: Claim) -> None:
        if claim.operation == "PARSE_CV":
            lock_resource(session, "CV", claim.resource_id)
            if erased(session, "CV", claim.resource_id):
                raise ReprocessingFailure("CV_DELETED")
        elif claim.operation == "PARSE_JD":
            lock_resource(session, "JD", claim.resource_id)
            if erased(session, "JD", claim.resource_id):
                raise ReprocessingFailure("SOURCE_NOT_AVAILABLE")
        else:
            cv, jd = parse_id(claim.snapshot["cvVersionId"]), parse_id(claim.snapshot["jobVersionId"])
            lock_resource(session, "CV", cv)
            lock_resource(session, "JD", jd)
            lock_resource(session, "APPLICATION", claim.resource_id)
            if erased(session, "CV", cv) or erased(session, "JD", jd) or erased(session, "APPLICATION", claim.resource_id):
                raise ReprocessingFailure("ACCESS_REVOKED")
            if not supported_job(session, jd):
                raise ReprocessingFailure("OUTSIDE_IT")

    def _verify_state(self, session: Session, claim: Claim) -> None:
        request = ImpactRequest(operation=claim.operation, resourceIds=[claim.resource_id],
                                taxonomyVersion=claim.target["taxonomyVersion"], asOfMonth=claim.target["asOfMonth"])
        actual_target = target_config(session, self.settings, request, historical=True)
        if digest(actual_target) != claim.target_hash:
            raise ReprocessingFailure("REPROCESS_RUNTIME_CHANGED")
        try:
            items = impact_items(session, request, claim.target)
        except ApiContractError:
            raise ReprocessingFailure("SOURCE_NOT_AVAILABLE") from None
        if len(items) != 1 or items[0].current_hash != claim.current_hash:
            raise ReprocessingFailure("SOURCE_CHANGED")
        if not items[0].ready:
            raise ReprocessingFailure(items[0].reasons[-1])

    @staticmethod
    def _eligibility(claim: Claim) -> EligibilityRequest:
        if claim.operation == "MATCH_APPLICATION":
            return EligibilityRequest(operation=claim.operation, resourceId=claim.resource_id,
                                      cvVersionId=parse_id(claim.snapshot["cvVersionId"]), jobVersionId=parse_id(claim.snapshot["jobVersionId"]))
        return EligibilityRequest(operation=claim.operation, resourceId=claim.resource_id,
                                  sourceOwnerId=parse_id(claim.snapshot["ownerId"]), sourceHash=claim.snapshot["sourceHash"])

    async def _admit(self, claim: Claim, bearer: str) -> None:
        result = await asyncio.to_thread(self.reader.check, self._eligibility(claim), bearer)
        if not result.eligible:
            raise ReprocessingFailure(result.reasonCode)

    def _inputs(self, claim: Claim) -> tuple[str | None, dict | None, dict | None, dict]:
        with self.factory() as session:
            self._lock_scope(session, claim)
            self._verify_state(session, claim)
            published = session.get(TaxonomyVersionRecord, claim.target["taxonomyVersion"])
            if published is None or published.payload is None:
                raise ReprocessingFailure("REPROCESS_TARGET_UNAVAILABLE")
            taxonomy_payload = deepcopy(published.payload)
            if claim.operation != "MATCH_APPLICATION":
                task = session.scalar(select(ProcessingTaskRecord).where(ProcessingTaskRecord.resource_id == claim.resource_id,
                                                                         ProcessingTaskRecord.task_type == claim.operation))
                if (task is None or task.task_type != claim.operation or task.owner_user_id != parse_id(claim.snapshot["ownerId"])
                        or task.source_hash != claim.snapshot["sourceHash"] or not task.object_ref):
                    raise ReprocessingFailure("SOURCE_NOT_AVAILABLE")
                return task.object_ref, None, None, taxonomy_payload
            cv = ParsedCvRevisionRepository(session).find_confirmed(parse_id(claim.snapshot["cvVersionId"]))
            jd = ParsedJdRevisionRepository(session).find_confirmed(parse_id(claim.snapshot["jobVersionId"]))
            if cv is None or jd is None:
                raise ReprocessingFailure("INPUT_NOT_CONFIRMED")
            return None, deepcopy(cv.payload), deepcopy(jd.payload), taxonomy_payload

    def _parse(self, claim: Claim, object_ref: str, taxonomy_payload: dict) -> dict:
        raw = self.read_object(object_ref)
        with use_taxonomy(build_taxonomy(taxonomy_payload)):
            if claim.operation == "PARSE_CV":
                if hashlib.sha256(raw).hexdigest() != claim.snapshot["sourceHash"]:
                    raise ReprocessingFailure("CV_SOURCE_HASH_MISMATCH")
                parsed = parse_pdf(str(claim.resource_id), claim.snapshot["sourceHash"], raw,
                                   ocr_enabled=claim.target["ocrEnabled"], ocr_max_pages=claim.target["ocrMaxPages"],
                                   ocr_timeout_seconds=claim.target["ocrTimeoutSeconds"], enricher=None)
                kind = "cv"
            else:
                source = json.loads(raw)
                if not isinstance(source, dict) or any(not isinstance(source.get(field), str)
                        for field in ("title", "description", "requirementsText", "sourceHash")):
                    raise ReprocessingFailure("JD_SOURCE_INVALID")
                if source["sourceHash"] != claim.snapshot["sourceHash"]:
                    raise ReprocessingFailure("JD_SOURCE_HASH_MISMATCH")
                parsed = parse_jd(str(claim.resource_id), claim.snapshot["sourceHash"], source["title"], source["description"],
                                  source["requirementsText"], enricher=None)
                kind = "jd"
            _contract(kind).validate(parsed)
            return parsed

    async def _prepare(self, claim: Claim, bearer: str) -> Prepared:
        object_ref, cv, jd, taxonomy_payload = self._inputs(claim)
        await self._admit(claim, bearer)
        if object_ref is not None:
            return Prepared(parsed=await asyncio.to_thread(self._parse, claim, object_ref, taxonomy_payload))
        if cv is None or jd is None:
            raise ReprocessingFailure("INPUT_NOT_CONFIRMED")
        result = compute_match(cv, jd, as_of_month=claim.target["asOfMonth"])
        shadow = None
        if claim.target["matchingMode"] == "shadow" and result.status != "INSUFFICIENT_DATA":
            shadow = await asyncio.to_thread(compare_hybrid, cv, jd, result.final_score,
                                            cache_directory=self.settings.semantic_cache_directory,
                                            max_chars=claim.target["semanticMaxInputChars"])
        return Prepared(match=result, shadow=shadow)

    def _materialize(self, session: Session, claim: Claim, prepared: Prepared, correlation: UUID) -> int:
        if claim.operation != "MATCH_APPLICATION":
            if prepared.parsed is None:
                raise ReprocessingFailure("REPROCESS_OUTPUT_INVALID")
            owner, previous = parse_id(claim.snapshot["ownerId"]), parse_id(claim.snapshot["revisionId"])
            if claim.operation == "PARSE_CV":
                cv_revision = ParsedCvRevisionRepository(session).create_reprocess_revision(
                    claim.resource_id, owner, claim.snapshot["sourceHash"], prepared.parsed, previous, claim.effect_key)
                record_cv_revision(session, cv_revision, correlation_id=correlation)
                return cv_revision.id
            jd_revision = ParsedJdRevisionRepository(session).create_reprocess_revision(
                parse_id(claim.snapshot["jobId"]), claim.resource_id, owner, claim.snapshot["sourceHash"], prepared.parsed,
                previous, claim.effect_key)
            record_jd_revision(session, jd_revision, correlation_id=correlation)
            return jd_revision.id
        if prepared.match is None:
            raise ReprocessingFailure("REPROCESS_OUTPUT_INVALID")
        computed = prepared.match
        cv, jd = parse_id(claim.snapshot["cvVersionId"]), parse_id(claim.snapshot["jobVersionId"])
        result = MatchingResultRepository(session).save(claim.resource_id, cv, jd, computed.status, computed.final_score,
            computed.quality_flags, computed.components, computed.claims,
            cv_revision_id=parse_id(claim.snapshot["cvRevisionId"]), jd_revision_id=parse_id(claim.snapshot["jdRevisionId"]),
            as_of_month=claim.target["asOfMonth"], input_taxonomy_version=claim.snapshot["jdTaxonomyVersion"],
            input_taxonomy_versions={"cv": claim.snapshot["cvTaxonomyVersion"], "jd": claim.snapshot["jdTaxonomyVersion"]},
            reprocess_effect_key=claim.effect_key, expected_result_id=parse_id(claim.snapshot["priorResultId"]))
        if prepared.shadow is not None:
            save_comparison(session, result, prepared.shadow)
        from app.worker import _matching_event
        envelope = {"correlationId": str(correlation)}
        enqueue(session, self.settings.kafka_matching_completed_topic, str(claim.resource_id),
                _matching_event(envelope, result, claim.resource_id, cv, jd))
        return result.id

    def _skip(self, claim: Claim, code: str) -> None:
        with self.factory() as session, session.begin():
            live = valid_claim(session, claim)
            if live is not None:
                batch, item = live
                finish_item(session, batch, item, "SKIPPED", code, datetime.now(UTC))

    async def execute(self, claim: Claim, bearer: str, correlation: UUID) -> None:
        try:
            prepared = await self._prepare(claim, bearer)
            await self._admit(claim, bearer)
            with self.factory() as session, session.begin():
                self._lock_scope(session, claim)
                live = valid_claim(session, claim)
                if live is None:
                    return
                self._verify_state(session, claim)
                output = self._materialize(session, claim, prepared, correlation)
                finish_item(session, *live, "COMPLETED", None, datetime.now(UTC), output)
        except ReprocessingFailure as error:
            if error.code in {"CV_DELETED", "ACCESS_REVOKED", "SOURCE_NOT_AVAILABLE", "SOURCE_CHANGED", "OUTSIDE_IT",
                              "INPUT_NOT_CONFIRMED", "INPUT_REVIEW_REQUIRED", "REPROCESS_RUNTIME_CHANGED", "REPROCESS_TARGET_UNAVAILABLE"}:
                self._skip(claim, error.code)
            else:
                with self.factory() as session, session.begin():
                    fail_claim(session, claim, error.code, retryable=error.retryable)
        except ProcessingFailure as error:
            with self.factory() as session, session.begin():
                fail_claim(session, claim, error.code, retryable=error.retryable)
        except SQLAlchemyError:
            with self.factory() as session, session.begin():
                fail_claim(session, claim, "REPROCESS_DATABASE_UNAVAILABLE", retryable=True)
        except Exception:
            # No exception body is copied into an attempt, response, or log.
            with self.factory() as session, session.begin():
                fail_claim(session, claim, "REPROCESS_ITEM_FAILED", retryable=False)

    async def step(self, batch_id: int, actor: int, correlation: UUID, bearer: str) -> dict:
        lease = max(120, self.settings.ocr_max_pages * self.settings.ocr_timeout_seconds + 120)
        with self.factory() as session, session.begin():
            claim = claim_one(session, batch_id, actor=actor, correlation=correlation, lease_seconds=lease)
        if claim is not None:
            await self.execute(claim, bearer, correlation)
        with self.factory() as session:
            batch: ReprocessingBatch = batch_record(session, batch_id)
            return {"claimed": claim is not None, "itemId": str(claim.item_id) if claim else None,
                    "batch": public_batch(session, batch)}
