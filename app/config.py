"""
Application configuration loaded from environment variables and .env file.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root (two levels up from this file: app/config.py -> project root)
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
HOST: str = os.getenv("HOST", "127.0.0.1")
PORT: int = int(os.getenv("PORT", "8000"))

# Supabase configuration
SUPABASE_PROJECT_REF: str = os.getenv("SUPABASE_PROJECT_REF", "ecnbupsjpwesvokwszpe")
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "https://ecnbupsjpwesvokwszpe.supabase.co")
SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ACCESS_TOKEN: str = os.getenv("SUPABASE_ACCESS_TOKEN", "")
GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "246901689836-pv7f039tveaqjcpgpf8dg6kr3rals8ba.apps.googleusercontent.com")


def get_gemini_api_key() -> str:
    """Read the latest GEMINI_API_KEY directly from .env file or environment."""
    load_dotenv(dotenv_path=_env_path, override=True)
    return os.getenv("GEMINI_API_KEY", "").strip()
