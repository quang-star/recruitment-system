from identity_fixtures import new_id
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.shared.api import ApiContractError
from app.taxonomy.audit import catalog_projection, history_entry, search_history
from app.taxonomy.catalog import SkillCatalogHistory


@pytest.fixture
def session():
    engine = create_engine("sqlite://")
    SkillCatalogHistory.__table__.create(engine)
    with Session(engine) as value:
        yield value
    engine.dispose()


def row(identity=1, **changes):
    values = dict(id=int(identity), skill_id=int(100), actor_id=int(200), action="CREATE",
                  catalog_version=1, before_state=None, after_state={"canonicalName": "Java", "stableId": str(int(100))},
                  created_at=datetime(2026, 10, 2, 12, tzinfo=UTC), reason="Synthetic review", correlation_id=UUID(int=300))
    values.update(changes)
    return SkillCatalogHistory(**values)


def test_filters_are_combined_inclusively_with_bounded_stable_pages(session):
    moment = datetime(2026, 10, 2, 12, tzinfo=UTC)
    session.add_all([row(), row(2), row(3, actor_id=new_id()), row(4, skill_id=new_id()),
                     row(5, action="REJECT"), row(6, correlation_id=None), row(7, created_at=moment - timedelta(seconds=1))])
    session.flush()
    filters = dict(actor_id=int(200), resource_id=int(100), action="CREATE", correlation_id=UUID(int=300),
                   from_time=moment, to_time=moment, size=1)
    first, second, outside = (search_history(session, page=page, **filters) for page in range(3))
    assert first["total"] == second["total"] == outside["total"] == 2
    assert [first["items"][0]["id"], second["items"][0]["id"]] == [int(2), int(1)]
    assert outside["items"] == [] and outside["page"] == 2 and outside["size"] == 1


def test_offset_ranges_are_compared_as_instants_and_empty_filters_keep_legacy_nulls(session):
    legacy = row(reason=None, correlation_id=None)
    session.add(legacy)
    session.flush()
    bound = datetime.fromisoformat("2026-10-02T19:00:00+07:00")
    result = search_history(session, from_time=bound, to_time=bound)
    assert result["total"] == 1
    item = result["items"][0]
    assert item["reason"] is None and item["correlationId"] is None and not item["redacted"]
    assert item["before"] is None and item["resourceId"] == legacy.skill_id and item["createdAt"].tzinfo is not None


@pytest.mark.parametrize("filters", [dict(page=-1), dict(page=100001), dict(size=0), dict(size=101),
                                      dict(action="DELETE"), dict(from_time=datetime(2026, 10, 2)),
                                      dict(from_time=datetime(2026, 10, 3, tzinfo=UTC), to_time=datetime(2026, 10, 2, tzinfo=UTC))])
def test_invalid_filters_fail_clearly(session, filters):
    with pytest.raises(ApiContractError) as error:
        search_history(session, **filters)
    assert error.value.status_code == 422 and error.value.code == "SKILL_AUDIT_FILTER_INVALID"


def test_masked_legacy_audit_projection_preserves_ids_relations_and_original_history(session):
    original = row(reason="Legacy contact candidate@synthetic.invalid", after_state={
        "canonicalName": "candidate@synthetic.invalid", "stableId": str(int(100)),
        "target": {"canonicalName": "Java", "aliases": [{"value": "https://synthetic.invalid/private", "normalized": "safe"}]},
        "relationChanges": [{"before": {"canonicalName": "Phone: 0901234567"}, "after": {"canonicalName": "Safe skill"}}],
        "relations": [{"targetSkillId": str(int(400)), "type": "RELATED"}]})
    session.add(original)
    session.flush()
    result = history_entry(original)
    assert result["redacted"] and "candidate@" not in str(result) and "https://" not in str(result) and "0901234567" not in str(result)
    assert result["after"]["stableId"] == str(int(100))
    assert result["after"]["relations"] == original.after_state["relations"]
    assert original.after_state["canonicalName"] == "candidate@synthetic.invalid"
    assert original.reason == "Legacy contact candidate@synthetic.invalid"


def test_catalog_refresh_masks_legacy_contacts_without_rewriting_definition():
    definition = {"stableId": str(int(100)), "canonicalName": "Legacy contact candidate@synthetic.invalid",
                  "normalizedName": "legacy", "type": "other", "category": "cross_functional", "status": "PENDING",
                  "aliases": [{"value": "https://synthetic.invalid/private", "normalized": "legacy"}], "relations": []}
    projected = catalog_projection(definition)
    assert projected["redacted"] and "candidate@" not in str(projected) and "https://" not in str(projected)
    assert projected["stableId"] == definition["stableId"]
    assert definition["canonicalName"].endswith("candidate@synthetic.invalid")


def test_full_width_contact_cannot_bypass_catalog_or_audit_read_mask():
    private = "ｃａｎｄｉｄａｔｅ＠ｓｙｎｔｈｅｔｉｃ．ｉｎｖａｌｉｄ"
    definition = {"stableId": str(int(100)), "canonicalName": private, "normalizedName": "legacy",
                  "type": "other", "category": "cross_functional", "status": "PENDING", "aliases": [], "relations": []}
    assert catalog_projection(definition)["canonicalName"] == "█" * len(private)
    original = row(after_state=definition, reason=private)
    projected = history_entry(original)
    assert projected["redacted"] and projected["reason"] == "█" * len(private)
    assert original.reason == private and original.after_state["canonicalName"] == private
    mixed = row(reason=f"normal@synthetic.invalid and {private}")
    assert history_entry(mixed)["reason"] == "█" * len(mixed.reason)
