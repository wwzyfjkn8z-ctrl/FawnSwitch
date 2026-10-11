//! Deliberately small desktop entry point. Upstream services are reused only on
//! explicit user actions; upstream startup, migrations and background jobs do not run.
use crate::{AppState, AppType, Database, Provider, ProviderService};
use chrono::{Datelike, Local, TimeZone};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{io::Read, path::Path, sync::Arc};
use tauri::Manager;

const MAX_IMPORT_BYTES: u64 = 1024 * 1024;
fn failure() -> String {
    "操作失败，请检查文件权限或配置格式；敏感内容不会显示。".into()
}
fn app_type(app: &str) -> Result<AppType, String> {
    match app {
        "claude" => Ok(AppType::Claude),
        "codex" => Ok(AppType::Codex),
        _ => Err("仅支持 Claude Code 和 Codex。".into()),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    app: String,
    name: String,
    endpoint: String,
    model: String,
    api_key: String,
}

fn make_provider(id: String, input: ProfileInput) -> Result<(AppType, Provider), String> {
    let app = app_type(&input.app)?;
    let name = input.name.trim();
    let model = input.model.trim();
    if name.is_empty() || name.len() > 100 || name.chars().any(char::is_control) {
        return Err("名称须为 1–100 字节且不能包含控制字符。".into());
    }
    if model.is_empty()
        || model.len() > 200
        || !model
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.:/+".contains(&b))
    {
        return Err("请输入有效模型名称（字母、数字及 - _ . : / +）。".into());
    }
    if input.api_key.is_empty()
        || input.api_key.len() > 4096
        || !input.api_key.bytes().all(|b| b.is_ascii_graphic())
    {
        return Err("API Key 不能为空，也不能包含空格或控制字符。".into());
    }
    let endpoint = url::Url::parse(input.endpoint.trim())
        .map_err(|_| "请输入有效的 HTTPS 接口地址。".to_string())?;
    if !matches!(endpoint.scheme(), "https")
        || !endpoint.has_host()
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
        || endpoint.as_str().len() > 2048
    {
        return Err("接口地址须为 HTTPS，且不能包含账号、密码、查询参数或片段。".into());
    }
    // Credentials are never duplicated into public card fields.
    if name.contains(&input.api_key)
        || model.contains(&input.api_key)
        || endpoint.as_str().contains(&input.api_key)
    {
        return Err("名称、模型与接口地址不能包含 API Key。".into());
    }
    let endpoint = endpoint.as_str().trim_end_matches('/');
    let settings = if app == AppType::Claude {
        json!({"env": {"ANTHROPIC_BASE_URL": endpoint, "ANTHROPIC_AUTH_TOKEN": input.api_key, "ANTHROPIC_MODEL": model, "ANTHROPIC_DEFAULT_HAIKU_MODEL": model, "ANTHROPIC_DEFAULT_SONNET_MODEL": model, "ANTHROPIC_DEFAULT_OPUS_MODEL": model}})
    } else {
        let mut config = toml_edit::DocumentMut::new();
        config["model"] = toml_edit::value(model);
        config["model_provider"] = toml_edit::value("fawn");
        config["model_providers"]["fawn"]["name"] = toml_edit::value("Fawn Switch");
        config["model_providers"]["fawn"]["base_url"] = toml_edit::value(endpoint);
        config["model_providers"]["fawn"]["wire_api"] = toml_edit::value("responses");
        config["model_providers"]["fawn"]["requires_openai_auth"] = toml_edit::value(false);
        config["model_providers"]["fawn"]["experimental_bearer_token"] =
            toml_edit::value(&input.api_key);
        json!({"auth": {}, "config": config.to_string()})
    };
    let mut row = Provider::with_id(id, name.into(), settings, None);
    row.created_at = Some(chrono::Utc::now().timestamp_millis());
    Ok((app, row))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    id: String,
    name: String,
    app: String,
    model: Option<String>,
    endpoint: Option<String>,
    official: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileList {
    profiles: Vec<ProfileSummary>,
    current_id: Option<String>,
}

fn summarize(app: &str, row: Provider) -> ProfileSummary {
    let (model, endpoint) = if app == "claude" {
        (
            row.settings_config
                .pointer("/env/ANTHROPIC_MODEL")
                .and_then(|v| v.as_str())
                .map(str::to_owned),
            row.settings_config
                .pointer("/env/ANTHROPIC_BASE_URL")
                .and_then(|v| v.as_str())
                .map(str::to_owned),
        )
    } else {
        let config = row.settings_config["config"]
            .as_str()
            .unwrap_or("")
            .parse::<toml_edit::DocumentMut>()
            .ok();
        let model = config
            .as_ref()
            .and_then(|c| c.get("model"))
            .and_then(|v| v.as_str())
            .map(str::to_owned);
        let endpoint = config.as_ref().and_then(|c| {
            let key = c.get("model_provider")?.as_str()?;
            c.get("model_providers")?
                .get(key)?
                .get("base_url")?
                .as_str()
                .map(str::to_owned)
        });
        (model, endpoint)
    };
    ProfileSummary {
        id: row.id,
        name: row.name,
        app: app.into(),
        model,
        endpoint,
        official: row.category.as_deref() == Some("official"),
    }
}

#[tauri::command]
pub async fn fawn_list(
    state: tauri::State<'_, AppState>,
    app: String,
) -> Result<ProfileList, String> {
    let kind = app_type(&app)?;
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let profiles = db
            .get_all_providers(&app)
            .map_err(|_| failure())?
            .into_values()
            .map(|p| summarize(&app, p))
            .collect();
        let current_id =
            crate::mode::current::provider_for(&db, &kind, crate::mode::current::Purpose::Direct)
                .map_err(|_| failure())?;
        Ok(ProfileList {
            profiles,
            current_id,
        })
    })
    .await
    .map_err(|_| failure())?
}

