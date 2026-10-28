from app.shared.api_ids import BusinessId
from fastapi import APIRouter, Depends

from app.career.catalog_reader import HttpCoreCatalogReader
from app.career.models import CareerRequest, CareerResponse
from app.career.providers import career_provider
from app.career.service import CareerSuggestionService
from app.shared.api import ApiContractError
from app.shared.config import Settings, get_settings
from app.shared.database import _session_factory
from app.shared.extraction_usage import ExtractionUsageRepository
from app.shared.security import AuthenticatedPrincipal, require_access_token

router = APIRouter(prefix="/api/v2/parsed-jds", tags=["career-suggestions"])


def get_career_service(settings: Settings = Depends(get_settings)) -> CareerSuggestionService:
    try:
        budget = ExtractionUsageRepository(_session_factory(settings.db_url), daily_limit=settings.extraction_daily_call_limit,
                                           user_daily_limit=settings.extraction_user_daily_call_limit)
    except Exception:
        budget = None
    return CareerSuggestionService(
        HttpCoreCatalogReader(settings.career_core_catalog_url, settings.career_catalog_timeout_seconds),
        career_provider(settings),
        budget,
    )


def require_recruiter(principal: AuthenticatedPrincipal = Depends(require_access_token)) -> int:
    if "RECRUITER" not in principal.roles:
        raise ApiContractError(403, "RECRUITER_ROLE_REQUIRED", "Recruiter role is required")
    return principal.subject


@router.post("/category-suggestions", response_model=CareerResponse)
def suggest_categories(request: CareerRequest, actor: BusinessId = Depends(require_recruiter),
                       service: CareerSuggestionService = Depends(get_career_service)) -> CareerResponse:
    return service.suggest(actor, request)
