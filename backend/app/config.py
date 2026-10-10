"""Application configuration from environment variables."""
from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Core
    app_name: str = "Inspectra AI"
    debug: bool = False

    # Database
    database_url: str = Field(
        default="postgresql+psycopg2://inspectra:inspectra@localhost:5432/inspectra"
    )

    # Redis (optional)
    redis_url: str | None = None

    # Security
    secret_key: str = Field(
        default="development-secret-key-change-in-production"
    )
    access_token_expire_minutes: int = 60 * 24  # 24h
    algorithm: str = "HS256"

    # S3 / storage (optional)
    aws_region: str = "us-east-1"
    s3_bucket: str | None = None
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None

    # Upload limits
    max_upload_mb: int = 100

    # Comma-separated browser origins allowed to call the API with credentials.
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
