import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_status(async_client: AsyncClient):
    response = await async_client.get("/api/status")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "running"
    assert "db_path" in data

@pytest.mark.asyncio
async def test_events_empty(async_client: AsyncClient):
    response = await async_client.get("/api/events")
    assert response.status_code == 200
    data = response.json()
    assert "date" in data
    assert "events" in data
    assert len(data["events"]) == 0

@pytest.mark.asyncio
async def test_categories_seeded(async_client: AsyncClient):
    response = await async_client.get("/api/categories")
    assert response.status_code == 200
    data = response.json()
    assert "categories" in data
    # Check if default categories were seeded
    assert len(data["categories"]) > 0

@pytest.mark.asyncio
async def test_create_category(async_client: AsyncClient):
    payload = {
        "name": "Test Category",
        "wm_class_pattern": "test-app",
        "color": "#ff0000"
    }
    response = await async_client.post("/api/categories", json=payload)
    assert response.status_code == 200
    
    # Verify it was added
    resp2 = await async_client.get("/api/categories")
    cats = resp2.json()["categories"]
    assert any(c["name"] == "Test Category" for c in cats)

@pytest.mark.asyncio
async def test_prune_events(async_client: AsyncClient, setup_test_db):
    from atracker import db
    import datetime
    
    old_date = (datetime.datetime.now() - datetime.timedelta(days=100)).replace(microsecond=0).isoformat()
    await db.insert_event(
        timestamp=old_date,
        end_timestamp=old_date,
        wm_class="old_app",
        title="Old Window",
        pid=123,
        duration_secs=60,
        is_idle=False
    )
    
    new_date = (datetime.datetime.now() - datetime.timedelta(days=1)).replace(microsecond=0).isoformat()
    await db.insert_event(
        timestamp=new_date,
        end_timestamp=new_date,
        wm_class="new_app",
        title="New Window",
        pid=124,
        duration_secs=60,
        is_idle=False
    )
    
    async with db._aconn() as conn:
        cursor = await conn.execute("SELECT COUNT(*) FROM events")
        row = await cursor.fetchone()
        assert row[0] == 2
        
    deleted = await db.prune_events(90)
    assert deleted == 1
    
    async with db._aconn() as conn:
        cursor = await conn.execute("SELECT COUNT(*) FROM events")
        row = await cursor.fetchone()
        assert row[0] == 1
        
        cursor = await conn.execute("SELECT wm_class FROM events")
        row = await cursor.fetchone()
        assert row[0] == "new_app"

