import subprocess
import webbrowser
from urllib.parse import quote_plus


class SpecializedUtilities:
    def __init__(self, logger):
        self.logger = logger

    def find_flights(self, origin: str, destination: str) -> dict:
        url = f"https://www.google.com/travel/flights?q=Flights%20from%20{quote_plus(origin)}%20to%20{quote_plus(destination)}"
        webbrowser.open(url)
        return {"ok": True, "message": f"Opened Google Flights for {origin} to {destination}.", "url": url}

    def open_youtube(self, query: str = "") -> dict:
        url = "https://www.youtube.com" if not query else f"https://www.youtube.com/results?search_query={quote_plus(query)}"
        webbrowser.open(url)
        return {"ok": True, "message": f"Opened YouTube{' search' if query else ''}.", "url": url}

    def send_message(self, platform: str, recipient: str, text: str) -> dict:
        platform = (platform or "").strip().lower()
        if platform == "whatsapp":
            url = f"https://web.whatsapp.com/send?text={quote_plus(text)}"
        elif platform == "telegram":
            url = f"https://web.telegram.org/"
        else:
            return {"ok": False, "error": f"Unsupported messaging platform: {platform}"}
        webbrowser.open(url)
        return {"ok": True, "message": f"Opened {platform} for {recipient or 'the target recipient'}.", "url": url}

    def set_reminder(self, title: str, when: str, message: str) -> dict:
        task_name = f"NeoCoreReminder_{title[:24].replace(' ', '_')}"
        command = (
            f'schtasks /Create /F /SC ONCE /TN "{task_name}" /TR '
            f'"powershell -Command \\"Add-Type -AssemblyName PresentationFramework; '
            f'[System.Windows.MessageBox]::Show(\'{message}\', \'{title}\')\\"" /ST {when}'
        )
        result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
        output = (result.stdout or result.stderr or "").strip()
        return {"ok": result.returncode == 0, "message": output or f"Reminder {task_name} scheduled."}

