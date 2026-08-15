from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "STORE"
    environment: str = Field(default="development", alias="APP_ENV")
    mongo_uri: str = Field(default="mongodb://localhost:27017", alias="MONGO_URI")
    mongo_db_name: str = Field(default="store_erp", alias="MONGO_DB_NAME")
    jwt_secret: str = Field(default="change-me", alias="JWT_SECRET")
    jwt_refresh_secret: str = Field(default="change-me-too", alias="JWT_REFRESH_SECRET")
    access_token_expiry_minutes: int = 15
    refresh_token_expiry_days: int = 30
    admin_username: str = Field(default="admin", alias="ADMIN_USERNAME")
    admin_password: str = Field(default="admin123", alias="ADMIN_PASSWORD")
    hardcoded_admin_name: str = Field(default="Store Admin", alias="HARDCODED_ADMIN_NAME")
    hardcoded_business_id: str = Field(default="business-default", alias="HARDCODED_BUSINESS_ID")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    openrouter_model: str = Field(default="openai/gpt-4o-mini", alias="OPENROUTER_MODEL")
    openrouter_base_url: str = Field(default="https://openrouter.ai/api/v1", alias="OPENROUTER_BASE_URL")
    ai_temperature: float = Field(default=0.1, alias="AI_TEMPERATURE")
    ai_max_history_messages: int = Field(default=20, alias="AI_MAX_HISTORY_MESSAGES")
    ai_max_tool_rounds: int = Field(default=4, alias="AI_MAX_TOOL_ROUNDS")
    # Default origins cover Expo Web (8081), Expo Go dev tools (19000-19002, 19006),
    # and a typical local web frontend (3000). Override via APP_CORS_ORIGINS env var.
    cors_origins: str = Field(
        default=(
            "http://localhost:3000,http://localhost:8081,http://127.0.0.1:8081,"
            "http://localhost:19000,http://localhost:19001,http://localhost:19002,"
            "http://localhost:19006"
        ),
        alias="APP_CORS_ORIGINS",
    )

    def parsed_cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
