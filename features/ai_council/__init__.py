import json
import re
import time
import uuid
from pathlib import Path
from typing import Optional

COUNCIL_DIR = Path("cherrynet") / "council"
MEMBERS_DIR = COUNCIL_DIR / "members"
LOCAL_COUNCIL_DIR = Path("council")
COUNCIL_LOGS_PATH = COUNCIL_DIR / "council-logs.jsonl"

ALLOWED_CAPABILITIES = {
    "web_search",
    "file_search",
    "shell",
    "open_url",
    "write_file",
    "read_file",
    "mouse_move",
    "mouse_click",
    "type_text",
    "hotkey",
    "key_press",
    "wait",
}


def _get_member_path(member_id: str) -> Path:
    return MEMBERS_DIR / f"{member_id}.json"


def _list_member_files() -> list[Path]:
    MEMBERS_DIR.mkdir(parents=True, exist_ok=True)
    all_files = list(MEMBERS_DIR.glob("*.json"))
    
    # Check local council folder as well
    if LOCAL_COUNCIL_DIR.exists():
        for d in LOCAL_COUNCIL_DIR.iterdir():
            if d.is_dir():
                # Check for individual member config or just check the folder exists
                # For now, let's look for .json files in subdirs or just the names
                pass
    return all_files


def extract_ai_mention(text: str) -> Optional[dict]:
    """Extract @AI_NAME mentions from text. Returns dict with member info if found."""
    if not text:
        return None

    members = []
    for path in _list_member_files():
        try:
            members.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception:
            continue

    for member in members:
        name = member.get("name", "")
        if not name:
            continue
        # Match @Name followed by anything (question, comma, space, etc.)
        pattern = rf"@{re.escape(name)}"
        if re.search(pattern, text, re.IGNORECASE):
            return {"member": member, "name": name}
    return None


class AICouncil:
    def __init__(self):
        MEMBERS_DIR.mkdir(parents=True, exist_ok=True)
        if not list(_list_member_files()):
            self._save_member(DEFAULT_ULTRON.copy())

    def _load_member(self, member_id: str) -> Optional[dict]:
        path = _get_member_path(member_id)
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None

    def _save_member(self, member: dict):
        MEMBERS_DIR.mkdir(parents=True, exist_ok=True)
        path = _get_member_path(member.get("id", ""))
        path.write_text(
            json.dumps(member, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    def list_members(self) -> list[dict]:
        members = []
        for path in _list_member_files():
            try:
                members.append(json.loads(path.read_text(encoding="utf-8")))
            except Exception:
                continue
        return members

    def get_member(self, member_id_or_name: str) -> Optional[dict]:
        target = (member_id_or_name or "").strip().lower()
        
        # Check local council folder first
        if target == "ultron" and (LOCAL_COUNCIL_DIR / "ultron").exists():
            prompt_file = LOCAL_COUNCIL_DIR / "ultron" / "system-prompt.txt"
            if prompt_file.exists():
                return {
                    "id": "ultron-local",
                    "name": "Ultron",
                    "personality": "analytical, proactive, autonomous",
                    "system_prompt": prompt_file.read_text(encoding="utf-8").strip(),
                    "instructions": "High-autonomy executor for coding and automation tasks.",
                    "capabilities": list(ALLOWED_CAPABILITIES),
                    "model_color": "cyan",
                    "enabled": True
                }

        for m in self.list_members():
            if (
                str(m.get("id", "")).lower() == target
                or str(m.get("name", "")).lower() == target
            ):
                return m
        return None

    def create_member(
        self,
        name: str,
        personality: str,
        capabilities: list[str],
        system_prompt: str = "",
        instructions: str = "",
        role: str = "custom",
    ) -> dict:
        normalized_caps = []
        for c in capabilities:
            cap = (c or "").strip().lower()
            if cap in ALLOWED_CAPABILITIES and cap not in normalized_caps:
                normalized_caps.append(cap)

        member = {
            "id": f"council-{uuid.uuid4().hex[:8]}",
            "name": name.strip() or f"ai-{int(time.time())}",
            "personality": personality.strip() or "Helpful AI assistant.",
            "system_prompt": (system_prompt or "").strip(),
            "instructions": (instructions or "").strip(),
            "capabilities": normalized_caps,
            "role": role.strip().lower() if role else "custom",
            "model_color": "default",
            "enabled": True,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        self._save_member(member)
        return member

    def delete_member(self, member_id_or_name: str) -> bool:
        target = (member_id_or_name or "").strip().lower()
        for m in self.list_members():
            if (
                str(m.get("id", "")).lower() == target
                or str(m.get("name", "")).lower() == target
            ):
                path = _get_member_path(m.get("id", ""))
                if path.exists():
                    path.unlink()
                return True
        return False

    def update_member(self, member_id: str, updates: dict) -> Optional[dict]:
        member = self._load_member(member_id)
        if member is None:
            return None
        member.update(updates)
        self._save_member(member)
        return member

    def append_log(self, member_name: str, log_entry: dict):
        COUNCIL_LOGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(COUNCIL_LOGS_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(log_entry) + "\n")
        except Exception:
            pass


DEFAULT_ULTRON = {
    "id": "ultron-001",
    "name": "Ultron",
    "personality": "analytical, proactive, autonomous",
    "system_prompt": "You are Ultron, a high-autonomous AI coding assistant. You have full access to the Lightyear IDE for visible code operations. Prioritize code quality and automation.",
    "instructions": "High-autonomy executor for coding and automation tasks. Opens Lightyear IDE for visible code operations.",
    "capabilities": [
        "web_search",
        "file_search",
        "shell",
        "open_url",
        "write_file",
        "read_file",
        "mouse_move",
        "mouse_click",
        "type_text",
        "hotkey",
        "key_press",
        "wait",
    ],
    "role": "coder",
    "enabled": True,
    "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
}
