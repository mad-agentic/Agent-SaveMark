"""Agent-SaveMark - Self-hosted AI-powered personal knowledge base."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("Agent-SaveMark")
except PackageNotFoundError:
    __version__ = "0.2.0"
