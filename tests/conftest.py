import pytest
from pathlib import Path
import os

@pytest.fixture(autouse=True)
def setup_test_db(tmp_path: Path):
    from atracker.config import config
    
    # Override paths to use testing files
    db_file = tmp_path / "test.db"
    config._config["database"]["path"] = str(db_file)
    
    # Store old db path to prevent issues if run sequentially
    yield db_file

@pytest.fixture
async def init_database(setup_test_db):
    from atracker import db
    # Set DEVICE_ID to a fixed test value
    db.DEVICE_ID = "testdevice"
    
    await db.init_db()
    yield
    # No need to cleanup since we use tmp_path

@pytest.fixture
async def async_client(init_database):
    from atracker.api import app
    from httpx import AsyncClient, ASGITransport
    
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
