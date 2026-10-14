from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AI_", case_sensitive=False,
        env_file=(Path(__file__).resolve().parents[3] / ".local" / "secrets" / "gemini.env",
                  Path(__file__).resolve().parents[3] / ".local" / "secrets" / "groq.env"),
        env_file_encoding="utf-8",
    )

    db_url: str = Field(description="Required SQLAlchemy URL for the service-owned ai_db.")
    auth_jwks_uri: str = Field(description="Internal Auth Service JWKS endpoint.")
    auth_jwt_issuer: str = Field(description="Accepted access-token issuer.")
    auth_jwt_audience: str = Field(description="Accepted access-token audience.")
    auth_jwks_cache_seconds: int = Field(default=300, ge=30, le=3600)
    kafka_bootstrap_servers: str = Field(default="localhost:9092")
    kafka_consumer_group: str = Field(default="ai-cv-worker-v1")
    kafka_cv_uploaded_topic: str = Field(default="cv.uploaded.v1")
    kafka_cv_processing_updated_topic: str = Field(default="cv.processing.updated.v1")
    kafka_cv_confirmed_topic: str = Field(default="cv.confirmed.v1")
    kafka_job_processing_updated_topic: str = Field(default="job.processing.updated.v1")
    kafka_job_confirmed_topic: str = Field(default="job.confirmed.v1")
    kafka_job_submitted_topic: str = Field(default="job.version.submitted.v1")
    kafka_application_submitted_topic: str = Field(default="application.submitted.v1")
    kafka_matching_completed_topic: str = Field(default="matching.completed.v1")
    kafka_dead_letter_topic: str = Field(default="ai.processing.dlq.v1")
    kafka_max_processing_attempts: int = Field(default=3, ge=1, le=10)
    kafka_retry_backoff_seconds: float = Field(default=1.0, ge=0, le=30)
    storage_endpoint: str = Field(default="http://localhost:9000")
    storage_bucket: str = Field(default="smart-recruitment-cv")
    storage_access_key: str = Field(default="")
    storage_secret_key: str = Field(default="")
    storage_secure: bool = False
    ocr_enabled: bool = True
    ocr_max_pages: int = Field(default=5, ge=1, le=20)
    ocr_timeout_seconds: float = Field(default=60.0, ge=5, le=300)
    gemini_enabled: bool = False
    gemini_api_key: SecretStr = Field(default=SecretStr(""), repr=False)
    gemini_backup_api_key: SecretStr = Field(default=SecretStr(""), repr=False)
    gemini_model: str = Field(default="gemini-3.8-flash", pattern=r"^gemini-[a-z0-9.-]+$", max_length=60)
    gemini_timeout_seconds: float = Field(default=25.0, ge=1, le=60)
    gemini_max_input_chars: int = Field(default=30000, ge=100, le=60000)
    extraction_provider: Literal["rules", "gemini", "groq"] = "groq"
    cv_extraction_provider: Literal["rules", "gemini", "groq"] | None = None
    jd_extraction_provider: Literal["rules", "gemini", "groq"] | None = None
    groq_enabled: bool = False
    groq_api_key: SecretStr = Field(default=SecretStr(""), repr=False)
    groq_model: str = Field(default="qwen/qwen3.8-27b", pattern=r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$")
    groq_reasoning_effort: Literal["auto", "none", "low", "medium", "high"] = "auto"
    groq_timeout_seconds: float = Field(default=25.0, ge=1, le=60)
    groq_max_input_chars: int = Field(default=30000, ge=100, le=60000)
    groq_max_output_tokens: int = Field(default=4096, ge=256, le=8192)
    extraction_daily_call_limit: int = Field(default=100, ge=0, le=100000)
    extraction_user_daily_call_limit: int = Field(default=10, ge=0, le=10000)


@lru_cache
def get_settings() -> Settings:
    return Settings()
