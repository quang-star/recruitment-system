from app.shared.api_ids import BusinessId
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.cv.repository import ParsedCvRevisionRepository
from app.jd.repository import ParsedJdRevisionRepository
from app.matching.algorithm import ALGORITHM_VERSION, compute_match
from app.shared.api import ApiContractError
from app.shared.database import get_session
from app.shared.security import AuthenticatedPrincipal, require_access_token
from app.taxonomy.normalizer import taxonomy_version

router = APIRouter(
    prefix="/api/v2/matching-requests",
    tags=["matching"],
    dependencies=[Depends(require_access_token)],
)


class MatchPreviewRequest(BaseModel):
    cvVersionId: BusinessId = Field(description="The CV version ID to test match against the Job")
    jobVersionId: BusinessId = Field(description="The target Job version ID")


class MatchPreviewSummary(BaseModel):
    matchLevel: str = Field(description="EXCELLENT | GOOD | POTENTIAL | NEEDS_DEVELOPMENT")
    headline: str
    advice: str
    supportedSkills: list[str]
    missingSkills: list[str]
    uncertainSkills: list[str] = Field(
        default_factory=list,
        description="Required skills stated in the CV without source evidence; not counted as matched",
    )
    totalRequiredSkills: int
    matchedRequiredSkills: int


class MatchPreviewResponse(BaseModel):
    status: str
    finalScore: float
    qualityFlags: list[str]
    explanation: dict[str, Any]
    algorithmVersion: str
    taxonomyVersion: str
    cvVersionId: BusinessId
    jobVersionId: BusinessId
    summary: MatchPreviewSummary


@router.post("/preview", response_model=MatchPreviewResponse)
def preview_match(
    request: MatchPreviewRequest,
    principal: AuthenticatedPrincipal = Depends(require_access_token),
    session: Session = Depends(get_session),
) -> MatchPreviewResponse:
    cv_repo = ParsedCvRevisionRepository(session)
    if cv_repo.find_owned(request.cvVersionId, principal.subject) is None:
        raise ApiContractError(404, "CV_NOT_FOUND", "Parsed CV was not found for this user")
    # Score the same confirmed revision the application worker will use, not an unconfirmed draft.
    cv_revision = cv_repo.find_confirmed(request.cvVersionId)
    if cv_revision is None or cv_revision.owner_user_id != principal.subject:
        raise ApiContractError(409, "CV_NOT_CONFIRMED", "Parsed CV must be confirmed before matching")

    jd_repo = ParsedJdRevisionRepository(session)
    jd_revision = jd_repo.find_confirmed(request.jobVersionId)
    if jd_revision is None:
        raise ApiContractError(404, "JD_NOT_FOUND", "Confirmed JD was not found for this position")

    as_of_month = datetime.now(UTC).strftime("%Y-%m")
    computed = compute_match(cv_revision.payload, jd_revision.payload, as_of_month=as_of_month)

    skills_by_type: dict[str, list[str]] = {"SUPPORTED": [], "MISSING": [], "UNCERTAIN": []}
    total_required = 0
    for claim in computed.claims:
        claim_type = claim.get("type")
        if claim_type not in skills_by_type:
            continue
        total_required += 1
        label = claim.get("label") or claim.get("skillId") or claim.get("subject") or ""
        if label and label not in skills_by_type[claim_type]:
            skills_by_type[claim_type].append(label)
    supported_skills = skills_by_type["SUPPORTED"]
    missing_skills = skills_by_type["MISSING"]
    matched_required = sum(claim.get("type") == "SUPPORTED" for claim in computed.claims)

    score = computed.final_score
    if score >= 80.0:
        match_level = "EXCELLENT"
        headline = "Hồ sơ của bạn rất phù hợp với vị trí này!"
        advice = "Bạn đáp ứng hầu hết kỹ năng trọng yếu. Hãy tự tin ứng tuyển ngay!"
    elif score >= 60.0:
        match_level = "GOOD"
        headline = "Hồ sơ của bạn phù hợp tốt với vị trí này."
        advice = "Bạn đáp ứng phần lớn yêu cầu. Trong thư ứng tuyển, hãy làm nổi bật thêm kinh nghiệm liên quan đến các kỹ năng còn thiếu để tăng điểm cộng."
    elif score >= 40.0:
        match_level = "POTENTIAL"
        headline = "Hồ sơ tiềm năng, có một số kỹ năng phù hợp."
        advice = "Bạn có nền tảng tốt nhưng còn thiếu một số kỹ năng cốt lõi. Hãy làm rõ các dự án thực tế hoặc khả năng học hỏi nhanh trong đơn ứng tuyển."
    else:
        match_level = "NEEDS_DEVELOPMENT"
        headline = "Chưa đáp ứng nhiều yêu cầu cốt lõi của vị trí."
        advice = "Vị trí này đòi hỏi một số công nghệ hoặc số năm kinh nghiệm mà hồ sơ của bạn chưa thể hiện rõ. Bạn có thể cập nhật thêm kinh nghiệm hoặc tìm vị trí phù hợp hơn."

    # A high score from weak signals must not read as a confident recommendation.
    if "NO_REQUIRED_SKILLS" in computed.quality_flags:
        headline = "Tin tuyển dụng chưa nêu kỹ năng bắt buộc, kết quả chỉ mang tính tham khảo."
    elif "CV_SKILLS_UNAVAILABLE" in computed.quality_flags:
        headline = "CV chưa có kỹ năng được xác minh, kết quả chỉ mang tính tham khảo."
    if skills_by_type["UNCERTAIN"]:
        advice += " Một số kỹ năng bạn tự khai chưa có minh chứng trong CV; hãy bổ sung dự án hoặc kinh nghiệm cụ thể để được tính điểm."

    summary = MatchPreviewSummary(
        matchLevel=match_level,
        headline=headline,
        advice=advice,
        supportedSkills=supported_skills,
        missingSkills=missing_skills,
        uncertainSkills=skills_by_type["UNCERTAIN"],
        totalRequiredSkills=total_required,
        matchedRequiredSkills=matched_required,
    )

    return MatchPreviewResponse(
        status=computed.status,
        finalScore=computed.final_score,
        qualityFlags=computed.quality_flags,
        explanation={
            "components": computed.components,
            "claims": computed.claims,
            "inputRevisions": {
                "cv": str(cv_revision.id),
                "jd": str(jd_revision.id),
                "asOfMonth": as_of_month,
            },
        },
        algorithmVersion=ALGORITHM_VERSION,
        taxonomyVersion=taxonomy_version(),
        cvVersionId=request.cvVersionId,
        jobVersionId=request.jobVersionId,
        summary=summary,
    )
