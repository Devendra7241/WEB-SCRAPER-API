# Web Scraper API (FastAPI)

Simple REST API project that scrapes public page data from a URL and returns JSON.

## Features

- `GET /health` for health check
- `POST /auth/register` for user registration
- `POST /auth/login` for JWT login
- `GET /auth/me` for current user
- `GET /scrape?url=<target>` for scraping
- `GET /scrape/history` for recent scrape records
- `DELETE /scrape/history/{id}` to delete one history row
- `GET /scrape/history/export` to download CSV
- SSL verification with `certifi` bundle by default
- SQLite storage for users + per-user history in `scraper.db`

## Tech Stack

- Python
- FastAPI
- React (browser ESM)
- Requests
- BeautifulSoup4
- SQLite
- Uvicorn

## Project Structure

```text
.
|- src/
|  |- main.py
|  |- config.py
|  |- db.py
|  |- auth.py
|  |- scraper_service.py
|  `- schemas.py
|- requirements.txt
|- README.md
`- scraper.db (auto-created after first run)
```

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

```powershell
uvicorn src.main:app --reload
```

API docs:

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- Login UI (React): `http://127.0.0.1:8000/login`
- Dashboard UI (React): `http://127.0.0.1:8000/dashboard`

## API Usage

Health:

```http
GET /health
```

Register:

```http
POST /auth/register
Content-Type: application/json

{
  "username": "demo",
  "email": "demo@example.com",
  "password": "demo1234"
}
```

Login:

```http
POST /auth/login
Content-Type: application/json

{
  "username": "demo",
  "password": "demo1234"
}
```

Use `Authorization: Bearer <token>` for protected endpoints.

Scrape:

```http
GET /scrape?url=https://example.com
```

If local SSL issue still appears:

```http
GET /scrape?url=https://example.com&verify_ssl=false
```

Use `verify_ssl=false` only for local testing.

History (latest 10 by default):

```http
GET /scrape/history
```

History search:

```http
GET /scrape/history?limit=20&q=quotes
```

Delete one history item:

```http
DELETE /scrape/history/14
```

Export CSV:

```http
GET /scrape/history/export?q=books
```

History with custom limit:

```http
GET /scrape/history?limit=20
```

## Note

Use only on websites where scraping is allowed by Terms of Service and robots policies.
