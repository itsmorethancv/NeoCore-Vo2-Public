from pathlib import Path

from .cmd_control import CmdControl
from .coding_agent import CodingAgent
from .computer_control import ComputerControl
from .screen_processor import ScreenProcessor
from .specialized_utilities import SpecializedUtilities


class ActionExecutor:
    def __init__(self, workspace: Path, llm_complete, logger, approval_handler=None):
        self.logger = logger
        self.workspace = Path(workspace)
        self.computer = ComputerControl(logger)
        self.shell = CmdControl(logger)
        self.vision = ScreenProcessor(logger)
        self.coding = CodingAgent(self.workspace, llm_complete, logger)
        self.utility = SpecializedUtilities(logger)
        self.approval_handler = approval_handler

    async def execute_plan(self, user_request: str, plan: dict, send_log, repair_step) -> dict:
        outputs = []
        for index, step in enumerate(plan.get("steps", []), start=1):
            await send_log(f"Agent step {index}/{len(plan.get('steps', []))}: {step.get('action')} -> {step.get('intent')}")
            
            # Intercept for approval if handler exists
            if self.approval_handler:
                action = step.get("action")
                intent = step.get("intent")
                params = step.get("params") or {}
                
                needs_approval = False
                approval_type = "run"
                description = ""

                if action == "shell" and intent == "run_command":
                    needs_approval = True
                    approval_type = "command"
                    description = params.get("instruction", "")
                elif action == "coding" and intent in ["generate_file", "write_file", "delete_path", "rename_path"]:
                    needs_approval = True
                    approval_type = "edit"
                    description = f"{intent}: {params.get('path') or params.get('path_str')}"

                if needs_approval:
                    await send_log(f"Waiting for user approval: {approval_type}...")
                    approved = await self.approval_handler(approval_type, description)
                    if not approved:
                        await send_log(f"User rejected {approval_type}: {description}")
                        result = {"ok": False, "error": "User rejected action."}
                        outputs.append({"step": step, "result": result})
                        break

            result = await self._execute_step(step)
            if not result.get("ok"):
                await send_log(f"Step {index} failed: {result.get('error', 'unknown error')}")
                repaired = await repair_step(user_request, step, result.get("error", "unknown error"))
                if repaired.get("retry") and repaired.get("step"):
                    await send_log(f"Retrying step {index} with repaired parameters.")
                    result = await self._execute_step(repaired["step"])
            outputs.append({"step": step, "result": result})
            if not result.get("ok"):
                break
        success = outputs and all(item["result"].get("ok") for item in outputs)
        summary = self._summarize_outputs(outputs)
        return {"ok": success, "outputs": outputs, "summary": summary}

    async def _execute_step(self, step: dict) -> dict:
        action = step.get("action")
        intent = step.get("intent")
        params = step.get("params") or {}
        if action == "computer":
            return getattr(self.computer, intent)(**params)
        if action == "shell":
            if intent == "run_command":
                return self.shell.execute(params.get("instruction", ""))
        if action == "vision":
            return getattr(self.vision, intent)(**params)
        if action == "coding":
            return await getattr(self.coding, intent)(**params)
        if action == "utility":
            return getattr(self.utility, intent)(**params)
        return {"ok": False, "error": f"Unknown action: {action}"}

    def _summarize_outputs(self, outputs: list[dict]) -> str:
        lines = []
        for item in outputs:
            result = item.get("result") or {}
            if result.get("ok"):
                lines.append(result.get("message") or result.get("output") or result.get("content") or "Step completed.")
            else:
                lines.append(f"Failed: {result.get('error', 'unknown error')}")
        return "\n".join(str(line).strip() for line in lines if str(line).strip())[:4000]
