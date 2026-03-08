import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "scraper.db"
UI_DIR = BASE_DIR / "ui"

APP_TITLE = "Web Scraper API"
APP_DESCRIPTION = "Web API for MVP projects."
APP_VERSION = "0.1.0"

SECRET_KEY = os.getenv("SCRAPER_SECRET_KEY", "change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
