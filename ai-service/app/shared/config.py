from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AI_", case_sensitive=False)

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
