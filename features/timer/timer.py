"""
Timer feature for NeoCore-o2.

Provides a countdown timer that broadcasts state via WebSocket.
Voice commands: "open timer", "set timer for X minutes", "start", "pause", "reset timer"
"""

import asyncio
import re
import logging
from dataclasses import dataclass, field
from typing import Optional, Callable, Awaitable

logger = logging.getLogger(__name__)


@dataclass
class TimerState:
    duration_seconds: int = 0
    remaining: int = 0
    running: bool = False
    finished: bool = False

    def to_dict(self) -> dict:
        return {
            "duration_seconds": self.duration_seconds,
            "remaining": self.remaining,
            "running": self.running,
            "finished": self.finished,
            "display": _format_time(self.remaining),
        }


def _format_time(seconds: int) -> str:
    """Format seconds into MM:SS string."""
    if seconds < 0:
        seconds = 0
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def parse_duration_from_text(text: str) -> Optional[int]:
    """
    Parse a duration (in total seconds) from natural language text.
    Examples:
      "5 minutes"          -> 300
      "1 hour 30 minutes"  -> 5400
      "30 seconds"         -> 30
      "set it for 2 mins"  -> 120
    Returns None if no duration found.
    """
    text = text.lower()
    total = 0
    found = False

    hour_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:hour|hr|h)\b", text)
    minute_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:minute|min|m)\b", text)
    second_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:second|sec|s)\b", text)

    if hour_match:
        total += int(float(hour_match.group(1)) * 3600)
        found = True
    if minute_match:
        total += int(float(minute_match.group(1)) * 60)
        found = True
    if second_match:
        total += int(float(second_match.group(1)))
        found = True

    return total if found else None


# Broadcast callback type: async fn(dict) -> None
BroadcastFn = Callable[[dict], Awaitable[None]]


class TimerManager:
    """
    Singleton-style timer manager.
    Call `attach_broadcaster(fn)` to register a WebSocket broadcast function.
    """

    def __init__(self):
        self.state = TimerState()
        self._task: Optional[asyncio.Task] = None
        self._broadcaster: Optional[BroadcastFn] = None

    def attach_broadcaster(self, fn: BroadcastFn):
        """Register a coroutine function that broadcasts a dict to all WebSocket clients."""
        self._broadcaster = fn

    def _fire(self, coro):
        """Schedule a coroutine on the running event loop (fire-and-forget)."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(coro)
            else:
                loop.run_until_complete(coro)
        except Exception as e:
            logger.warning(f"Timer _fire error: {e}")

    async def _broadcast(self, state_dict: dict):
        if self._broadcaster:
            try:
                await self._broadcaster(state_dict)
            except Exception as e:
                logger.warning(f"Timer broadcast error: {e}")

    def set_timer(self, seconds: int):
        """Set the timer duration. Also resets the countdown."""
        if seconds <= 0:
            return
        self._cancel_task()
        self.state = TimerState(
            duration_seconds=seconds,
            remaining=seconds,
            running=False,
            finished=False,
        )
        logger.info(f"Timer set to {seconds} seconds ({_format_time(seconds)})")
        self._fire(self._broadcast_state())

    def start(self):
        """Start or resume the countdown."""
        if self.state.remaining <= 0:
            logger.warning("Timer: no duration set, cannot start.")
            return
        if self.state.running:
            return
        self.state.running = True
        self.state.finished = False
        self._cancel_task()
        self._fire(self._broadcast_state())
        logger.info("Timer started.")
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                self._task = loop.create_task(self._tick_loop())
        except Exception as e:
            logger.error(f"Timer start error: {e}")

    def pause(self):
        """Pause the countdown."""
        self.state.running = False
        self._cancel_task()
        logger.info("Timer paused.")
        self._fire(self._broadcast_state())

    def stop(self):
        """Alias for pause (keep remaining time intact)."""
        self.pause()

    def reset(self):
        """Reset countdown to initial duration."""
        self._cancel_task()
        self.state.running = False
        self.state.finished = False
        self.state.remaining = self.state.duration_seconds
        logger.info("Timer reset.")
        self._fire(self._broadcast_state())

    def get_state(self) -> dict:
        return self.state.to_dict()

    def _cancel_task(self):
        task = self._task
        self._task = None
        if task is not None and not task.done():
            task.cancel()

    async def _broadcast_state(self):
        await self._broadcast({
            "type": "timer_update",
            **self.state.to_dict(),
        })

    async def _tick_loop(self):
        """Countdown loop — ticks once per second and broadcasts each tick."""
        try:
            while self.state.running and self.state.remaining > 0:
                await asyncio.sleep(1)
                if not self.state.running:
                    break
                self.state.remaining = max(0, self.state.remaining - 1)
                await self._broadcast({
                    "type": "timer_tick",
                    **self.state.to_dict(),
                })
                if self.state.remaining == 0:
                    self.state.running = False
                    self.state.finished = True
                    await self._broadcast({
                        "type": "timer_finished",
                        **self.state.to_dict(),
                    })
                    logger.info("Timer finished!")
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Timer tick error: {e}")
