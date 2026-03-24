from pathlib import Path

try:
    import cv2  # type: ignore
except Exception:
    cv2 = None  # type: ignore

try:
    import mss  # type: ignore
    import mss.tools  # type: ignore
except Exception:
    mss = None  # type: ignore


class ScreenProcessor:
    def __init__(self, logger):
        self.logger = logger

    def capture_screen(self, path: str = "") -> dict:
        if mss is None:
            return {"ok": False, "error": "mss is not installed."}
        target = Path(path).expanduser() if path else Path.cwd() / "captures" / "screen.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        with mss.mss() as sct:
            shot = sct.grab(sct.monitors[1])
            mss.tools.to_png(shot.rgb, shot.size, output=str(target))
        return {"ok": True, "path": str(target.resolve()), "message": f"Screen captured to {target.resolve()}"}

    def capture_webcam(self, path: str = "") -> dict:
        if cv2 is None:
            return {"ok": False, "error": "opencv-python is not installed."}
        target = Path(path).expanduser() if path else Path.cwd() / "captures" / "webcam.jpg"
        target.parent.mkdir(parents=True, exist_ok=True)
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            return {"ok": False, "error": "Webcam is unavailable."}
        ok, frame = cap.read()
        cap.release()
        if not ok:
            return {"ok": False, "error": "Failed to read from webcam."}
        cv2.imwrite(str(target), frame)
        return {"ok": True, "path": str(target.resolve()), "message": f"Webcam frame saved to {target.resolve()}"}

    def describe_available_context(self) -> dict:
        screen = self.capture_screen()
        return {
            "ok": screen.get("ok", False),
            "message": (
                "Captured the current screen. A full semantic scene description requires a vision-capable model, "
                "so Neo stored the image for manual inspection and downstream tooling."
            ),
            "path": screen.get("path"),
        }
