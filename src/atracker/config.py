import os
import yaml
from pathlib import Path
import logging

DEFAULT_CONFIG = {
    "dashboard": {
        "port": 8932,
        "host": "0.0.0.0",
    },
    "database": {
        "path": str(Path.home() / ".local" / "share" / "atracker" / "atracker.db"),
    },
    "tracking": {
        "poll_interval": 5,
        "idle_threshold": 120,
    },
    "logging": {
        "level": "INFO",
    }
}

CONFIG_DIR = Path(os.environ.get("ATRACKER_CONFIG_DIR", Path.home() / ".config" / "atracker"))
CONFIG_PATH = CONFIG_DIR / "config.yaml"

class Config:
    def __init__(self):
        self._config = DEFAULT_CONFIG.copy()
        self.load()

    def load(self):
        if CONFIG_PATH.exists():
            try:
                with open(CONFIG_PATH, "r") as f:
                    user_config = yaml.safe_load(f)
                    if user_config:
                        self._update_dict(self._config, user_config)
            except Exception as e:
                print(f"Error loading config from {CONFIG_PATH}: {e}")

    def _update_dict(self, base_dict, update_with):
        for key, value in update_with.items():
            if isinstance(value, dict) and key in base_dict and isinstance(base_dict[key], dict):
                self._update_dict(base_dict[key], value)
            else:
                base_dict[key] = value

    @property
    def dashboard_port(self) -> int:
        return self._config["dashboard"]["port"]

    @property
    def dashboard_host(self) -> str:
        return self._config["dashboard"]["host"]

    @property
    def db_path(self) -> Path:
        return Path(os.path.expanduser(self._config["database"]["path"]))

    @property
    def poll_interval(self) -> int:
        return self._config["tracking"]["poll_interval"]

    @property
    def idle_threshold(self) -> int:
        return self._config["tracking"]["idle_threshold"]

    @property
    def log_level(self) -> str:
        return self._config["logging"]["level"]

    def ensure_config_file(self):
        """Create a default config file if it doesn't exist."""
        if not CONFIG_PATH.exists():
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            with open(CONFIG_PATH, "w") as f:
                yaml.dump(DEFAULT_CONFIG, f, default_flow_style=False)
            print(f"Created default config at {CONFIG_PATH}")

config = Config()
