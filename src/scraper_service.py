from urllib.parse import urlparse

import certifi
import requests
from bs4 import BeautifulSoup
from fastapi import HTTPException
from requests.exceptions import SSLError


def is_valid_http_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def scrape_url(url: str, verify_ssl: bool) -> dict:
    if not is_valid_http_url(url):
        raise HTTPException(status_code=400, detail="Invalid URL. Use http/https.")

    try:
        verify_arg = certifi.where() if verify_ssl else False
        response = requests.get(
            url,
            timeout=15,
            verify=verify_arg,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                )
            },
        )
        response.raise_for_status()
    except SSLError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "SSL certificate verification failed. "
                "For local testing only, try verify_ssl=false."
            ),
        ) from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Fetch failed: {exc}") from exc

    soup = BeautifulSoup(response.text, "html.parser")
    title = soup.title.string.strip() if soup.title and soup.title.string else None
    description_tag = soup.find("meta", attrs={"name": "description"})
    description = description_tag.get("content", "").strip() if description_tag else None
    h1_tags = [h.get_text(strip=True) for h in soup.find_all("h1")]
    links = [a.get("href") for a in soup.find_all("a", href=True)]

    return {
        "url": url,
        "status_code": response.status_code,
        "title": title,
        "meta_description": description,
        "h1_count": len(h1_tags),
        "h1_headings": h1_tags[:10],
        "links_count": len(links),
        "sample_links": links[:20],
    }
