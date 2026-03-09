from collections import deque
import re
from urllib.parse import urldefrag, urljoin, urlparse

import certifi
import requests
from bs4 import BeautifulSoup
from fastapi import HTTPException
from requests.exceptions import SSLError

EMAIL_REGEX = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_REGEX = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")


def is_valid_http_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def normalize_url(url: str) -> str:
    clean, _ = urldefrag(url.strip())
    return clean


def normalize_patterns(patterns: list[str] | None) -> list[str]:
    if not patterns:
        return []
    return [p.strip().lower() for p in patterns if p and p.strip()]


def extract_page_data(url: str, status_code: int, html: str, depth: int) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.string.strip() if soup.title and soup.title.string else None
    description_tag = soup.find("meta", attrs={"name": "description"})
    description = description_tag.get("content", "").strip() if description_tag else None
    h1_tags = [h.get_text(strip=True) for h in soup.find_all("h1")]
    links = [a.get("href") for a in soup.find_all("a", href=True)]
    text_content = soup.get_text(" ", strip=True)

    emails = set(email.lower() for email in EMAIL_REGEX.findall(text_content))
    phones = set()
    for match in PHONE_REGEX.findall(text_content):
        normalized = re.sub(r"[^\d+]", "", match)
        digits_only = re.sub(r"\D", "", normalized)
        if 8 <= len(digits_only) <= 15:
            phones.add(normalized)

    for href in links:
        href_lc = href.lower()
        if href_lc.startswith("mailto:"):
            raw_email = href.split(":", 1)[1].split("?", 1)[0].strip().lower()
            if raw_email:
                emails.add(raw_email)
        if href_lc.startswith("tel:"):
            raw_phone = href.split(":", 1)[1].strip()
            normalized = re.sub(r"[^\d+]", "", raw_phone)
            digits_only = re.sub(r"\D", "", normalized)
            if 8 <= len(digits_only) <= 15:
                phones.add(normalized)

    sorted_emails = sorted(emails)
    sorted_phones = sorted(phones)
    return {
        "url": url,
        "depth": depth,
        "status_code": status_code,
        "title": title,
        "meta_description": description,
        "h1_count": len(h1_tags),
        "h1_headings": h1_tags[:10],
        "links_count": len(links),
        "sample_links": links[:20],
        "emails_count": len(sorted_emails),
        "sample_emails": sorted_emails[:20],
        "phones_count": len(sorted_phones),
        "sample_phones": sorted_phones[:20],
        "all_links": links,
        "all_emails": sorted_emails,
        "all_phones": sorted_phones,
    }


def allowed_url(
    target_url: str,
    root_host: str,
    same_domain_only: bool,
    include_patterns: list[str],
    exclude_patterns: list[str],
) -> bool:
    if not is_valid_http_url(target_url):
        return False

    parsed = urlparse(target_url)
    host = (parsed.hostname or "").lower()
    target_lc = target_url.lower()

    if same_domain_only and host != root_host:
        return False
    if include_patterns and not any(pattern in target_lc for pattern in include_patterns):
        return False
    if exclude_patterns and any(pattern in target_lc for pattern in exclude_patterns):
        return False
    return True


