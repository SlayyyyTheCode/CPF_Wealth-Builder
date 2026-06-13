from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    DATABASE_URL: str = "postgresql+psycopg://cpf:cpf@localhost:5432/cpf"
    CORS_ORIGINS: str = "http://localhost:3000"
    # Optional regex to allow a family of origins (e.g. all this project's Vercel
    # preview/prod URLs) without listing each one.
    CORS_ORIGIN_REGEX: str = r"https://.*\.vercel\.app"
    ANTHROPIC_API_KEY: str = ""

    # --- Admin auth ---
    ADMIN_USERNAME: str = "useradmin"
    # Production: set ADMIN_PASSWORD_HASH (bcrypt). Dev fallback: ADMIN_PASSWORD
    # (plaintext). If neither is set, admin login is disabled.
    ADMIN_PASSWORD_HASH: str = ""
    ADMIN_PASSWORD: str = "P@ssw0rd2022"
    JWT_SECRET: str = "dev-insecure-change-me-0000000000000000"
    JWT_EXPIRE_MINUTES: int = 720

    @field_validator("DATABASE_URL")
    @classmethod
    def _use_psycopg3_driver(cls, v: str) -> str:
        # Managed hosts (Render, Heroku, etc.) hand out plain `postgres://` or
        # `postgresql://` URLs. Pin the psycopg (v3) driver so SQLAlchemy doesn't
        # default to psycopg2. SQLite and already-qualified URLs pass through.
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            v = "postgresql+psycopg://" + v[len("postgresql://"):]
        return v

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