#[tauri::command]
pub async fn fawn_save(
    state: tauri::State<'_, AppState>,
    input: ProfileInput,
) -> Result<String, String> {
    let id = format!("native-{}", uuid::Uuid::new_v4());
    let (app, provider) = make_provider(id.clone(), input)?;
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.save_provider(app.as_str(), &provider)
            .map_err(|_| failure())
    })
    .await
    .map_err(|_| failure())??;
    Ok(id)
}

#[derive(Serialize)]
pub struct SwitchResponse {
    warnings: Vec<String>,
}
#[tauri::command]
pub async fn fawn_switch(
    state: tauri::State<'_, AppState>,
    app: String,
    id: String,
) -> Result<SwitchResponse, String> {
    let kind = app_type(&app)?;
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        ProviderService::switch(&state, kind, &id)
            .map(|result| SwitchResponse {
                warnings: if result.warnings.is_empty() {
                    vec![]
                } else {
                    vec!["配置已切换，但部分后续操作未完成，请检查客户端登录状态。".into()]
                },
            })
            .map_err(|_| {
                "切换失败，配置可能需要恢复；请检查客户端配置格式和文件权限后重试。".into()
            })
    })
    .await
    .map_err(|_| failure())?
}

#[derive(Deserialize)]
struct CliDocument {
    version: u32,
    profiles: Vec<CliProfile>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CliProfile {
    id: String,
    target: String,
    name: String,
    endpoint: String,
    model: String,
    api_key: String,
}
#[derive(Default, Serialize)]
pub struct ImportResult {
    imported: usize,
    skipped: usize,
}

// Open each untrusted component relative to an already opened directory, never
// following directory or file symlinks (including a concurrent replacement).
#[cfg(unix)]
fn open_import_from(home: &Path, folder: &str) -> std::io::Result<std::fs::File> {
    use std::os::fd::{AsRawFd, FromRawFd};
    let folder = std::ffi::CString::new(folder).map_err(|_| std::io::Error::other("invalid directory"))?;
    let home = std::fs::File::open(home)?;
    let directory = unsafe {
        libc::openat(
            home.as_raw_fd(),
            folder.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        )
    };
    if directory < 0 {
        return Err(std::io::Error::last_os_error());
    }
    let directory = unsafe { std::fs::File::from_raw_fd(directory) };
    let file = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            c"profiles.json".as_ptr(),
            libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK,
        )
    };
    if file < 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(unsafe { std::fs::File::from_raw_fd(file) })
}
#[cfg(windows)]
fn open_import_from(home: &Path, folder: &str) -> std::io::Result<std::fs::File> {
    use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
    const OPEN_REPARSE_POINT: u32 = 0x00200000;
    const BACKUP_SEMANTICS: u32 = 0x02000000;
    const REPARSE_POINT: u32 = 0x400;
    // Do not share DELETE: the validated directory cannot be replaced while
    // its child is opened. OPEN_REPARSE_POINT opens the link itself, never its target.
    let directory = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(3)
        .custom_flags(OPEN_REPARSE_POINT | BACKUP_SEMANTICS)
        .open(home.join(folder))?;
    let metadata = directory.metadata()?;
    if !metadata.is_dir() || metadata.file_attributes() & REPARSE_POINT != 0 {
        return Err(std::io::Error::other("reparse point"));
    }
    let file = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(3)
        .custom_flags(OPEN_REPARSE_POINT)
        .open(home.join(folder).join("profiles.json"))?;
    if file.metadata()?.file_attributes() & REPARSE_POINT != 0 {
        return Err(std::io::Error::other("reparse point"));
    }
    Ok(file)
}

