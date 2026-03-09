import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

from .config import DB_PATH


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS scrape_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                created_at TEXT NOT NULL,
                url TEXT NOT NULL,
                status_code INTEGER NOT NULL,
                title TEXT,
                meta_description TEXT,
                h1_count INTEGER NOT NULL,
                links_count INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )
        columns = [
            row["name"]
            for row in conn.execute("PRAGMA table_info(scrape_history)").fetchall()
        ]
        if "user_id" not in columns:
            conn.execute("ALTER TABLE scrape_history ADD COLUMN user_id INTEGER")
        if "emails_count" not in columns:
            conn.execute("ALTER TABLE scrape_history ADD COLUMN emails_count INTEGER NOT NULL DEFAULT 0")
        if "phones_count" not in columns:
            conn.execute("ALTER TABLE scrape_history ADD COLUMN phones_count INTEGER NOT NULL DEFAULT 0")
        conn.commit()


def get_user_by_id(user_id: int) -> sqlite3.Row | None:
    with get_db_connection() as conn:
        return conn.execute(
            "SELECT id, username, email FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()


def get_user_with_password(username: str) -> sqlite3.Row | None:
    with get_db_connection() as conn:
        return conn.execute(
            "SELECT id, username, email, password_hash FROM users WHERE username = ?",
            (username,),
        ).fetchone()


def username_or_email_exists(username: str, email: str) -> bool:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE username = ? OR email = ?",
            (username, email),
        ).fetchone()
    return row is not None


def create_user(username: str, email: str, password_hash: str) -> int:
    created_at = datetime.now(timezone.utc).isoformat()
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO users (username, email, password_hash, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (username.strip(), email.strip().lower(), password_hash, created_at),
        )
        conn.commit()
        return int(cursor.lastrowid)


def save_scrape_result(result: dict[str, Any]) -> int:
    created_at = datetime.now(timezone.utc).isoformat()
    payload_json = json.dumps(result, ensure_ascii=True)
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO scrape_history (
                user_id, created_at, url, status_code, title, meta_description,
                h1_count, links_count, emails_count, phones_count, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                result["user_id"],
                created_at,
                result["url"],
                result["status_code"],
                result["title"],
                result["meta_description"],
                result["h1_count"],
                result["links_count"],
                int(result.get("emails_count", 0) or 0),
                int(result.get("phones_count", 0) or 0),
                payload_json,
            ),
        )
        conn.commit()
        return int(cursor.lastrowid)


def get_scrape_history_for_user(
    user_id: int,
    limit: int,
    offset: int = 0,
    query: str | None = None,
    status_group: str = "all",
) -> list[dict[str, Any]]:
    params: list[Any] = [user_id]
    sql = """
        SELECT id, created_at, url, status_code, title, h1_count, links_count, emails_count, phones_count, payload_json
        FROM scrape_history
        WHERE user_id = ?
    """
    if query:
        sql += " AND (url LIKE ? OR title LIKE ?)"
        pattern = f"%{query}%"
        params.extend([pattern, pattern])

    if status_group == "success":
        sql += " AND status_code >= 200 AND status_code < 400"
    elif status_group == "error":
        sql += " AND status_code >= 400"

    sql += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with get_db_connection() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        payload_raw = item.pop("payload_json", "")
        sample_emails: list[str] = []
        sample_phones: list[str] = []
        if payload_raw:
            try:
                payload = json.loads(payload_raw)
                sample_emails = payload.get("sample_emails") or []
                sample_phones = payload.get("sample_phones") or []
            except json.JSONDecodeError:
                sample_emails = []
                sample_phones = []

        item["sample_emails"] = sample_emails
        item["sample_phones"] = sample_phones
        item["primary_email"] = sample_emails[0] if sample_emails else "-"
        item["primary_phone"] = sample_phones[0] if sample_phones else "-"
        items.append(item)
    return items


def get_scrape_history_count_for_user(
    user_id: int,
    query: str | None = None,
    status_group: str = "all",
) -> int:
    params: list[Any] = [user_id]
    sql = "SELECT COUNT(*) AS total FROM scrape_history WHERE user_id = ?"

    if query:
        sql += " AND (url LIKE ? OR title LIKE ?)"
        pattern = f"%{query}%"
        params.extend([pattern, pattern])

    if status_group == "success":
        sql += " AND status_code >= 200 AND status_code < 400"
    elif status_group == "error":
        sql += " AND status_code >= 400"

    with get_db_connection() as conn:
        row = conn.execute(sql, tuple(params)).fetchone()
    return int(row["total"] if row else 0)


def get_scrape_history_detail_for_user(user_id: int, history_id: int) -> dict[str, Any] | None:
    with get_db_connection() as conn:
        row = conn.execute(
            """
            SELECT id, created_at, url, status_code, title, meta_description, h1_count, links_count, payload_json
            FROM scrape_history
            WHERE id = ? AND user_id = ?
            """,
            (history_id, user_id),
        ).fetchone()

    if not row:
        return None

    data = dict(row)
    payload_raw = data.pop("payload_json", "")
    try:
        data["payload"] = json.loads(payload_raw) if payload_raw else {}
    except json.JSONDecodeError:
        data["payload"] = {}
    return data


def delete_scrape_history_for_user(user_id: int, history_id: int) -> bool:
    with get_db_connection() as conn:
        cursor = conn.execute(
            "DELETE FROM scrape_history WHERE id = ? AND user_id = ?",
            (history_id, user_id),
        )
        conn.commit()
    return cursor.rowcount > 0
