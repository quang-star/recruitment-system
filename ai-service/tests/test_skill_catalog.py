from uuid import uuid4
import pytest
from app.shared.api import ApiContractError
from app.shared.security import AuthenticatedPrincipal
from app.taxonomy.api import require_admin


def test_catalog_requires_verified_admin_role():
    with pytest.raises(ApiContractError) as error:
        require_admin(AuthenticatedPrincipal(uuid4(), ("RECRUITER",)))
    assert error.value.status_code == 403
    with pytest.raises(ApiContractError):
        require_admin(AuthenticatedPrincipal(uuid4(), ("ADMIN",)))
    assert require_admin(AuthenticatedPrincipal(uuid4(), ("SYSTEM_ADMIN",)))