// Canonical delivery data lives beside the desktop database. Read the old
// delivery directory only for compatibility; never create or rewrite it.
fn open_import(home: &Path) -> std::io::Result<std::fs::File> {
    match open_import_from(home, ".fawn-switch") {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            open_import_from(home, ".fawn-models")
        }
        result => result,
    }
}

#[cfg(test)]
#[test]
fn delivery_import_prefers_unified_directory_and_preserves_legacy_compatibility() {
    let home = tempfile::tempdir().unwrap();
    std::fs::create_dir(home.path().join(".fawn-models")).unwrap();
    std::fs::write(home.path().join(".fawn-models/profiles.json"), "legacy").unwrap();
    let mut contents = String::new();
    open_import(home.path()).unwrap().read_to_string(&mut contents).unwrap();
    assert_eq!(contents, "legacy");
    std::fs::create_dir(home.path().join(".fawn-switch")).unwrap();
    std::fs::write(home.path().join(".fawn-switch/profiles.json"), "unified").unwrap();
    contents.clear();
    open_import(home.path()).unwrap().read_to_string(&mut contents).unwrap();
    assert_eq!(contents, "unified");
}

fn import_cli(db: &Database, home: &Path) -> Result<ImportResult, String> {
    let file = match open_import(home) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ImportResult::default())
        }
        Err(_) => return Err("无法导入：配置文件不可读，或路径包含符号链接。".into()),
    };
    let metadata = file.metadata().map_err(|_| failure())?;
    if !metadata.is_file() || metadata.len() > MAX_IMPORT_BYTES {
        return Err("导入文件必须是小于 1 MiB 的普通文件。".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_IMPORT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| failure())?;
    if bytes.len() as u64 > MAX_IMPORT_BYTES {
        return Err("导入文件超过 1 MiB。".into());
    }
    let document: CliDocument =
        serde_json::from_slice(&bytes).map_err(|_| "CLI 配置格式无效，未导入。".to_string())?;
    if document.version != 1 || document.profiles.len() > 1000 {
        return Err("不支持此 CLI 配置版本或配置数量超过 1000。".into());
    }
    let mut validated = Vec::new();
    let mut ids = std::collections::HashSet::new();
    for row in document.profiles {
        let uuid =
            uuid::Uuid::parse_str(&row.id).map_err(|_| "CLI 配置 ID 无效，未导入。".to_string())?;
        let id = format!("cli-{}-{uuid}", row.target);
        if !ids.insert(id.clone()) {
            return Err("CLI 配置包含重复 ID，未导入。".into());
        }
        validated.push(make_provider(
            id,
            ProfileInput {
                app: row.target,
                name: row.name,
                endpoint: row.endpoint,
                model: row.model,
                api_key: row.api_key,
            },
        )?);
    }
    // All-or-nothing even when a later insert fails; preserve existing edits.
    let mut conn = db.conn.lock().map_err(|_| failure())?;
    let transaction = conn.transaction().map_err(|_| failure())?;
    let mut result = ImportResult::default();
    for (app, provider) in validated {
        let inserted = transaction.execute(
            "INSERT INTO providers (id, app_type, name, settings_config, created_at, meta, is_current, in_failover_queue) VALUES (?1, ?2, ?3, ?4, ?5, '{}', 0, 0) ON CONFLICT(id, app_type) DO NOTHING",
            rusqlite::params![provider.id, app.as_str(), provider.name, serde_json::to_string(&provider.settings_config).map_err(|_| failure())?, provider.created_at],
        ).map_err(|_| failure())?;
        if inserted == 0 {
            result.skipped += 1;
        } else {
            result.imported += 1;
        }
    }
    transaction.commit().map_err(|_| failure())?;
    Ok(result)
}
#[tauri::command]
pub async fn fawn_import(state: tauri::State<'_, AppState>) -> Result<ImportResult, String> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || import_cli(&db, &crate::config::get_home_dir()))
        .await
        .map_err(|_| failure())?
}


