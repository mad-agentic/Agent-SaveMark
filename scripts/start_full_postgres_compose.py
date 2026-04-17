"""Start the full local Docker Compose stack with app and worker containers."""

from __future__ import annotations

import os
import platform
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "docker-compose.yml"
LEGACY_CONTAINERS = [
    "agent-app",
    "agent-worker",
    "agent-postgres",
    "agent-meili",
    "agent-chromadb",
]


def _run(command: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=ROOT,
        check=check,
        capture_output=True,
        text=True,
    )


def _kill_port_4040() -> None:
    if platform.system() != "Windows":
        return

    result = _run(["netstat", "-ano", "-p", "tcp"], check=False)
    pids: set[str] = set()
    for line in result.stdout.splitlines():
        if ":4040" not in line or "LISTENING" not in line:
            continue
        match = re.split(r"\s+", line.strip())
        if match:
            pids.add(match[-1])

    for pid in pids:
        subprocess.run(["taskkill", "/PID", pid, "/F"], check=False, capture_output=True)


def _remove_legacy_containers() -> None:
    for name in LEGACY_CONTAINERS:
        subprocess.run(["docker", "rm", "-f", name], check=False, capture_output=True)


def _compose(*args: str) -> subprocess.CompletedProcess[str]:
    return _run(["docker", "compose", "-f", str(COMPOSE_FILE), *args])


def _build_image() -> None:
    result = _run(["docker", "build", "-t", "agent-savemark-local:full", "."])
    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="")


def main() -> None:
    _kill_port_4040()
    _remove_legacy_containers()

    _build_image()
    _compose("up", "-d", "db", "meilisearch")
    prepare = _compose("run", "--rm", "prepare")
    if prepare.stdout:
        print(prepare.stdout, end="")
    if prepare.stderr:
        print(prepare.stderr, end="")
    _compose("up", "-d", "app", "worker")
    print("docker compose full-postgres stack is running at http://localhost:4040")


if __name__ == "__main__":
    main()