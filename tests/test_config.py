import pytest
import yaml
import os
from pathlib import Path
from atracker.config import Config, DEFAULT_CONFIG


def test_config_properties(monkeypatch, tmp_path):
    # Mock CONFIG_PATH to a non-existent file to ensure defaults
    fake_config = tmp_path / "nonexistent.yaml"
    monkeypatch.setattr("atracker.config.CONFIG_PATH", fake_config)

    conf = Config()
    assert conf.dashboard_port == DEFAULT_CONFIG["dashboard"]["port"]
    assert conf.dashboard_host == DEFAULT_CONFIG["dashboard"]["host"]
    assert conf.retention_days == DEFAULT_CONFIG["database"]["retention_days"]
    assert conf.poll_interval == DEFAULT_CONFIG["tracking"]["poll_interval"]
    assert conf.idle_threshold == DEFAULT_CONFIG["tracking"]["idle_threshold"]
    assert conf.log_level == DEFAULT_CONFIG["logging"]["level"]

    # Check db_path (handles home expansion)
    expected_db_path = Path(os.path.expanduser(DEFAULT_CONFIG["database"]["path"]))
    assert conf.db_path == expected_db_path


def test_update_dict():
    conf = Config()
    base = {"a": {"b": 1}, "c": 2}
    update = {"a": {"b": 3, "d": 4}, "e": 5}
    conf._update_dict(base, update)
    assert base == {"a": {"b": 3, "d": 4}, "c": 2, "e": 5}


def test_load_config(tmp_path, monkeypatch):
    config_file = tmp_path / "config.yaml"

    user_config = {
        "dashboard": {"port": 9999},
        "database": {"retention_days": 30},
        "tracking": {"poll_interval": 10},
    }
    with open(config_file, "w") as f:
        yaml.dump(user_config, f)

    monkeypatch.setattr("atracker.config.CONFIG_PATH", config_file)

    conf = Config()
    assert conf.dashboard_port == 9999
    assert conf.retention_days == 30
    assert conf.poll_interval == 10
    assert conf.idle_threshold == 120  # remains default


def test_ensure_config_file(tmp_path, monkeypatch):
    config_dir = tmp_path / "config_dir"
    config_file = config_dir / "config.yaml"

    monkeypatch.setattr("atracker.config.CONFIG_DIR", config_dir)
    monkeypatch.setattr("atracker.config.CONFIG_PATH", config_file)

    # Config() calls load() in __init__
    conf = Config()
    assert not config_file.exists()

    conf.ensure_config_file()
    assert config_file.exists()
    with open(config_file, "r") as f:
        loaded = yaml.safe_load(f)
    assert loaded == DEFAULT_CONFIG


def test_load_invalid_yaml(tmp_path, monkeypatch, capsys):
    config_file = tmp_path / "invalid.yaml"
    with open(config_file, "w") as f:
        f.write("invalid: { : yaml")  # Improperly formatted YAML

    monkeypatch.setattr("atracker.config.CONFIG_PATH", config_file)

    # Should not raise exception, but print error and use defaults
    conf = Config()
    captured = capsys.readouterr()
    assert "Error loading config" in captured.out
    assert conf.dashboard_port == 8932  # stayed default
