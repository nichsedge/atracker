"""Cross-platform single-instance lock for the watcher."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from atracker.config import config

_LOCK_FD: int | None = None


def _lock_path() -> Path:
    return config.db_path.parent / ".watcher.lock"


def acquire_watcher_lock() -> bool:
    """Acquire a non-blocking exclusive lock. Returns False if already held."""
    global _LOCK_FD
    if _LOCK_FD is not None:
        return True

    lock_path = _lock_path()
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    fd = os.open(str(lock_path), os.O_RDWR | os.O_CREAT, 0o600)
    try:
        if sys.platform == "win32":
            import msvcrt

            try:
                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
            except OSError:
                os.close(fd)
                return False
        else:
            import fcntl

            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                os.close(fd)
                return False

        os.ftruncate(fd, 0)
        os.write(fd, f"{os.getpid()}\n".encode())
        os.fsync(fd)
        _LOCK_FD = fd
        return True
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        raise


def release_watcher_lock() -> None:
    """Release the watcher lock if held."""
    global _LOCK_FD
    if _LOCK_FD is None:
        return

    fd = _LOCK_FD
    _LOCK_FD = None

    try:
        if sys.platform == "win32":
            import msvcrt

            try:
                msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
            except OSError:
                pass
        else:
            import fcntl

            try:
                fcntl.flock(fd, fcntl.LOCK_UN)
            except OSError:
                pass
    finally:
        try:
            os.close(fd)
        except OSError:
            pass
