"""Shared fixtures — every test file used to re-declare these (5 copies)."""
import os, tempfile, importlib
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mainmod(monkeypatch):
    tmp = tempfile.mkdtemp()
    monkeypatch.setenv("DATABASE_URL", os.path.join(tmp, "test.db"))
    import main
    importlib.reload(main)  # re-run init() against the temp DB
    return main


@pytest.fixture
def client(mainmod):
    return TestClient(mainmod.app)