/// Merge CC Switch configuration without activating it or touching source files.
fn import_cc_switch(db: &Database, home: &Path) -> Result<ImportResult, String> {
    let directory = home.join(".cc-switch");
    let path = directory.join("cc-switch.db");
    for item in [&directory, &path] {
        let metadata = std::fs::symlink_metadata(item).map_err(|_| "未找到本机 CC Switch 数据库。".to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("CC Switch 导入来源不能是符号链接。".into());
        }
    }
    let source = rusqlite::Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| "无法读取 CC Switch 数据库，请先退出 CC Switch 后重试。".to_string())?;
    source.execute_batch("BEGIN").map_err(|_| "无法创建导入快照。".to_string())?;
    let exists: bool = source.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='providers')", [], |row| row.get(0)).map_err(|_| "CC Switch 数据库格式无效。".to_string())?;
    if !exists { return Err("CC Switch 数据库格式无效。".into()); }
    db.backup_database_file().map_err(|_| "创建 Fawn Switch 备份失败，未导入。".to_string())?;
    let mut conn = db.conn.lock().map_err(|_| failure())?;
    let tx = conn.transaction().map_err(|_| failure())?;
    let mut result = ImportResult::default();
    for table in ["providers", "mcp_servers", "prompts", "skill_repos"] {
        let present: bool = source.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)", [table], |row| row.get(0)).map_err(|_| failure())?;
        if !present { continue; }
        let columns = |connection: &rusqlite::Connection| -> Result<Vec<String>, String> {
            let mut stmt = connection.prepare(&format!("PRAGMA table_info({table})")).map_err(|_| failure())?;
            let collected = stmt.query_map([], |row| row.get(1)).map_err(|_| failure())?.collect::<Result<Vec<String>, _>>().map_err(|_| failure())?;
            Ok(collected)
        };
        let source_columns = columns(&source)?;
        let target_columns = columns(&tx)?;
        let shared: Vec<String> = target_columns.into_iter().filter(|name| source_columns.contains(name)).collect();
        if shared.is_empty() { return Err("CC Switch 数据库版本不兼容，未导入。".into()); }
        // Identifiers originate from our own schema; quote defensively.
        let names = shared.iter().map(|name| format!("\"{}\"", name.replace('"', "\"\""))).collect::<Vec<_>>().join(",");
        let placeholders = (1..=shared.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(",");
        let mut stmt = source.prepare(&format!("SELECT {names} FROM {table}")).map_err(|_| failure())?;
        let mut rows = stmt.query([]).map_err(|_| failure())?;
        while let Some(row) = rows.next().map_err(|_| failure())? {
            let mut values = Vec::new();
            for (index, column) in shared.iter().enumerate() {
                values.push(if column == "is_current" || column == "in_failover_queue" || column == "enabled" || column.starts_with("enabled_") {
                    rusqlite::types::Value::Integer(0)
                } else { row.get::<_, rusqlite::types::Value>(index).map_err(|_| failure())? });
            }
            let changed = tx.execute(&format!("INSERT INTO {table} ({names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"), rusqlite::params_from_iter(values)).map_err(|_| "CC Switch 数据不兼容，已回滚全部导入。".to_string())?;
            if changed == 0 { result.skipped += 1; } else { result.imported += 1; }
        }
    }
    tx.commit().map_err(|_| failure())?;
    Ok(result)
}

#[tauri::command]
pub async fn fawn_import_cc_switch(state: tauri::State<'_, AppState>) -> Result<ImportResult, String> {
    let db = state.db.clone();
    let _guard = crate::services::sync_protocol::sync_mutex().lock().await;
    tauri::async_runtime::spawn_blocking(move || import_cc_switch(&db, &crate::config::get_home_dir()))
        .await.map_err(|_| failure())?
}