def scrape_url(
    url: str,
    verify_ssl: bool,
    max_pages: int = 1,
    depth: int = 0,
    same_domain_only: bool = True,
    include_patterns: list[str] | None = None,
    exclude_patterns: list[str] | None = None,
) -> dict:
    start_url = normalize_url(url)
    if not is_valid_http_url(start_url):
        raise HTTPException(status_code=400, detail="Invalid URL. Use http/https.")
    if max_pages < 1:
        raise HTTPException(status_code=400, detail="max_pages must be at least 1")
    if depth < 0:
        raise HTTPException(status_code=400, detail="depth cannot be negative")

    root_host = (urlparse(start_url).hostname or "").lower()
    includes = normalize_patterns(include_patterns)
    excludes = normalize_patterns(exclude_patterns)
    if includes and excludes:
        overlap = [p for p in includes if p in excludes]
        if overlap:
            raise HTTPException(status_code=400, detail="include and exclude patterns conflict")

    verify_arg = certifi.where() if verify_ssl else False
    queue: deque[tuple[str, int]] = deque([(start_url, 0)])
    visited: set[str] = {start_url}
    pages: list[dict] = []

    total_h1_count = 0
    total_links_count = 0
    all_emails: set[str] = set()
    all_phones: set[str] = set()
    first_success: dict | None = None

    with requests.Session() as session:
        session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                )
            }
        )

        while queue and len(pages) < max_pages:
            current_url, current_depth = queue.popleft()

            try:
                response = session.get(current_url, timeout=15, verify=verify_arg)
                response.raise_for_status()
                final_url = normalize_url(response.url)
                page_data = extract_page_data(final_url, response.status_code, response.text, current_depth)
                pages.append(
                    {
                        "url": page_data["url"],
                        "depth": page_data["depth"],
                        "status_code": page_data["status_code"],
                        "title": page_data["title"],
                        "meta_description": page_data["meta_description"],
                        "h1_count": page_data["h1_count"],
                        "h1_headings": page_data["h1_headings"],
                        "links_count": page_data["links_count"],
                        "sample_links": page_data["sample_links"],
                        "emails_count": page_data["emails_count"],
                        "sample_emails": page_data["sample_emails"],
                        "phones_count": page_data["phones_count"],
                        "sample_phones": page_data["sample_phones"],
                    }
                )
                total_h1_count += page_data["h1_count"]
                total_links_count += page_data["links_count"]
                all_emails.update(page_data["all_emails"])
                all_phones.update(page_data["all_phones"])
                if not first_success:
                    first_success = page_data

                if current_depth >= depth:
                    continue

                for href in page_data["all_links"]:
                    next_url = normalize_url(urljoin(final_url, href))
                    if not next_url or next_url in visited:
                        continue
                    if not allowed_url(next_url, root_host, same_domain_only, includes, excludes):
                        continue
                    visited.add(next_url)
                    queue.append((next_url, current_depth + 1))
            except SSLError as exc:
                if not pages:
                    raise HTTPException(
                        status_code=502,
                        detail=(
                            "SSL certificate verification failed. "
                            "For local testing only, try verify_ssl=false."
                        ),
                    ) from exc
                pages.append(
                    {
                        "url": current_url,
                        "depth": current_depth,
                        "status_code": None,
                        "title": None,
                        "meta_description": None,
                        "h1_count": 0,
                        "h1_headings": [],
                        "links_count": 0,
                        "sample_links": [],
                        "emails_count": 0,
                        "sample_emails": [],
                        "phones_count": 0,
                        "sample_phones": [],
                        "error": "SSL certificate verification failed",
                    }
                )
            except requests.RequestException as exc:
                if not pages:
                    raise HTTPException(status_code=502, detail=f"Fetch failed: {exc}") from exc
                pages.append(
                    {
                        "url": current_url,
                        "depth": current_depth,
                        "status_code": None,
                        "title": None,
                        "meta_description": None,
                        "h1_count": 0,
                        "h1_headings": [],
                        "links_count": 0,
                        "sample_links": [],
                        "emails_count": 0,
                        "sample_emails": [],
                        "phones_count": 0,
                        "sample_phones": [],
                        "error": str(exc),
                    }
                )

    if not first_success:
        raise HTTPException(status_code=502, detail="Unable to scrape the provided URL")

    return {
        "url": first_success["url"],
        "status_code": first_success["status_code"],
        "title": first_success["title"],
        "meta_description": first_success["meta_description"],
        "h1_count": total_h1_count,
        "h1_headings": first_success["h1_headings"],
        "links_count": total_links_count,
        "sample_links": first_success["sample_links"],
        "emails_count": len(all_emails),
        "sample_emails": sorted(all_emails)[:20],
        "phones_count": len(all_phones),
        "sample_phones": sorted(all_phones)[:20],
        "crawled_pages": len([p for p in pages if p.get("status_code") is not None]),
        "failed_pages": len([p for p in pages if p.get("status_code") is None]),
        "max_pages": max_pages,
        "max_depth": depth,
        "same_domain_only": same_domain_only,
        "include_patterns": includes,
        "exclude_patterns": excludes,
        "pages": pages,
    }
