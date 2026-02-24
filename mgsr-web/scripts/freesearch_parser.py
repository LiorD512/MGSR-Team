"""Rule-based free-text parser - same logic as docs/scout-server-freesearch.py"""
import re
from typing import Optional, Tuple


def parse_free_query(query: str, lang: str = "en") -> dict:
    """Parse free-text into recruitment params. Returns position, age_min, age_max, notes, transfer_fee, limit, min_goals."""
    q = query.strip()
    position = _extract_position(q)
    age_max = _extract_age_max(q)
    age_min = _extract_age_min(q)
    min_goals = _extract_min_goals(q)
    limit = _extract_limit(q)
    transfer_fee, israeli_notes = _extract_israeli_market(q)
    notes = _extract_notes(q, min_goals, israeli_notes) or None

    return {
        "position": position,
        "age_min": age_min,
        "age_max": age_max,
        "notes": notes,
        "transfer_fee": transfer_fee,
        "limit": limit,
        "min_goals": min_goals,
    }


def _extract_position(query: str) -> Optional[str]:
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


def _extract_age_max(query: str) -> Optional[int]:
    m = re.search(r"(?:עד\s*גיל|under|up to|max\s*age)\s*(\d+)", query, re.I) or re.search(r"(\d+)\s*(?:שנים?|years?)", query, re.I)
    if m:
        n = int(m.group(1))
        return n if 16 <= n <= 45 else None
    return None


def _extract_age_min(query: str) -> Optional[int]:
    m = re.search(r"(?:מעל|over|above|מינימום\s*גיל)\s*(\d+)", query, re.I)
    if m:
        n = int(m.group(1))
        return n if 16 <= n <= 45 else None
    return None


def _extract_min_goals(query: str) -> Optional[int]:
    m = (
        re.search(r"(?:לפחות|מינימום|at least|minimum)\s*(\d+)\s*(?:שערים?|goals?)", query, re.I)
        or re.search(r"(\d+)\+?\s*(?:שערים?|goals?)", query, re.I)
        or re.search(r"(\d+)\s*(?:שערים?|goals?)\s*(?:בעונה|העונה|last season)", query, re.I)
    )
    if m:
        n = int(m.group(1))
        return n if 0 <= n <= 50 else None
    return None


def _extract_limit(query: str) -> int:
    m = (
        re.search(r"(\d+)\s*(חלוצים?|שחקנים?|strikers?|players?|כנפיים?|wingers?)", query, re.I)
        or re.search(r"(?:find|מצא|תמצא)\s*(?:לי\s*)?(\d+)", query, re.I)
    )
    if m:
        n = int(m.group(1))
        return min(25, max(5, n))
    return 15


def _extract_israeli_market(query: str) -> Tuple[Optional[str], Optional[str]]:
    if re.search(r"(שוק\s*ה?ישראלי|israeli market|israel market|ליגה\s*ה?ישראלית)", query, re.I):
        return "300-600", "Israeli market fit, affordable, lower leagues"
    return None, None


def _extract_notes(query: str, min_goals: Optional[int], israeli_notes: Optional[str]) -> str:
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
