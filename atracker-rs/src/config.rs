use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    pub dashboard: DashboardConfig,
    pub database: DatabaseConfig,
    pub tracking: TrackingConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DashboardConfig {
    pub port: u16,
    pub host: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DatabaseConfig {
    pub path: String,
    pub retention_days: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrackingConfig {
    pub poll_interval: u64,
    pub idle_threshold: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            dashboard: DashboardConfig {
                port: 8933,
                host: "0.0.0.0".to_string(),
            },
            database: DatabaseConfig {
                path: "~/.local/share/atracker-rs/atracker-rs.db".to_string(),
                retention_days: 90,
            },
            tracking: TrackingConfig {
                poll_interval: 5,
                idle_threshold: 120,
            },
        }
    }
}

pub fn get_config_path() -> PathBuf {
    let home = dirs::home_dir().expect("Could not find home directory");
    home.join(".config").join("atracker-rs").join("config-rs.yaml")
}

pub fn load_config() -> Config {
    let path = get_config_path();
    if !path.exists() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).ok();
        }
        let config = Config::default();
        let yaml = serde_yaml::to_string(&config).expect("Failed to serialize default config");
        fs::write(&path, yaml).expect("Failed to write default config");
        return config;
    }

    let yaml = fs::read_to_string(path).expect("Failed to read config");
    serde_yaml::from_str(&yaml).unwrap_or_else(|_| Config::default())
}

pub fn resolve_path(path: &str) -> PathBuf {
    if path.starts_with("~/") {
        let home = dirs::home_dir().expect("Could not find home directory");
        home.join(&path[2..])
    } else if let Some(rest) = path.strip_prefix("%USERPROFILE%") {
        let home = dirs::home_dir().expect("Could not find home directory");
        home.join(rest.trim_start_matches(['\\', '/']))
    } else {
        PathBuf::from(path)
    }
}
