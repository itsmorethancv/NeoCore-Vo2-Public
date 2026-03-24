import re
import subprocess


class CmdControl:
    def __init__(self, logger):
        self.logger = logger

    def translate(self, instruction: str) -> dict:
        text = (instruction or "").strip()
        low = text.lower()
        if not text:
            return {"ok": False, "error": "No instruction provided."}
        if "largest files" in low and "desktop" in low:
            count_match = re.search(r"(\d+)", low)
            count = int(count_match.group(1)) if count_match else 5
            cmd = (
                "powershell -Command "
                "\"Get-ChildItem $HOME\\Desktop -Recurse -File | "
                "Sort-Object Length -Descending | Select-Object -First "
                f"{count} FullName,Length\""
            )
            return {"ok": True, "command": cmd}
        if low.startswith("list processes"):
            return {"ok": True, "command": "powershell -Command \"Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 ProcessName,Id,CPU\""}
        return {"ok": True, "command": text}

    def execute(self, instruction: str) -> dict:
        translated = self.translate(instruction)
        if not translated.get("ok"):
            return translated
        command = translated["command"]
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=45)
        output = (result.stdout or result.stderr or "").strip()
        return {"ok": result.returncode == 0, "command": command, "output": output}

