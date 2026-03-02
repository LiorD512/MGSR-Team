"""
IFA (football.org.il) player profile fetch — add to football-scout-server.
Uses Playwright to bypass 403 when Vercel direct fetch is blocked.

Add to your FastAPI app:
    from ifa_fetch import router as ifa_router
    app.include_router(ifa_router, prefix="/ifa", tags=["ifa"])

Requires: pip install playwright beautifulsoup4
          playwright install chromium
"""

import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

IFA_BASE = "https://www.football.org.il"
CURRENT_SEASON_ID = "27"

POS_MAP = {
    "שוער": "GK", "בלם מרכזי": "CB", "מגן ימני": "RB", "מגן שמאלי": "LB",
    "קשר הגנתי": "DM", "קשר מרכזי": "CM", "קשר התקפי": "AM",
    "כנף ימני": "RW", "כנף שמאלי": "LW", "חלוץ מרכזי": "CF", "חלוץ": "ST",
    "חלוץ משני": "SS", "בלם": "CB", "מגן": "CB", "קשר": "CM", "כנף": "RW",
}


def map_hebrew_position(raw: str) -> list[str]:
    lower = (raw or "").strip()
    if lower in POS_MAP:
        return [POS_MAP[lower]]
    return [POS_MAP[k] for k in POS_MAP if k in lower] or [raw]


def parse_ifa_profile(html: str, url: str) -> dict:
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")

    profile = {"fullName": "", "ifaUrl": url}
    if m := re.search(r"player_id=(\d+)", url):
        profile["ifaPlayerId"] = m.group(1)

    card_title = soup.select_one(".new-player-card_title")
    h1 = (card_title.get_text(strip=True) if card_title else None) or (
        soup.find("h1").get_text(strip=True) if soup.find("h1") else ""
    )
    if h1:
        profile["fullNameHe"] = h1
        parts = re.split(r"\s*[-–]\s*", h1)
        he_part = next((p for p in parts if re.search(r"[\u0590-\u05FF]", p)), None)
        en_part = next((p.strip() for p in parts if p and re.match(r"^[A-Za-z\s]+$", p.strip())), None)
        if he_part:
            profile["fullNameHe"] = he_part.strip()
        profile["fullName"] = en_part or h1

    name_el = soup.select_one(".player-name, .player-header-name")
    if not profile.get("fullName") and name_el:
        profile["fullName"] = name_el.get_text(strip=True)
        if re.search(r"[\u0590-\u05FF]", profile["fullName"]):
            profile["fullNameHe"] = profile["fullName"]

    img = soup.select_one(".new-player-card_img-container img") or soup.select_one(
        ".player-image img, .player-photo img, .player-header img"
    )
    if img and img.get("src"):
        src = img["src"].strip()
        profile["profileImage"] = src if src.startswith("http") else IFA_BASE + src

    for li in soup.select(".new-player-card_data-list li"):
        text = li.get_text(strip=True)
        if m := re.search(r"תאריך לידה[:\s]*(\d{1,2}/\d{4}|\d{1,2}[./]\d{1,2}[./]\d{4})", text):
            profile["dateOfBirth"] = m.group(1)
            parts = re.split(r"[./]", m.group(1))
            if len(parts) >= 2:
                profile["age"] = str(__import__("datetime").datetime.now().year - int(parts[-1]))
        if m := re.search(r"אזרחות[:\s]*(.+)", text):
            profile["nationality"] = m.group(1).strip()

    body = soup.get_text()
    if not profile.get("dateOfBirth"):
        if m := re.search(r"תאריך לידה[:\s]*(\d{1,2}[./]\d{1,2}[./]\d{4})", body) or re.search(
            r"תאריך לידה[:\s]*(\d{1,2}/\d{4})", body
        ):
            profile["dateOfBirth"] = m.group(1)
            parts = re.split(r"[./]", m.group(1))
            if len(parts) >= 2:
                profile["age"] = str(__import__("datetime").datetime.now().year - int(parts[-1]))
    if not profile.get("nationality") and (m := re.search(r"אזרחות[:\s]*([^\n,]+)", body)):
        profile["nationality"] = m.group(1).strip()

    team_span = soup.select_one(".new-player-data_title .js-container-title span, .new-player-data_title span")
    if team_span:
        profile["currentClub"] = team_span.get_text(strip=True)
    if not profile.get("currentClub") and (m := re.search(r"קבוצה[:\s]*([^\n,]+)", body)):
        profile["currentClub"] = m.group(1).strip()
    if m := re.search(r"מחלקה[:\s]*([^\n,]+)", body) or re.search(r"מסגרת[:\s]*([^\n,]+)", body):
        profile["academy"] = m.group(1).strip()
    if m := re.search(r"תפקיד[:\s]*([^\n,]+)", body) or re.search(r"עמדה[:\s]*([^\n,]+)", body):
        profile["positions"] = map_hebrew_position(m.group(1))
    if m := re.search(r"רגל[:\s]*(ימין|שמאל|שתיים)", body):
        profile["foot"] = {"ימין": "Right", "שמאל": "Left", "שתיים": "Both"}.get(m.group(1), m.group(1))
    if m := re.search(r"גובה[:\s]*(\d{2,3})", body):
        profile["height"] = m.group(1) + " cm"

    stats = {"season": CURRENT_SEASON_ID}
    for table in soup.find_all("table"):
        if "משחקים" in table.get_text() or "שערים" in table.get_text():
            rows = table.find_all("tr")
            if len(rows) >= 2:
                cells = rows[1].find_all("td")
                if len(cells) >= 3:
                    stats["matches"] = int(cells[0].get_text(strip=True) or 0)
                    stats["goals"] = int(cells[1].get_text(strip=True) or 0)
                    stats["assists"] = int(cells[2].get_text(strip=True) or 0)
            break
    if not stats.get("matches"):
        if m := re.search(r"משחקים[:\s]*(\d+)", body):
            stats["matches"] = int(m.group(1))
        if m := re.search(r"שערים[:\s]*(\d+)", body):
            stats["goals"] = int(m.group(1))
        if m := re.search(r"בישולים[:\s]*(\d+)|מסירות מכריעות[:\s]*(\d+)", body):
            stats["assists"] = int(m.group(1) or m.group(2) or 0)
    if stats.get("matches") or stats.get("goals"):
        profile["stats"] = stats

    return profile


class FetchProfileRequest(BaseModel):
    url: str


@router.post("/fetch-profile")
async def fetch_ifa_profile(req: FetchProfileRequest):
    """Fetch IFA player profile using Playwright (bypasses 403)."""
    url = (req.url or "").strip()
    if not re.match(r"^https?://(www\.)?football\.org\.il/(en/)?players/player/\?player_id=\d+", url):
        raise HTTPException(400, "Invalid IFA profile URL")
    url = url.replace("football.org.il/en/players/", "football.org.il/players/")

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise HTTPException(500, "Playwright not installed. Run: pip install playwright && playwright install chromium")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
        try:
            page = await browser.new_page(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
                extra_http_headers={"Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8"},
            )
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            html = await page.content()
        finally:
            await browser.close()

    return parse_ifa_profile(html, url)