#[tauri::command]
pub fn fawn_open_dsh_config() -> Result<String, String> {
    let directory = std::env::var_os("DSH_HOME").map(std::path::PathBuf::from)
        .unwrap_or_else(|| crate::config::get_home_dir().join(".dsh"));
    if !directory.is_dir() { return Err("未找到 DeepSeek Harness 配置目录。".into()); }
    tauri_plugin_opener::reveal_item_in_dir(&directory).map_err(|_| "无法打开配置目录。".to_string())?;
    Ok(directory.to_string_lossy().into_owned())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageResponse {
    summary: crate::services::usage_stats::UsageSummary,
    models: Vec<crate::services::usage_stats::ModelStats>,
    synced_at: Option<i64>,
    warning: Option<String>,
}
#[tauri::command]
pub async fn fawn_usage(
    state: tauri::State<'_, AppState>,
    app: String,
    period: String,
) -> Result<UsageResponse, String> {
    let kind = app_type(&app)?;
    let date = Local::now().date_naive();
    let start = match period.as_str() {
        "today" => date,
        "month" => date.with_day(1).ok_or_else(failure)?,
        _ => return Err("仅支持今日或本月。".into()),
    };
    let start = Local
        .from_local_datetime(&start.and_hms_opt(0, 0, 0).ok_or_else(failure)?)
        .earliest()
        .ok_or_else(failure)?
        .timestamp();
    let db = state.db.clone();
    let _guard = crate::services::session_usage::session_sync_mutex()
        .lock()
        .await;
    tauri::async_runtime::spawn_blocking(move || {
        let sync = match kind {
            AppType::Claude => crate::services::session_usage::sync_claude_session_logs(&db),
            _ => crate::services::session_usage_codex::sync_codex_usage(&db),
        };
        let complete = sync
            .as_ref()
            .is_ok_and(|s| s.errors.is_empty() && s.deferred_files == 0);
        let summary = db
            .get_usage_summary(Some(start), None, Some(&app), None, None)
            .map_err(|_| failure())?;
        let models = db
            .get_model_stats(Some(start), None, Some(&app), None, None)
            .map_err(|_| failure())?;
        Ok(UsageResponse {
            summary,
            models,
            synced_at: complete.then(|| chrono::Utc::now().timestamp_millis()),
            warning: (!complete).then(|| "部分本地日志无法读取，当前统计可能不完整。".into()),
        })
    })
    .await
    .map_err(|_| failure())?
}
#[tauri::command]
pub fn fawn_exit(app: tauri::AppHandle) {
    app.exit(0);
}

fn seed(db: &Database) -> Result<(), crate::AppError> {
    db.ensure_official_seed_by_id("claude-official", AppType::Claude)?;
    db.ensure_official_seed_by_id("codex-official", AppType::Codex)?;
    Ok(())
}

pub(crate) fn prepare_storage() -> Result<(), String> {
    let directory = crate::config::get_app_config_dir();
    std::fs::create_dir_all(&directory).map_err(|_| failure())?;
    if std::fs::symlink_metadata(&directory)
        .map_err(|_| failure())?
        .file_type()
        .is_symlink()
    {
        return Err(failure());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| failure())?;
        let file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW)
            .open(directory.join("cc-switch.db"))
            .map_err(|_| failure())?;
        file.set_permissions(std::fs::Permissions::from_mode(0o600))
            .map_err(|_| failure())?;
    }
    Ok(())
}

fn initialize() -> Result<AppState, String> {
    prepare_storage()?;
    let db = Arc::new(Database::init().map_err(|_| failure())?);
    seed(&db).map_err(|_| failure())?;
    Ok(AppState::new(db))
}

