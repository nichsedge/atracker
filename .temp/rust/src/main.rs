//! CLI entry point for atracker (Rust port).

mod api;
mod db;
mod watcher;

use clap::{Parser, Subcommand};
use std::sync::Arc;
use tracing::info;

#[derive(Parser)]
#[command(name = "atracker", version, about = "Local-first activity watcher & tracker")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Start the activity tracker daemon (default)
    Start,
    /// Check if the daemon is running
    Status,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_target(true)
        .with_timer(tracing_subscriber::fmt::time::time())
        .init();

    let cli = Cli::parse();
    let command = cli.command.unwrap_or(Commands::Start);

    match command {
        Commands::Start => {
            info!("Starting atracker daemon...");
            info!("Dashboard will be available at http://localhost:8932");

            let db = Arc::new(db::Db::open()?);

            // Run the actix-web API server on a dedicated OS thread with its own runtime,
            // because actix-web's HttpServer future is !Send and cannot be tokio::spawn'd.
            let api_db = db.clone();
            std::thread::spawn(move || {
                let rt = actix_web::rt::System::new();
                rt.block_on(async move {
                    if let Err(e) = api::run_server(api_db, 8932).await {
                        eprintln!("API server error: {e}");
                    }
                });
            });

            // Run watcher in foreground on the tokio runtime.
            let mut w = watcher::Watcher::new(db);
            w.run().await?;
        }

        Commands::Status => {
            match reqwest::get("http://localhost:8932/api/status").await {
                Ok(resp) => {
                    if let Ok(data) = resp.json::<serde_json::Value>().await {
                        println!("✅ atracker is running");
                        if let Some(path) = data.get("db_path").and_then(|v| v.as_str()) {
                            println!("   Database: {path}");
                        }
                        if let Some(ts) = data.get("timestamp").and_then(|v| v.as_str()) {
                            println!("   Timestamp: {ts}");
                        }
                    } else {
                        println!("✅ atracker is running (could not parse response)");
                    }
                }
                Err(_) => {
                    println!("❌ atracker is not running");
                    std::process::exit(1);
                }
            }
        }
    }

    Ok(())
}
