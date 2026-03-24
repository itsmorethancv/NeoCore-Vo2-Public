import json
import re
import time
from pathlib import Path


class MemoryManager:
    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.path = self.base_dir / "long_term.json"
        self.data = self._load()

    def _load(self) -> dict:
        if not self.path.exists():
            return {"facts": [], "profile": {}}
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return {"facts": [], "profile": {}}

    def _save(self) -> None:
        self.path.write_text(json.dumps(self.data, indent=2), encoding="utf-8")

    def _remember(self, category: str, value: str, source: str) -> bool:
        value = (value or "").strip()
        if not value:
            return False
        facts = self.data.setdefault("facts", [])
        normalized = value.lower()
        for fact in facts:
            if fact.get("category") == category and (fact.get("value") or "").lower() == normalized:
                fact["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                return False
        facts.append(
            {
                "category": category,
                "value": value,
                "source": source,
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        )
        self._save()
        return True

    def ingest_user_message(self, text: str) -> list[str]:
        text = (text or "").strip()
        if not text:
            return []
        learned = []
        patterns = [
            ("name", r"\bmy name is ([A-Za-z][A-Za-z\s'-]{1,40})\b"),
            ("city", r"\bi live in ([A-Za-z][A-Za-z\s,'-]{1,60})\b"),
            ("works_at", r"\bi work at ([A-Za-z0-9&.,' -]{2,80})\b"),
            ("likes", r"\bi like ([A-Za-z0-9&.,' -]{2,80})\b"),
            ("prefers", r"\bi prefer ([A-Za-z0-9&.,' -]{2,80})\b"),
            ("favorite", r"\bmy favorite ([A-Za-z ]{2,40}) is ([A-Za-z0-9&.,' -]{2,80})\b"),
        ]
        for category, pattern in patterns:
            match = re.search(pattern, text, flags=re.IGNORECASE)
            if not match:
                continue
            if category == "favorite":
                key = f"favorite_{match.group(1).strip().lower().replace(' ', '_')}"
                value = match.group(2).strip()
                if self._remember(key, value, text):
                    learned.append(f"{key}={value}")
                continue
            value = match.group(1).strip()
            if self._remember(category, value, text):
                learned.append(f"{category}={value}")
        return learned

    def get_context_block(self) -> str:
        facts = self.data.get("facts", [])
        if not facts:
            return ""
        lines = []
        for fact in facts[-12:]:
            category = fact.get("category", "fact")
            value = fact.get("value", "")
            if value:
                lines.append(f"- {category}: {value}")
        if not lines:
            return ""
        return "[PERSISTENT USER MEMORY]\n" + "\n".join(lines)

