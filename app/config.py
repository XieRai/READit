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


def get_gemini_api_key() -> str:
    """Read the latest GEMINI_API_KEY directly from .env file or environment."""
    load_dotenv(dotenv_path=_env_path, override=True)
    return os.getenv("GEMINI_API_KEY", "").strip()
