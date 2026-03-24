import sys
import os
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

import asyncio
import subprocess
import logging
import time
import re
import json
import threading
import uuid

# Pending action approvals
pending_approvals = {}
from pathlib import Path
from typing import Optional


try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

# Plain in-file config (no venv required).
# Using Ollama for LLM provider
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama").strip().lower()
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "deepseek-v3.2:cloud").strip()
OLLAMA_OFFLINE_MODEL = os.getenv("OLLAMA_OFFLINE_MODEL", "gemma3:1b").strip()
OFFLINE_MODE = False
OLLAMA_TIMEOUT_SECONDS = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "120"))
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "5m").strip()
OLLAMA_AUTO_PULL = os.getenv("OLLAMA_AUTO_PULL", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
OLLAMA_START_ON_BOOT = os.getenv("OLLAMA_START_ON_BOOT", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
OLLAMA_CLI_PULL_ON_BOOT = os.getenv(
    "OLLAMA_CLI_PULL_ON_BOOT", "true"
).strip().lower() in {"1", "true", "yes", "on"}
SUBLET_ALLOW_SHELL = os.getenv("SUBLET_ALLOW_SHELL", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
SUBLET_ALLOW_WRITE_OUTSIDE_WORKSPACE = os.getenv(
    "SUBLET_ALLOW_WRITE_OUTSIDE_WORKSPACE", "true"
).strip().lower() in {"1", "true", "yes", "on"}
SUBLET_MAX_TOOLS = max(1, int(os.getenv("SUBLET_MAX_TOOLS", "5")))


def ensure_package(import_name: str, pip_name: str) -> None:
    try:
        __import__(import_name)
    except ImportError:
        print(f"Installing dependency: {pip_name}...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name])
        except Exception as e:
            print(f"Dependency install failed for {pip_name}: {e}")


# Non-blocking dependency check
def ensure_packages_non_blocking():
    required_packages = [
        ("fastapi", "fastapi"),
        ("uvicorn", "uvicorn"),
        ("psutil", "psutil"),
        ("httpx", "httpx"),
        ("numpy", "numpy"),
        ("pyautogui", "pyautogui"),
        ("pygetwindow", "pygetwindow"),
        ("pynput", "pynput"),
        ("mss", "mss"),
        ("cv2", "opencv-python"),
    ]
    for import_name, pip_name in required_packages:
        ensure_package(import_name, pip_name)

try:
    # Optional; only used if available.
    ensure_package("dotenv", "python-dotenv")
except Exception:
    pass

import psutil  # noqa: E402
import httpx  # noqa: E402
import numpy as np  # noqa: E402
from fastapi import FastAPI, WebSocket, WebSocketDisconnect  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from actions import ActionExecutor, ActionPlanner, MemoryManager  # noqa: E402
from features import ai_council  # noqa: E402


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    import pyautogui  # type: ignore
except Exception as e:
    pyautogui = None  # type: ignore
    logger.warning("pyautogui unavailable; desktop automation disabled: %s", e)

from contextlib import asynccontextmanager

# CherryNet Paths
CHERRYNET_DIR = Path("cherrynet")
PROMPT_PATH = CHERRYNET_DIR / "personality" / "system_prompt.txt"
TRAINING_PATH = CHERRYNET_DIR / "training" / "user_training.json"
MEMORY_PATH = CHERRYNET_DIR / "memory" / "conversation_logs.jsonl"
LONG_TERM_MEMORY_DIR = CHERRYNET_DIR / "memory"

# Initialize AI Council
council = ai_council.AICouncil()
memory_manager = MemoryManager(LONG_TERM_MEMORY_DIR)


def load_personality() -> str:
    try:
        if PROMPT_PATH.exists():
            return PROMPT_PATH.read_text(encoding="utf-8").strip()
    except Exception as e:
        logger.error(f"Error loading personality: {e}")
    return "You are NeoCore, an advanced tactical HUD AI assistant."


def load_training_context(filter_identity: bool = False) -> str:
    try:
        if TRAINING_PATH.exists():
            data = json.loads(TRAINING_PATH.read_text(encoding="utf-8"))
            if isinstance(data, list):
                # Take last 20 samples to keep context lean but useful
                samples = data[-20:]
                context_parts = []
                for item in samples:
                    user_input = (item.get("input") or "").strip()
                    ai_output = (item.get("output") or "").strip()
                    
                    # If filtering identity, skip samples where AI identifies as Neo
                    if filter_identity:
                        if "I am Neo" in ai_output or "Neo-o1" in ai_output or "Neo-o1" in user_input:
                            continue
                            
                    context_parts.append(f"Input: {user_input}\nOutput: {ai_output}")
                
                if context_parts:
                    return "\n[USER TRAINING DATA / KNOWLEDGE BASE]\n" + "\n".join(context_parts)
    except Exception as e:
        logger.error(f"Error loading training data: {e}")
    return ""


def build_system_context(include_personality: bool = True) -> str:
    parts = []
    if include_personality:
        parts.append((DYNAMIC_SYSTEM_PROMPT or "").strip())
        if TRAINING_CONTEXT:
            parts.append(TRAINING_CONTEXT.strip())
    else:
        # Load filtered training context for council members
        filtered_training = load_training_context(filter_identity=True)
        if filtered_training:
            parts.append(filtered_training.strip())
    
    memo = (memory_manager.get_context_block() or "").strip()
    if memo:
        parts.append(memo)
        
    return "\n\n".join(part for part in parts if part)


def log_memory(role: str, content: str):
    try:
        entry = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "role": role,
            "content": content,
        }
        with open(MEMORY_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        logger.error(f"Error logging memory: {e}")


# Initial Load
DYNAMIC_SYSTEM_PROMPT = load_personality()
TRAINING_CONTEXT = load_training_context()
logger.info(f"CherryNet Personality initialized ({len(DYNAMIC_SYSTEM_PROMPT)} chars)")
if TRAINING_CONTEXT:
    logger.info("CherryNet Training Context loaded successfully")
else:
    logger.warning("No CherryNet Training Context found or loaded")

logger.info(
    "LLM provider configured: provider=%s model=%s base=%s",
    LLM_PROVIDER,
    OLLAMA_MODEL,
    OLLAMA_BASE_URL,
)

CURRENT_LLM_PROVIDER = LLM_PROVIDER
planner: Optional[ActionPlanner] = None
executor: Optional[ActionExecutor] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Do not block HTTP/WebSocket bind on model/service checks.
    global planner, executor
    # Offload heavy dependency checking to a background task
    threading.Thread(target=ensure_packages_non_blocking, daemon=True).start()
    planner = ActionPlanner(_complete_text_with_provider, logger)
    executor = ActionExecutor(Path.cwd().resolve(), _complete_text_with_provider, logger)
    asyncio.create_task(_startup_health_check())
    yield
    # Shutdown logic if needed

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)


manager = ConnectionManager()

async def broadcast_to_all(message: dict):
    stale = []
    for ws in list(manager.active_connections):
        try:
            await ws.send_json(message)
        except Exception:
            stale.append(ws)
    for ws in stale:
        manager.disconnect(ws)


async def run_council_member(member_name: str, goal: str, websocket: WebSocket) -> str:
    """Run a council member with the given goal using their configured capabilities."""
    member = council.get_member(member_name)
    if not member:
        return f"Council member '{member_name}' not found."

    name = member.get("name", "Unknown")
    personality = member.get("personality", "Helpful assistant")
    instructions = member.get("instructions", "")
    system_prompt = member.get("system_prompt", "")
    capabilities = set(member.get("capabilities", []))
    model_color = member.get("model_color", "default")

    await manager.send_message(
        {
            "type": "log",
            "message": f"Running council member: {name}",
        },
        websocket,
    )

    # Build system prompt for this council member
    # We establish the council member's specific identity and instructions, 
    # then provide NeoCore's operational context (memory/training) WITHOUT the main Neo personality.
    council_prompt = (
        f"IMPORTANT: You are {name}. You are NOT Neo. You are NOT NeoCore. "
        f"Do not address yourself as Neo or NeoCore. You are a member of the NeoCore Council.\n\n"
        f"{system_prompt}\n\n"
        f"Operational Instructions: {instructions}\n\n"
        f"[NEOCORE COUNCIL CONTEXT]\n"
        f"You are a member of the NeoCore Council. You have access to the following operational context "
        f"from the primary NeoCore HUD system:\n\n"
        f"{build_system_context(include_personality=False)}"
    ).strip()

    # Simple execution - just get LLM response with council member's context
    try:
        history = [
            {
                "role": "user",
                "content": f"Task: {goal}\n\nExecute this task using your capabilities: {', '.join(capabilities)}.",
            }
        ]
        provider = (LLM_PROVIDER or "ollama").strip().lower()

        if provider == "ollama":
            # Pass the council prompt to build the correct message list
            messages = _build_ollama_messages(goal, None, system_prompt=council_prompt)
            payload = {
                "model": OLLAMA_MODEL,
                "messages": messages,
                "stream": False,
            }
            if OLLAMA_KEEP_ALIVE:
                payload["keep_alive"] = OLLAMA_KEEP_ALIVE

            timeout = httpx.Timeout(OLLAMA_TIMEOUT_SECONDS, connect=6.0)
            async with httpx.AsyncClient(timeout=timeout) as client_http:
                response = await client_http.post(
                    f"{OLLAMA_BASE_URL}/api/chat", json=payload
                )
                if response.status_code >= 400:
                    return f"Error: HTTP {response.status_code}"
                data = response.json()
                content = data.get("message", {}).get("content", "No response")
                
                # Consistency fix: Always ensure the UI sees these as council responses
                # We can return it now and main loop will wrap it, or send it directly.
                # Actually, the main loop expects return here.
                return content
    except Exception as e:
        logger.error(f"Council member error: {e}")
        return f"Error running {name}: {e}"



def get_system_metrics():
    try:
        cpu = psutil.cpu_percent(interval=None)
        ram = psutil.virtual_memory().percent
        disk = psutil.disk_usage("/").percent
        net_io = psutil.net_io_counters()
        network = (net_io.bytes_sent + net_io.bytes_recv) / 1024 / 10
        return {"cpu": cpu, "ram": ram, "disk": disk, "network": network}
    except Exception as e:
        logger.error(f"Metrics error: {e}")
        return {"cpu": 0, "ram": 0, "disk": 0, "network": 0}


def open_application(app_name: str) -> str:
    app_mapping = {
        "chrome": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "vscode": "C:\\Users\\itsmo\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
        "notepad": "notepad.exe",
        "explorer": "explorer.exe",
        "cmd": "cmd.exe",
        "powershell": "powershell.exe",
    }
    app_lower = app_name.lower()
    if app_lower in app_mapping:
        try:
            subprocess.Popen(app_mapping[app_lower], shell=True)
            return f"Opening {app_name}..."
        except Exception as e:
            return f"Error opening {app_name}: {e}"
    try:
        subprocess.Popen(f'start "" "{app_name}"', shell=True)
        return f"Opening {app_name}..."
    except Exception as e:
        return f"Could not open {app_name}: {e}"


def search_files(query: str) -> list[str]:
    results = []
    try:
        for path in Path.home().glob(f"*{query}*"):
            if path.is_file() and len(results) < 10:
                results.append(str(path))
    except Exception:
        pass
    return results[:10]


def execute_command(command: str) -> str:
    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True, timeout=30
        )
        return result.stdout if result.stdout else result.stderr
    except Exception as e:
        return f"Error: {e}"
def _build_ollama_messages(message: str, history: Optional[list], system_prompt: Optional[str] = None) -> list[dict]:
    messages = []
    # If a specific system prompt is provided (e.g. from a council member), use it.
    # Otherwise fallback to the global HUD system context.
    final_system = (system_prompt or build_system_context()).strip()
    if final_system:
        messages.append({"role": "system", "content": final_system})

    if isinstance(history, list):
        for item in history:
            if not isinstance(item, dict):
                continue
            role = item.get("role", "user")
            mapped_role = (
                "assistant" if role in {"ai", "assistant", "model"} else "user"
            )
            content = (item.get("content", "") or "").strip()
            if content:
                messages.append({"role": mapped_role, "content": content})

    messages.append({"role": "user", "content": message})
    return messages


def _is_ollama_transient_error(exc: Exception) -> bool:
    return isinstance(
        exc, (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError)
    )


def _format_ollama_error(exc: Exception, model_name: str) -> str:
    text = str(exc).lower()
    if (
        isinstance(exc, (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout))
        or "connection refused" in text
    ):
        return (
            f"Ollama is not reachable at {OLLAMA_BASE_URL}. "
            "Start Ollama, then run `ollama signin`, `ollama pull <model>`, and verify with `ollama list`."
        )
    if "not found" in text or "model" in text and "404" in text:
        return (
            f"Ollama model '{model_name}' was not found. "
            f"Run `ollama pull {model_name}` and verify with `ollama list`."
        )
    if "unauthorized" in text or "forbidden" in text or "auth" in text:
        return (
            "Ollama authentication/session issue detected. "
            "Run `ollama signin`, then `ollama pull <model>`, and retry."
        )
    return (
        f"Ollama request failed: {exc}. "
        "Verify `ollama serve`, `ollama signin`, and `ollama list`."
    )


def _extract_response_from_thinking(text: str) -> str:
    """Extract actual response from reasoning/thinking model output.

    DeepSeek V3.2:cloud and similar reasoning models wrap their output in
    <thinking>...</thinking> tags. This function extracts the actual response
    that comes after the closing tag.

    Args:
        text: Raw response from the model

    Returns:
        Extracted response text (without thinking tags), or original text if no tags found
    """
    if not text:
        return text
    close_tag = "</thinking>"
    if close_tag in text:
        idx = text.find(close_tag)
        after_thinking = text[idx + len(close_tag):].strip()
        return after_thinking
    return text


async def _stream_ollama_response(
    message: str,
    history: Optional[list],
    websocket: WebSocket,
    streaming_message_id: str,
):
    messages = _build_ollama_messages(message, history)
    model_to_use = OLLAMA_OFFLINE_MODEL if OFFLINE_MODE else OLLAMA_MODEL
    payload = {
        "model": model_to_use,
        "messages": messages,
        "stream": True,
    }
    if OLLAMA_KEEP_ALIVE:
        payload["keep_alive"] = OLLAMA_KEEP_ALIVE

    full_response = ""
    chunk_count = 0
    attempts = 2
    last_err = None
    start = time.perf_counter()

    for attempt in range(1, attempts + 1):
        try:
            timeout = httpx.Timeout(OLLAMA_TIMEOUT_SECONDS, connect=6.0)
            async with httpx.AsyncClient(timeout=timeout) as client_http:
                async with client_http.stream(
                    "POST", f"{OLLAMA_BASE_URL}/api/chat", json=payload
                ) as response:
                    if response.status_code >= 400:
                        body = await response.aread()
                        raise RuntimeError(
                            f"HTTP {response.status_code}: {body.decode('utf-8', errors='ignore')}"
                        )
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        data = json.loads(line)
                        if data.get("error"):
                            raise RuntimeError(str(data.get("error")))
                        chunk_text = (data.get("message") or {}).get("content") or ""
                        chunk_text = _extract_response_from_thinking(chunk_text)
                        if chunk_text:
                            full_response += chunk_text
                            chunk_count += 1
                            await manager.send_message(
                                {
                                    "type": "streaming_chunk",
                                    "id": streaming_message_id,
                                    "content": chunk_text,
                                },
                                websocket,
                            )
            elapsed_ms = int((time.perf_counter() - start) * 1000)
            logger.info(
                "LLM_RESPONSE provider=ollama model=%s chunks=%s chars=%s latency_ms=%s",
                OLLAMA_MODEL,
                chunk_count,
                len(full_response),
                elapsed_ms,
            )
            return model_to_use, full_response
        except Exception as e:
            last_err = e
            if attempt < attempts and _is_ollama_transient_error(e):
                logger.warning(
                    "Ollama transient error on attempt %s/%s: %s", attempt, attempts, e
                )
                await asyncio.sleep(0.6)
                continue
            break

    raise RuntimeError(
        _format_ollama_error(last_err or RuntimeError("Unknown Ollama error"), model_to_use)
    )


async def _stream_response(
    message: str,
    history: Optional[list],
    websocket: WebSocket,
    streaming_message_id: str,
):
    provider = (CURRENT_LLM_PROVIDER or "ollama").strip().lower()
    if provider == "ollama":
        model, text = await _stream_ollama_response(
            message, history, websocket, streaming_message_id
        )
        return "ollama", model, text
    raise RuntimeError(
        f"Unsupported LLM_PROVIDER='{provider}'. Only 'ollama' is supported."
    )


def get_llm_settings() -> dict:
    return {
        "provider": (CURRENT_LLM_PROVIDER or "ollama").strip().lower(),
        "providers": ["ollama"],
        "offline_mode": OFFLINE_MODE,
    }


def set_llm_provider(provider_name: str) -> tuple[bool, str]:
    global CURRENT_LLM_PROVIDER
    p = (provider_name or "").strip().lower()
    if p not in {"ollama"}:
        return False, "Invalid provider. Only 'ollama' is supported."
    CURRENT_LLM_PROVIDER = p
    return True, f"LLM provider switched to {p}."


def _extract_json_object(raw_text: str) -> Optional[dict]:
    text = (raw_text or "").strip()
    if not text:
        return None
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
    if fence_match:
        text = fence_match.group(1).strip()
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else None
    except Exception:
        pass
    # Fallback: first {...} block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            obj = json.loads(text[start : end + 1])
            return obj if isinstance(obj, dict) else None
        except Exception:
            return None
    return None


async def _complete_text_with_provider(system_text: str, user_text: str) -> str:
    provider = (LLM_PROVIDER or "ollama").strip().lower()
    if provider == "ollama":
        model_to_use = OLLAMA_OFFLINE_MODEL if OFFLINE_MODE else OLLAMA_MODEL
        messages = _build_ollama_messages(user_text, None, system_prompt=system_text)
        payload = {
            "model": model_to_use,
            "messages": messages,
            "stream": False,
        }
        if OLLAMA_KEEP_ALIVE:
            payload["keep_alive"] = OLLAMA_KEEP_ALIVE
        timeout = httpx.Timeout(OLLAMA_TIMEOUT_SECONDS, connect=6.0)
        async with httpx.AsyncClient(timeout=timeout) as client_http:
            resp = await client_http.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
            resp.raise_for_status()
            data = resp.json()
            if data.get("error"):
                raise RuntimeError(str(data.get("error")))
            response_text = ((data.get("message") or {}).get("content") or "").strip()
            return _extract_response_from_thinking(response_text)

    raise RuntimeError(f"Unsupported LLM_PROVIDER='{provider}'.")


async def _send_agent_log(websocket: WebSocket, message: str):
    await manager.send_message({"type": "log", "message": message}, websocket)


async def _try_agent_execution(message: str, websocket: WebSocket) -> bool:
    if planner is None or executor is None:
        return False
    if not planner.should_delegate(message):
        return False

    async def approval_handler(approval_type: str, description: str) -> bool:
        approval_id = str(uuid.uuid4())
        future = asyncio.get_running_loop().create_future()
        pending_approvals[approval_id] = future
        
        await manager.send_message({
            "type": "action_approval_request",
            "id": approval_id,
            "approval_type": approval_type,
            "description": description
        }, websocket)
        
        try:
            # 5 minute timeout for user to approve
            result = await asyncio.wait_for(future, timeout=300)
            return result
        except asyncio.TimeoutError:
            logger.warning(f"Approval timed out for {approval_id}")
            return False
        finally:
            if approval_id in pending_approvals:
                del pending_approvals[approval_id]

    # Set temporary approval handler for this execution
    old_handler = executor.approval_handler
    executor.approval_handler = approval_handler

    try:
        plan = await planner.create_plan(message)
        if not plan.get("ok"):
            await _send_agent_log(
                websocket,
                f"Planner could not build an action plan: {plan.get('error', 'unknown error')}",
            )
            return False

        await _send_agent_log(
            websocket,
            f"Agent planner ready ({plan.get('source', 'unknown')}): {plan.get('summary', 'task plan generated')}",
        )
        execution = await executor.execute_plan(
            message,
            plan,
            lambda log_text: _send_agent_log(websocket, log_text),
            planner.repair_step,
        )
        summary = execution.get("summary", "").strip() or "Task finished."
        await manager.send_message({"type": "ai_response", "content": summary}, websocket)
        log_memory("user", message)
        log_memory("ai", summary)
        return True
    finally:
        executor.approval_handler = old_handler


async def process_ai_message(
    message: str, websocket: WebSocket, history: Optional[list] = None
):
    await manager.send_message(
        {"type": "log", "message": f"Processing: {message}"}, websocket
    )

    message = (message or "").strip()
    if not message:
        await manager.send_message(
            {"type": "ai_response", "content": "No input received."}, websocket
        )
        return

    learned = memory_manager.ingest_user_message(message)
    if learned:
        await _send_agent_log(websocket, f"Memory updated: {', '.join(learned)}")

    low = message.lower()
    if await _try_agent_execution(message, websocket):
        return

    # DIRECT COUNCIL MENTIONS: If user starts with @Ultron, skip Neo's response
    ai_mention = ai_council.extract_ai_mention(message)
    if ai_mention and message.strip().startswith("@"):
        member = ai_mention.get("member", {})
        member_name = member.get("name", "AI")
        model_color = member.get("model_color", "default")
        query = re.sub(rf"@{re.escape(member_name)}\s*", "", message, flags=re.IGNORECASE).strip()
        
        if query:
            result = await run_council_member(member_name, query, websocket)
            await manager.send_message({
                "type": "ai_council_response",
                "member_name": member_name,
                "model_color": model_color,
                "content": result,
            }, websocket)
            return


    if low.startswith("open "):
        result = open_application(message[5:].strip())
        await manager.send_message({"type": "log", "message": result}, websocket)
        await manager.send_message(
            {"type": "ai_response", "content": result}, websocket
        )
        return
    if low.startswith("search "):
        results = search_files(message[7:].strip())
        content = "No files found." if not results else "Found:\n" + "\n".join(results)
        await manager.send_message(
            {"type": "ai_response", "content": content}, websocket
        )
        return
    if low.startswith("run "):
        out = execute_command(message[4:].strip())
        await manager.send_message(
            {"type": "terminal_output", "command": message, "output": out}, websocket
        )
        return

    # Let Neo process the message normally first, then check if Neo tagged a council member
    full_response = ""
    streaming_message_id = f"ai-{int(time.time() * 1000)}"

    try:
        used_provider, selected_model, full_response = await _stream_response(
            message, history, websocket, streaming_message_id
        )
        logger.info(
            "Response generated using provider=%s model=%s",
            used_provider,
            selected_model,
        )

        await manager.send_message(
            {"type": "streaming_end", "id": streaming_message_id}, websocket
        )

        # Check for AI council @mentions (e.g., @Ultron)
        ai_mention = ai_council.extract_ai_mention(full_response)
        if ai_mention:
            member = ai_mention.get("member", {})
            member_name = member.get("name", "AI")
            model_color = member.get("model_color", "default")

            # Extract the actual query after @mention
            query = re.sub(
                rf"@{re.escape(member_name)}\s*", "", full_response, flags=re.IGNORECASE
            ).strip()

            # Run the council member
            if query:
                try:
                    result = await run_council_member(member_name, query, websocket)
                    # Send AI response with model_color
                    await manager.send_message(
                        {
                            "type": "ai_council_response",
                            "member_name": member_name,
                            "model_color": model_color,
                            "content": result,
                        },
                        websocket,
                    )
                    logger.info(
                        f"AI Council response from {member_name} with color {model_color}"
                    )
                except Exception as council_err:
                    logger.error(f"AI Council run error: {council_err}")
            return

        # Check for widget creation trigger in full response
        # Pattern: [WIDGET:id|title|type|content] or [WIDGET:title|type|content]
        widget_match = re.search(
            r"\[WIDGET:(?:([^|]+)\|)?([^|]+)\|(graph|gauge|text)\|(.*)\]", full_response
        )
        if widget_match:
            w_id, title, w_type, w_content = widget_match.groups()
            await manager.send_message(
                {
                    "type": "create_widget",
                    "id": w_id.strip() if w_id else None,
                    "title": title.strip(),
                    "widget_type": w_type.strip(),
                    "content": w_content.strip(),
                },
                websocket,
            )

        # Pattern: [WIDGET_UPDATE:id|content]
        update_match = re.search(r"\[WIDGET_UPDATE:([^|]+)\|(.*)\]", full_response)
        if update_match:
            u_id, u_content = update_match.groups()
            await manager.send_message(
                {
                    "type": "update_widget",
                    "id": u_id.strip(),
                    "content": u_content.strip(),
                },
                websocket,
            )

        # Check for automation triggers
        if pyautogui is not None:
            if "[MOUSE_MOVE:" in full_response:
                m = re.search(r"\[MOUSE_MOVE:(\d+),(\d+)\]", full_response)
                if m:
                    pyautogui.moveTo(int(m.group(1)), int(m.group(2)), duration=1)
            if "[CLICK]" in full_response:
                pyautogui.click()
            if "[TYPE:" in full_response:
                m = re.search(r"\[TYPE:(.*)\]", full_response)
                if m:
                    pyautogui.write(m.group(1), interval=0.1)

        log_memory("user", message)
        log_memory("ai", full_response)
        logger.info(f"Stream complete ({len(full_response)} chars)")

    except Exception as e:
        err_text = str(e)
        logger.warning("AI request error: %s", err_text)
        await manager.send_message(
            {"type": "ai_response", "content": f"Error: {err_text}"}, websocket
        )


async def _startup_health_check():
    if LLM_PROVIDER != "ollama":
        return

    def _ollama_probe_cli() -> bool:
        try:
            probe = subprocess.run(
                ["ollama", "--version"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=10,
                shell=False,
            )
            if probe.returncode == 0:
                logger.info(
                    "Ollama CLI detected: %s", (probe.stdout or probe.stderr).strip()
                )
                return True
            logger.warning(
                "Ollama CLI probe failed: %s", (probe.stderr or probe.stdout).strip()
            )
            return False
        except FileNotFoundError:
            logger.error("Ollama CLI not found in PATH.")
            return False
        except Exception as e:
            logger.warning("Ollama CLI probe error: %s", e)
            return False

    def _ollama_start_service() -> None:
        try:
            if sys.platform == "win32":
                flags = 0
                flags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                flags |= getattr(subprocess, "DETACHED_PROCESS", 0)
                flags |= getattr(subprocess, "CREATE_NO_WINDOW", 0)
                subprocess.Popen(
                    ["ollama", "serve"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=flags,
                )
            else:
                subprocess.Popen(
                    ["ollama", "serve"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    preexec_fn=os.setsid,
                )
            logger.info("Issued startup command: ollama serve")
        except FileNotFoundError:
            logger.error("Cannot start Ollama service: `ollama` command not found.")
        except Exception as e:
            logger.warning("Failed to start Ollama service: %s", e)

    async def _wait_for_ollama(timeout_s: int = 45) -> bool:
        end = time.time() + timeout_s
        timeout = httpx.Timeout(2.5, connect=2.0)
        while time.time() < end:
            try:
                async with httpx.AsyncClient(timeout=timeout) as client_http:
                    response = await client_http.get(f"{OLLAMA_BASE_URL}/api/tags")
                    if response.status_code == 200:
                        return True
            except Exception:
                pass
            await asyncio.sleep(1.0)
        return False

    def _ollama_pull_cli() -> None:
        try:
            logger.info("Running startup command: ollama pull %s", OLLAMA_MODEL)
            pull = subprocess.run(
                ["ollama", "pull", OLLAMA_MODEL],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=60 * 60,
                shell=False,
            )
            if pull.returncode == 0:
                logger.info("Startup model pull complete for %s", OLLAMA_MODEL)
            else:
                logger.warning(
                    "Startup model pull failed for %s (exit=%s)",
                    OLLAMA_MODEL,
                    pull.returncode,
                )
        except FileNotFoundError:
            logger.error("Cannot pull model: `ollama` command not found.")
        except subprocess.TimeoutExpired:
            logger.warning("Startup model pull timed out for %s", OLLAMA_MODEL)
        except Exception as e:
            logger.warning("Startup model pull error for %s: %s", OLLAMA_MODEL, e)

    cli_ok = await asyncio.to_thread(_ollama_probe_cli)
    if cli_ok and OLLAMA_START_ON_BOOT:
        await asyncio.to_thread(_ollama_start_service)

    if not await _wait_for_ollama():
        logger.warning(
            "Ollama endpoint is unavailable at startup. Ensure Ollama is installed and running, then run: "
            "`ollama pull %s`.",
            OLLAMA_MODEL,
        )
        return

    try:
        timeout = httpx.Timeout(2.5, connect=2.0)
        async with httpx.AsyncClient(timeout=timeout) as client_http:
            response = await client_http.get(f"{OLLAMA_BASE_URL}/api/tags")
            if response.status_code == 200:
                models = response.json().get("models", [])
                logger.info(
                    "Ollama reachable. models_available=%s configured_model=%s",
                    len(models),
                    OLLAMA_MODEL,
                )
                if cli_ok and OLLAMA_CLI_PULL_ON_BOOT:
                    await asyncio.to_thread(_ollama_pull_cli)
                elif OLLAMA_AUTO_PULL:
                    pull_payload = {"model": OLLAMA_MODEL, "stream": False}
                    try:
                        await client_http.post(
                            f"{OLLAMA_BASE_URL}/api/pull", json=pull_payload
                        )
                        logger.info(
                            "OLLAMA_AUTO_PULL enabled: ensured model pull for %s",
                            OLLAMA_MODEL,
                        )
                    except Exception as pull_err:
                        logger.warning(
                            "OLLAMA_AUTO_PULL failed for %s: %s", OLLAMA_MODEL, pull_err
                        )
            else:
                logger.warning(
                    "Ollama health check failed: HTTP %s", response.status_code
                )
    except Exception as e:
        logger.warning(
            "Ollama endpoint is unavailable (%s). Start Ollama and run: `ollama signin`, "
            "`ollama pull %s`, then confirm with `ollama list`.",
            e,
            OLLAMA_MODEL,
        )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            if action == "get_metrics":
                metrics = get_system_metrics()
                metrics["type"] = "metrics"
                await websocket.send_json(metrics)
            elif action == "chat":
                await process_ai_message(
                    data.get("message", ""), websocket, data.get("history", [])
                )
            elif action == "agent_task":
                await process_ai_message(
                    data.get("message", ""), websocket, data.get("history", [])
                )
            elif action == "open_app":
                result = open_application(data.get("app", ""))
                await manager.send_message(
                    {"type": "log", "message": result}, websocket
                )
            elif action == "terminal_cmd":
                command = data.get("command", "")
                await manager.send_message(
                    {"type": "log", "message": f"Terminal executing: {command}"},
                    websocket,
                )
                output = execute_command(command)
                await manager.send_message(
                    {"type": "terminal_output", "command": command, "output": output},
                    websocket,
                )
            elif action == "action_approval_response":
                app_token = data.get("id")
                approved = data.get("approved", False)
                if app_token in pending_approvals:
                    pending_approvals[app_token].set_result(approved)
            elif action == "get_llm_settings":
                await websocket.send_json(
                    {"type": "llm_settings", **get_llm_settings()}
                )
            elif action == "set_llm_settings":
                global OFFLINE_MODE
                if "offline_mode" in data:
                    OFFLINE_MODE = bool(data["offline_mode"])
                
                ok, msg = set_llm_provider(data.get("provider", ""))
                await websocket.send_json(
                    {"type": "llm_settings", **get_llm_settings()}
                )
                await manager.send_message({"type": "log", "message": msg}, websocket)
                if not ok:
                    await manager.send_message(
                        {"type": "ai_response", "content": msg}, websocket
                    )
            elif action == "council_list":
                await websocket.send_json(
                    {"type": "council_list", "items": council.list_members()}
                )
            elif action == "council_run":
                member_name = data.get("name", "")
                goal = data.get("goal", "")
                member = council.get_member(member_name)
                result = await run_council_member(member_name, goal, websocket)
                await websocket.send_json(
                    {
                        "type": "ai_council_response",
                        "member_name": member_name,
                        "model_color": getattr(member, "model_color", "cyan") if member else "cyan",
                        "content": result
                    }
                )
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"WebSocket execution error: {e}")


@app.get("/")
async def root():
    return {"status": "NeoCore Backend Running"}


def kill_port_8000():
    try:
        current_pid = os.getpid()
        for conn in psutil.net_connections(kind="inet"):
            if not conn.laddr:
                continue
            if conn.laddr.port != 8000:
                continue
            if not conn.pid or conn.pid == current_pid:
                continue
            try:
                p = psutil.Process(conn.pid)
                logger.warning(
                    f"Killing stale process {conn.pid} on port 8000 ({p.name()})"
                )
                p.terminate()
                p.wait(timeout=3)
            except Exception:
                try:
                    psutil.Process(conn.pid).kill()
                except Exception:
                    pass
        time.sleep(0.5)
    except Exception as e:
        logger.error(f"Cleanup error: {e}")


if __name__ == "__main__":
    import uvicorn

    logger.info("Initializing NeoCore System...")
    kill_port_8000()
    uvicorn.run(app, host="127.0.0.1", port=8000)
