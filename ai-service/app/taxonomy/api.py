from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.shared.api import ApiContractError
from app.shared.database import get_session
from app.shared.security import AuthenticatedPrincipal, require_access_token
from app.taxonomy.catalog import head

router = APIRouter(prefix="/api/v1/taxonomy", tags=["taxonomy"])


def require_admin(principal: AuthenticatedPrincipal = Depends(require_access_token)):
    if "SYSTEM_ADMIN" not in principal.roles:
        raise ApiContractError(403, "ADMIN_ROLE_REQUIRED", "Admin role is required")
    return principal


@router.get("/skills")
def list_skills(principal=Depends(require_admin), session: Session = Depends(get_session)):
    value = head(session)
    return {"version": value.version, "taxonomyVersion": f"1.0.{value.version}",
            "skills": value.skills}
