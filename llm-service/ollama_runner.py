from __future__ import annotations

import asyncio
import logging
import os
import signal
import subprocess

import httpx

logger = logging.getLogger(__name__)


class OllamaRunner:
    def __init__(
        self,
        host: str,
        model: str,
        ready_timeout: float = 120.0,
        pull_timeout: float = 900.0,
    ):
        self.host = host
        self.model = model
        self.ready_timeout = ready_timeout
        self.pull_timeout = pull_timeout
        self.process: subprocess.Popen | None = None

    @property
    def base_url(self) -> str:
        return f"http://{self.host}"

    @property
    def _env(self) -> dict[str, str]:
        return {**os.environ, "OLLAMA_HOST": self.host}

    async def start(self) -> None:
        logger.info("Starting `ollama serve` on %s", self.host)
        self.process = subprocess.Popen(
            ["ollama", "serve"],
            env=self._env,
            start_new_session=True,
        )
        await self._wait_ready()
        if not await self._model_present():
            await self._pull_model()
        else:
            logger.info("Model %s already present, skipping pull", self.model)

    async def stop(self) -> None:
        if self.process and self.process.poll() is None:
            logger.info("Stopping ollama subprocess (pid=%d)", self.process.pid)
            try:
                os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
                await asyncio.get_running_loop().run_in_executor(None, self.process.wait, 10)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                self.process.kill()

    async def is_alive(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(self.base_url + "/")
                return resp.status_code == 200
        except httpx.HTTPError:
            return False

    async def _wait_ready(self) -> None:
        deadline = asyncio.get_running_loop().time() + self.ready_timeout
        async with httpx.AsyncClient(timeout=3.0) as client:
            while asyncio.get_running_loop().time() < deadline:
                try:
                    resp = await client.get(self.base_url + "/")
                    if resp.status_code == 200:
                        logger.info("Ollama is ready")
                        return
                except httpx.HTTPError:
                    pass
                await asyncio.sleep(1.0)
        raise RuntimeError(f"Ollama did not become ready within {self.ready_timeout}s")

    async def _model_present(self) -> bool:
        proc = await asyncio.create_subprocess_exec(
            "ollama", "list",
            env=self._env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        out, _ = await proc.communicate()
        if proc.returncode != 0:
            logger.warning("`ollama list` failed, trying pull anyway")
            return False
        base = self.model.split(":", 1)[0]
        return base in out.decode("utf-8", errors="replace")

    async def _pull_model(self) -> None:
        logger.info("Pulling model %s (this can take a while)", self.model)
        proc = await asyncio.create_subprocess_exec(
            "ollama", "pull", self.model,
            env=self._env,
        )
        try:
            await asyncio.wait_for(proc.wait(), timeout=self.pull_timeout)
        except TimeoutError:
            proc.kill()
            raise RuntimeError(f"`ollama pull {self.model}` exceeded {self.pull_timeout}s") from None
        if proc.returncode != 0:
            raise RuntimeError(f"`ollama pull {self.model}` exited {proc.returncode}")
        logger.info("Model %s pulled", self.model)
