"""
Rule-based free-text query parser for football scout server.
Add this to your football-scout-server and expose as /freesearch endpoint.

Usage in FastAPI:
    from freesearch import parse_free_query

    @app.get("/freesearch")
    async def freesearch(q: str, lang: str = "en"):
        params = parse_free_query(q, lang)
        # Call your existing recruitment logic with params
        return await recruitment_search(**params)
"""

import re
from typing import Optional, Tuple


def extract_position(query: str) -> Optional[str]:
    """Extract position from query."""
    patterns = [
        (r"\b(חלוץ|חלוצים|striker|strikers|centre.?forward|center.?forward|cf|st)\b", "CF"),
        (r"\b(כנף|כנפיים|winger|wingers|lw|rw)\b", "LW"),
        (r"\b(קשר|midfielder|midfield|cm|dm|am)\b", "CM"),
        (r"\b(בלם|מגן|defender|centreback|centerback|cb|lb|rb)\b", "CB"),
        (r"\b(שוער|goalkeeper|gk)\b", "GK"),
    ]
    for pattern, pos in patterns:
        if re.search(pattern, query, re.I):
            return pos
    return None


def extract_age_max(query: str) -> Optional[int]:
    """Extract max age: עד גיל 23, under 23, up to 23."""
    m = re.search(
        r"(?:עד\s*גיל|עד\s*גיל\s*|under|up to|max\s*age)\s*(\d+)", query, re.I
    ) or re.search(r"(\d+)\s*(?:שנים?|years?)\s*(?:ולכל\s*היותר|and\s*under)?", query, re.I)
    if m:
        n = int(m.group(1))
        return n if 16 <= n <= 45 else None
    return None


def extract_age_min(query: str) -> Optional[int]:
    """Extract min age: מעל 28, over 28."""
    m = re.search(
        r"(?:מעל|מעל\s*גיל|over|above|מינימום\s*גיל)\s*(\d+)", query, re.I
    ) or re.search(r"(\d+)\s*(?:ומעלה|and\s*over)", query, re.I)
    if m:
        n = int(m.group(1))
        return n if 16 <= n <= 45 else None
    return None


def extract_min_goals(query: str) -> Optional[int]:
    """Extract min goals: לפחות 4 שערים, at least 5 goals."""
    m = (
        re.search(
            r"(?:לפחות|מינימום|at least|minimum)\s*(\d+)\s*(?:שערים?|goals?)", query, re.I
        )
        or re.search(r"(\d+)\+?\s*(?:שערים?|goals?)", query, re.I)
        or re.search(r"(\d+)\s*(?:שערים?|goals?)\s*(?:בעונה|last season)", query, re.I)
    )
    if m:
        n = int(m.group(1))
        return n if 0 <= n <= 50 else None
    return None


def extract_limit(query: str) -> int:
    """Extract limit: 10 חלוצים, find 5."""
    m = (
        re.search(r"(\d+)\s*(חלוצים?|שחקנים?|strikers?|players?|כנפיים?|wingers?)", query, re.I)
        or re.search(r"(?:find|מצא|תמצא)\s*(?:לי\s*)?(\d+)", query, re.I)
    )
    if m:
        n = int(m.group(1))
        return min(25, max(5, n))
    return 15


def extract_israeli_market(query: str) -> Tuple[Optional[str], Optional[str]]:
    """Returns (transfer_fee, notes) for Israeli market."""
    if re.search(r"(שוק\s*ה?ישראלי|israeli market|israel market|ליגה\s*ה?ישראלית)", query, re.I):
        return "300-600", "Israeli market fit, affordable, lower leagues"
    return None, None


def extract_notes(
    query: str, min_goals: Optional[int], israeli_notes: Optional[str]
) -> str:
    """Build notes string from query."""
    parts = []
    if min_goals is not None:
        parts.append(f"{min_goals}+ goals last season")
    if israeli_notes:
        parts.append(israeli_notes)
    style_patterns = [
        (r"\b(מהיר|מהירים|fast|pace|speed)\b", "fast"),
        (r"\b(דריבל|dribbl)", "good dribbling"),
        (r"\b(חזק|strong|physical)\b", "physical"),
        (r"\b(מנוסה|experienced)\b", "experienced"),
        (r"\b(צעיר|young)\b", "young"),
    ]
    for pattern, note in style_patterns:
        if re.search(pattern, query, re.I) and note not in parts:
            parts.append(note)
    return ", ".join(parts)


def parse_free_query(query: str, lang: str = "en") -> dict:
    """
    Parse free-text query into recruitment params.
    Returns dict with: position, age_min, age_max, notes, transfer_fee, limit.
    """
    q = query.strip()
    position = extract_position(q)
    age_max = extract_age_max(q)
    age_min = extract_age_min(q)
    min_goals = extract_min_goals(q)
    limit = extract_limit(q)
    transfer_fee, israeli_notes = extract_israeli_market(q)
    notes = extract_notes(q, min_goals, israeli_notes) or None

    return {
        "position": position,
        "age_min": age_min,
        "age_max": age_max,
        "notes": notes,
        "transfer_fee": transfer_fee,
        "limit": limit,
    }
