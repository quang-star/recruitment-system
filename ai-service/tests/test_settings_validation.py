import pytest
from pydantic import ValidationError

from app.shared.config import Settings


class ConstructorOnlySettings(Settings):
    @classmethod
    def settings_customise_sources(
        cls, settings_cls, init_settings, env_settings, dotenv_settings, file_secret_settings,
    ):
        return (init_settings,)


def test_environment_loaded_fields_remain_required_at_runtime():
    with pytest.raises(ValidationError) as error:
        ConstructorOnlySettings(_env_file=None)

    assert {(item["loc"], item["type"]) for item in error.value.errors()} == {
        (("db_url",), "missing"),
        (("auth_jwks_uri",), "missing"),
        (("auth_jwt_issuer",), "missing"),
        (("auth_jwt_audience",), "missing"),
    }


def test_complete_constructor_inputs_keep_provider_defaults():
    settings = ConstructorOnlySettings(
        _env_file=None,
        db_url="sqlite://",
        auth_jwks_uri="https://issuer.synthetic.invalid/jwks",
        auth_jwt_issuer="synthetic-qa",
        auth_jwt_audience="synthetic-qa",
    )

    assert settings.extraction_provider == "groq"
    assert settings.groq_enabled is False
    assert settings.gemini_enabled is False