pub(crate) fn context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            fawn_list,
            fawn_save,
            fawn_switch,
            fawn_import,
            fawn_usage,
            fawn_exit
        ])
        .setup(|app| {
            let state =
                initialize().map_err(|_| std::io::Error::other("Fawn Switch 数据库初始化失败"))?;
            app.manage(state);
            let show = tauri::menu::MenuItem::with_id(
                app,
                "show",
                "打开 Fawn Switch",
                true,
                None::<&str>,
            )?;
            let quit = tauri::menu::MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;
            let mut tray = tauri::tray::TrayIconBuilder::with_id("fawn-tray")
                .tooltip("Fawn Switch")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(context())
        .expect("Fawn Switch 无法启动");
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input(app: &str) -> ProfileInput {
        ProfileInput {
            app: app.into(),
            name: "Example".into(),
            endpoint: "https://example.invalid/v1".into(),
            model: "test-model".into(),
            api_key: "test-key-123".into(),
        }
    }
    #[test]
    fn safe_codex_toml_and_summary() {
        let (_, row) = make_provider("test".into(), input("codex")).unwrap();
        let config = row.settings_config["config"]
            .as_str()
            .unwrap()
            .parse::<toml_edit::DocumentMut>()
            .unwrap();
        assert_eq!(
            config["model_providers"]["fawn"]["requires_openai_auth"].as_bool(),
            Some(false)
        );
        assert_eq!(
            config["model_providers"]["fawn"]["experimental_bearer_token"].as_str(),
            Some("test-key-123")
        );
        let public = serde_json::to_string(&summarize("codex", row)).unwrap();
        assert!(!public.contains("test-key-123"));
        assert!(public.contains("test-model"));
    }
    #[test]
    fn validation_rejects_injection() {
        let mut bad = input("codex");
        bad.model = "model\"\nx=1".into();
        assert!(make_provider("x".into(), bad).is_err());
        let mut bad = input("claude");
        bad.endpoint = "https://user:secret@example.invalid".into();
        assert!(make_provider("x".into(), bad).is_err());
        let mut bad = input("claude");
        bad.api_key = "token\nsecret".into();
        assert!(make_provider("x".into(), bad).is_err());
    }
    fn write_cli(home: &Path, profiles: serde_json::Value) {
        std::fs::create_dir_all(home.join(".fawn-models")).unwrap();
        std::fs::write(
            home.join(".fawn-models/profiles.json"),
            serde_json::to_vec(&json!({"version":1,"profiles":profiles})).unwrap(),
        )
        .unwrap();
    }
    fn cli_row() -> serde_json::Value {
        json!({"id":"7c02d8c9-5a50-4adc-8adb-68bbac608acc", "target":"codex", "name":"CLI", "endpoint":"https://example.invalid/v1", "model":"test-model", "apiKey":"test-key-123"})
    }
    #[test]
    fn fawn_027_cc_switch_import_merges_without_activation_and_preserves_source() {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir(home.path().join(".cc-switch")).unwrap();
        let source = rusqlite::Connection::open(home.path().join(".cc-switch/cc-switch.db")).unwrap();
        source.execute_batch("CREATE TABLE providers(id TEXT, app_type TEXT, name TEXT, settings_config TEXT, is_current INTEGER); INSERT INTO providers VALUES('cc-test','claude','Imported','{}',1);").unwrap();
        let db = Database::memory().unwrap();
        assert_eq!(import_cc_switch(&db, home.path()).unwrap().imported, 1);
        assert_eq!(db.get_current_provider("claude").unwrap(), None);
        let mut provider = db.get_provider_by_id("cc-test", "claude").unwrap().unwrap();
        provider.name = "Desktop edit".into();
        db.save_provider("claude", &provider).unwrap();
        assert_eq!(import_cc_switch(&db, home.path()).unwrap().skipped, 1);
        assert_eq!(db.get_provider_by_id("cc-test", "claude").unwrap().unwrap().name, "Desktop edit");
        assert_eq!(source.query_row("SELECT is_current FROM providers", [], |r| r.get::<_,i64>(0)).unwrap(), 1);
        assert!(!home.path().join(".claude").exists());
    }
    #[test]
    fn fawn_027_cc_switch_import_rolls_back_if_a_later_table_is_invalid() {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir(home.path().join(".cc-switch")).unwrap();
        let source = rusqlite::Connection::open(home.path().join(".cc-switch/cc-switch.db")).unwrap();
        source.execute_batch("CREATE TABLE providers(id TEXT, app_type TEXT, name TEXT, settings_config TEXT); INSERT INTO providers VALUES('cc-test','claude','Imported','{}'); CREATE TABLE prompts(id TEXT, app_type TEXT, name TEXT); INSERT INTO prompts VALUES('invalid','claude','Missing content');").unwrap();
        let db = Database::memory().unwrap();
        assert!(import_cc_switch(&db, home.path()).is_err());
        assert!(db.get_all_providers("claude").unwrap().is_empty());
    }
    #[test]
    fn passive_idempotent_import_preserves_changes_and_current() {
        let home = tempfile::tempdir().unwrap();
        let db = Database::memory().unwrap();
        seed(&db).unwrap();
        write_cli(home.path(), json!([cli_row()]));
        assert_eq!(import_cli(&db, home.path()).unwrap().imported, 1);
        let id = "cli-codex-7c02d8c9-5a50-4adc-8adb-68bbac608acc";
        let mut row = db.get_provider_by_id(id, "codex").unwrap().unwrap();
        row.name = "Edited".into();
        db.save_provider("codex", &row).unwrap();
        assert_eq!(import_cli(&db, home.path()).unwrap().skipped, 1);
        assert_eq!(
            db.get_provider_by_id(id, "codex").unwrap().unwrap().name,
            "Edited"
        );
        assert_eq!(db.get_current_provider("codex").unwrap(), None);
        assert!(!home.path().join(".codex").exists());
        assert_eq!(db.get_all_providers("gemini").unwrap().len(), 0);
    }
    #[test]
    fn prevalidation_does_not_partially_import() {
        let home = tempfile::tempdir().unwrap();
        let db = Database::memory().unwrap();
        let mut invalid = cli_row();
        invalid["id"] = json!("invalid");
        write_cli(home.path(), json!([cli_row(), invalid]));
        assert!(import_cli(&db, home.path()).is_err());
        assert!(db.get_all_providers("codex").unwrap().is_empty());
    }
    #[cfg(unix)]
    #[test]
    fn import_rejects_symlink_directory_and_file() {
        let home = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let db = Database::memory().unwrap();
        write_cli(other.path(), json!([cli_row()]));
        std::os::unix::fs::symlink(
            other.path().join(".fawn-models"),
            home.path().join(".fawn-models"),
        )
        .unwrap();
        assert!(import_cli(&db, home.path()).is_err());
        std::fs::remove_file(home.path().join(".fawn-models")).unwrap();
        std::fs::create_dir(home.path().join(".fawn-models")).unwrap();
        std::os::unix::fs::symlink(
            other.path().join(".fawn-models/profiles.json"),
            home.path().join(".fawn-models/profiles.json"),
        )
        .unwrap();
        assert!(import_cli(&db, home.path()).is_err());
    }
    #[test]
    fn duplicate_and_oversize_imports_are_rejected() {
        let home = tempfile::tempdir().unwrap();
        let db = Database::memory().unwrap();
        write_cli(home.path(), json!([cli_row(), cli_row()]));
        assert!(import_cli(&db, home.path()).is_err());
        let file = std::fs::File::create(home.path().join(".fawn-models/profiles.json")).unwrap();
        file.set_len(MAX_IMPORT_BYTES + 1).unwrap();
        assert!(import_cli(&db, home.path()).is_err());
        assert!(db.get_all_providers("codex").unwrap().is_empty());
    }

    #[test]
    fn import_database_failure_rolls_back_every_row() {
        let home = tempfile::tempdir().unwrap();
        let db = Database::memory().unwrap();
        db.conn.lock().unwrap().execute_batch("CREATE TRIGGER reject_second BEFORE INSERT ON providers WHEN NEW.name = 'Reject' BEGIN SELECT RAISE(ABORT, 'fixture'); END;").unwrap();
        let mut second = cli_row();
        second["id"] = json!("ae058dd1-f6d9-4e31-8177-38550d959f9d");
        second["name"] = json!("Reject");
        write_cli(home.path(), json!([cli_row(), second]));
        assert!(import_cli(&db, home.path()).is_err());
        assert!(db.get_all_providers("codex").unwrap().is_empty());
    }

    #[test]
    #[serial_test::serial]
    fn isolated_startup_and_native_official_roundtrips() {
        struct RestoreEnv(Option<std::ffi::OsString>);
        impl Drop for RestoreEnv {
            fn drop(&mut self) {
                match &self.0 {
                    Some(value) => std::env::set_var("CC_SWITCH_TEST_HOME", value),
                    None => std::env::remove_var("CC_SWITCH_TEST_HOME"),
                }
            }
        }
        let _restore = RestoreEnv(std::env::var_os("CC_SWITCH_TEST_HOME"));
        let home = tempfile::tempdir().unwrap();
        std::env::set_var("CC_SWITCH_TEST_HOME", home.path());
        crate::settings::reload_settings().unwrap();
        std::fs::create_dir(home.path().join(".claude")).unwrap();
        std::fs::create_dir(home.path().join(".codex")).unwrap();
        let claude_path = home.path().join(".claude/settings.json");
        let codex_path = home.path().join(".codex/config.toml");
        let auth_path = home.path().join(".codex/auth.json");
        let old_claude = json!({"model":"old-cli-model", "permissions":{"allow":["Read"]}, "env":{"ANTHROPIC_AUTH_TOKEN":"old-cli-key", "ANTHROPIC_BASE_URL":"https://old.invalid", "ANTHROPIC_MODEL":"old-cli-model", "ANTHROPIC_DEFAULT_HAIKU_MODEL":"old-cli-model", "ANTHROPIC_DEFAULT_SONNET_MODEL":"old-cli-model", "ANTHROPIC_DEFAULT_OPUS_MODEL":"old-cli-model", "KEEP":"untouched"}});
        let old_codex = "model = \"old-cli-model\"\nmodel_provider = \"cli\"\n\n[projects.\"/fixture\"]\ntrust_level = \"trusted\"\n\n[model_providers.cli]\nname = \"CLI\"\nbase_url = \"https://old.invalid/v1\"\nwire_api = \"responses\"\nrequires_openai_auth = false\nexperimental_bearer_token = \"old-cli-key\"\n";
        std::fs::write(&claude_path, serde_json::to_vec(&old_claude).unwrap()).unwrap();
        std::fs::write(&codex_path, old_codex).unwrap();
        let auth = br#"{"tokens":{"access_token":"fixture-access", "refresh_token":"fixture-refresh", "id_token":"fixture-id"},"auth_mode":"chatgpt"}"#;
        std::fs::write(&auth_path, auth).unwrap();
        let claude_before = std::fs::read(&claude_path).unwrap();
        let state = initialize().unwrap();
        assert_eq!(
            crate::config::get_app_config_dir(),
            home.path().join(".fawn-switch")
        );
        assert_eq!(std::fs::read(&claude_path).unwrap(), claude_before);
        assert_eq!(std::fs::read_to_string(&codex_path).unwrap(), old_codex);
        assert_eq!(std::fs::read(&auth_path).unwrap(), auth);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(home.path().join(".fawn-switch"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o700
            );
            assert_eq!(
                std::fs::metadata(home.path().join(".fawn-switch/cc-switch.db"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        assert!(!home.path().join(".cc-switch").exists());
        // Restore official directly from config written by the earlier CLI.
        ProviderService::switch(&state, AppType::Claude, "claude-official").unwrap();
        ProviderService::switch(&state, AppType::Codex, "codex-official").unwrap();
        assert_eq!(std::fs::read(&auth_path).unwrap(), auth);
        let official: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&claude_path).unwrap()).unwrap();
        assert!(official.get("model").is_none());
        assert!(official["env"].get("ANTHROPIC_AUTH_TOKEN").is_none());
        assert_eq!(official["env"]["KEEP"], "untouched");
        let backup_dir = crate::live::engine::DeviceStore::for_device().first_write_backup_dir();
        let backups: Vec<Vec<u8>> = std::fs::read_dir(backup_dir)
            .unwrap()
            .filter_map(|entry| std::fs::read(entry.ok()?.path()).ok())
            .collect();
        assert!(backups.contains(&claude_before));
        assert!(backups.contains(&old_codex.as_bytes().to_vec()));
        let official_codex = std::fs::read_to_string(&codex_path)
            .unwrap()
            .parse::<toml_edit::DocumentMut>()
            .unwrap();
        assert_ne!(
            official_codex
                .get("model_provider")
                .and_then(|value| value.as_str()),
            Some("cli")
        );
        // Start again from CLI routing, choose native configuration, then restore.
        std::fs::write(&claude_path, serde_json::to_vec(&old_claude).unwrap()).unwrap();
        for app in ["claude", "codex"] {
            let (kind, row) = make_provider(format!("test-{app}"), input(app)).unwrap();
            state.db.save_provider(app, &row).unwrap();
            ProviderService::switch(&state, kind, &row.id).unwrap();
        }
        assert_eq!(std::fs::read(&auth_path).unwrap(), auth);
        // Upstream keeps login UI/token refresh alive when a separate bearer is set.
        let codex_switched = std::fs::read_to_string(&codex_path)
            .unwrap()
            .parse::<toml_edit::DocumentMut>()
            .unwrap();
        let route = codex_switched["model_provider"].as_str().unwrap();
        assert_eq!(
            codex_switched["model_providers"][route]["requires_openai_auth"].as_bool(),
            Some(true)
        );
        assert_eq!(
            codex_switched["model_providers"][route]["experimental_bearer_token"].as_str(),
            Some("test-key-123")
        );
        let switched: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&claude_path).unwrap()).unwrap();
        assert!(switched.get("model").is_none());
        for field in [
            "ANTHROPIC_MODEL",
            "ANTHROPIC_DEFAULT_HAIKU_MODEL",
            "ANTHROPIC_DEFAULT_SONNET_MODEL",
            "ANTHROPIC_DEFAULT_OPUS_MODEL",
        ] {
            assert_eq!(switched["env"][field], "test-model");
        }
        assert_eq!(switched["permissions"], old_claude["permissions"]);
        ProviderService::switch(&state, AppType::Claude, "claude-official").unwrap();
        ProviderService::switch(&state, AppType::Codex, "codex-official").unwrap();
        let restored = std::fs::read_to_string(&claude_path).unwrap();
        assert!(!restored.contains("test-key-123"));
        assert!(!restored.contains("test-model"));
        let restored = std::fs::read_to_string(&codex_path)
            .unwrap()
            .parse::<toml_edit::DocumentMut>()
            .unwrap();
        assert_eq!(
            restored["projects"]["/fixture"]["trust_level"].as_str(),
            Some("trusted")
        );
        assert_eq!(std::fs::read(&auth_path).unwrap(), auth);
        assert!(!home.path().join(".cc-switch").exists());
    }
}
