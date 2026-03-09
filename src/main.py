import sqlite3
from io import StringIO
import csv

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from .auth import create_access_token, get_current_user, hash_password, verify_password
from .config import APP_DESCRIPTION, APP_TITLE, APP_VERSION, UI_DIR
from .db import (
    create_user,
    delete_scrape_history_for_user,
    get_scrape_history_detail_for_user,
    get_scrape_history_for_user,
    get_user_with_password,
    init_db,
    save_scrape_result,
    username_or_email_exists,
)
from .schemas import LoginRequest, RegisterRequest
from .scraper_service import scrape_url

app = FastAPI(title=APP_TITLE, description=APP_DESCRIPTION, version=APP_VERSION)

if (UI_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=UI_DIR / "assets"), name="assets")


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/", include_in_schema=False)
def home() -> RedirectResponse:
    return RedirectResponse(url="/login", status_code=307)


@app.get("/login", include_in_schema=False)
def login_page() -> FileResponse:
    return FileResponse(UI_DIR / "react.html")


@app.get("/dashboard", include_in_schema=False)
def dashboard_page() -> FileResponse:
    return FileResponse(UI_DIR / "react.html")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/register")
def register(payload: RegisterRequest) -> dict:
    if username_or_email_exists(payload.username, payload.email):
        raise HTTPException(status_code=409, detail="Username or email already exists")

    user_id = create_user(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    return {"message": "User registered", "user_id": user_id}


@app.post("/auth/login")
def login(payload: LoginRequest) -> dict:
    user = get_user_with_password(payload.username)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(user_id=user["id"], username=user["username"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
        },
    }


@app.get("/auth/me")
def auth_me(current_user: sqlite3.Row = Depends(get_current_user)) -> dict:
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "email": current_user["email"],
    }


@app.get("/scrape")
def scrape(
    url: str = Query(..., description="Target website URL"),
    verify_ssl: bool = Query(
        True,
        description="Keep true for production. Set false only for local testing if SSL errors occur.",
    ),
    current_user: sqlite3.Row = Depends(get_current_user),
) -> dict:
    result = scrape_url(url=url, verify_ssl=verify_ssl)
    result["user_id"] = current_user["id"]
    history_id = save_scrape_result(result)
    return {**result, "history_id": history_id, "user": current_user["username"]}


@app.get("/scrape/history")
def scrape_history(
    limit: int = Query(10, ge=1, le=100, description="Number of recent records"),
    q: str = Query("", description="Search by URL or title"),
    current_user: sqlite3.Row = Depends(get_current_user),
) -> dict:
    query = q.strip() or None
    records = get_scrape_history_for_user(current_user["id"], limit, query)
    return {"count": len(records), "items": records, "user": current_user["username"]}


@app.get("/scrape/history/{history_id}")
def scrape_history_detail(
    history_id: int,
    current_user: sqlite3.Row = Depends(get_current_user),
) -> dict:
    item = get_scrape_history_detail_for_user(current_user["id"], history_id)
    if not item:
        raise HTTPException(status_code=404, detail="History item not found")
    return {"item": item, "user": current_user["username"]}


@app.delete("/scrape/history/{history_id}")
def delete_history_item(
    history_id: int,
    current_user: sqlite3.Row = Depends(get_current_user),
) -> dict:
    deleted = delete_scrape_history_for_user(current_user["id"], history_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="History item not found")
    return {"message": "History item deleted", "id": history_id}


@app.get("/scrape/history/export")
def export_history_csv(
    q: str = Query("", description="Search by URL or title"),
    current_user: sqlite3.Row = Depends(get_current_user),
) -> Response:
    query = q.strip() or None
    records = get_scrape_history_for_user(current_user["id"], 1000, query)

    csv_buffer = StringIO()
    writer = csv.writer(csv_buffer)
    writer.writerow(["id", "created_at", "url", "status_code", "title", "h1_count", "links_count"])
    for item in records:
        writer.writerow(
            [
                item.get("id"),
                item.get("created_at"),
                item.get("url"),
                item.get("status_code"),
                item.get("title"),
                item.get("h1_count"),
                item.get("links_count"),
            ]
        )

    csv_content = csv_buffer.getvalue()
    filename = f"scrape_history_{current_user['username']}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
