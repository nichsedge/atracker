"""Sync API router for cr-sqlite CRDT-based replication."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from atracker import db

router = APIRouter(prefix="/api/sync", tags=["sync"])


class ChangesPayload(BaseModel):
    """Payload for applying remote changes."""
    changes: list[dict]
    sender_site_id: str = ""


class ChangesResponse(BaseModel):
    """Response containing changeset and metadata."""
    site_id: str
    db_version: int
    changes: list[dict]


@router.get("/site-id")
def get_site_id():
    """Return this device's cr-sqlite site ID."""
    return {"site_id": db.sync_get_site_id()}


@router.get("/version")
def get_version():
    """Return the current cr-sqlite logical clock (db_version)."""
    return {"db_version": db.sync_get_db_version()}


@router.get("/changes", response_model=ChangesResponse)
def get_changes(since: int = 0):
    """Get all changes since a given db_version for delta sync.

    The remote peer sends its last-known version, and we return
    only the changes that occurred after that version.
    """
    changes = db.sync_get_changes(since)
    return ChangesResponse(
        site_id=db.sync_get_site_id(),
        db_version=db.sync_get_db_version(),
        changes=changes,
    )


@router.post("/changes")
def apply_changes(payload: ChangesPayload):
    """Apply remote changes from another device.

    The remote peer sends its changeset, and we merge it into
    the local database using cr-sqlite's CRDT merge semantics.
    """
    if not payload.changes:
        return {
            "status": "no_changes",
            "db_version": db.sync_get_db_version(),
        }

    try:
        new_version = db.sync_apply_changes(payload.changes)
        return {
            "status": "applied",
            "changes_applied": len(payload.changes),
            "db_version": new_version,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {e}")
