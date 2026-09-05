//! Loopback redirect handling for OAuth sign-ins.
//!
//! Providers that let a desktop app sign a user in do it the standard way: the
//! app opens the provider's page in the *system browser*, and the browser is
//! redirected back to a short-lived HTTP server on `127.0.0.1` carrying the
//! authorization code. Doing it in the system browser (rather than an embedded
//! webview) is what keeps the user's password and session out of the app, and
//! is what every provider's desktop guidance asks for.
//!
//! The web layer drives the flow (`src/services/ai/oauth.ts`); this module only
//! owns the socket:
//!
//! 1. `oauth_start` binds an ephemeral loopback port and returns it, so the
//!    redirect URI can be built before the browser is opened.
//! 2. `oauth_wait` accepts one request on that port, hands back its query
//!    parameters, and shows the user a "you can close this tab" page.
//! 3. `oauth_cancel` drops the listener if the flow is abandoned.
//!
//! The listener binds loopback only, lives for one exchange, and is paired with
//! PKCE on the web side — an intercepted code is useless without the verifier
//! that never left this process.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;

/// Listeners bound by `oauth_start` and not yet consumed, keyed by port.
#[derive(Default)]
pub struct OauthListeners(pub Mutex<HashMap<u16, TcpListener>>);

/// What the provider sent back on the redirect. Exactly one of `code` /
/// `error` is meaningful; both are optional so a malformed callback surfaces as
/// a clear message on the web side instead of a panic here.
#[derive(Serialize)]
pub struct OauthCallback {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

/// How long we wait for the accepted socket to send its request line. A browser
/// that connects and says nothing must not hold the flow open.
const REQUEST_READ_TIMEOUT: Duration = Duration::from_secs(10);

/// Poll interval while waiting for the browser to come back.
const ACCEPT_POLL: Duration = Duration::from_millis(100);

/// Binds a loopback port for the redirect and returns it.
///
/// The port has to be known *before* the browser opens, because it is part of
/// the redirect URI the provider is asked to send the user back to. Pass
/// `port` when the provider only accepts one registered redirect URI (OpenAI's
/// is `http://localhost:1455/auth/callback`); otherwise the OS picks a free
/// one, which is the safer default.
#[tauri::command]
pub fn oauth_start(
    listeners: State<'_, OauthListeners>,
    port: Option<u16>,
) -> Result<u16, String> {
    let requested = port.unwrap_or(0);
    let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, requested)))
        .map_err(|error| {
            if requested == 0 {
                format!("Could not open a local port for sign-in: {error}")
            } else {
                // A fixed port is usually busy because the provider's own CLI
                // is mid-flow; saying so beats an OS-level error string.
                format!(
                    "Port {requested} is busy, and this provider only accepts a sign-in \
                     redirect on that port. Close whatever is using it (often the \
                     provider's own CLI) and try again."
                )
            }
        })?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();

    listeners
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .insert(port, listener);

    Ok(port)
}

/// Stops listening on `port`, if we still are. Safe to call twice — abandoning
/// a flow and finishing one both end here.
#[tauri::command]
pub fn oauth_cancel(listeners: State<'_, OauthListeners>, port: u16) -> Result<(), String> {
    listeners
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .remove(&port);
    Ok(())
}

/// Waits for the browser to hit the redirect URI and returns its query params.
///
/// Requests that carry neither `code` nor `error` (a browser's speculative
/// `/favicon.ico`, a preconnect) are answered and ignored rather than
/// mistaken for the callback.
#[tauri::command]
pub async fn oauth_wait(
    app: tauri::AppHandle,
    port: u16,
    timeout_secs: u64,
) -> Result<OauthCallback, String> {
    let listener = {
        let state = tauri::Manager::state::<OauthListeners>(&app);
        let mut listeners = state.0.lock().map_err(|error| error.to_string())?;
        listeners
            .remove(&port)
            .ok_or_else(|| "Sign-in was cancelled".to_string())?
    };

    // Blocking accept on the Tauri blocking pool: the main thread keeps
    // painting while the user signs in.
    tauri::async_runtime::spawn_blocking(move || accept_callback(listener, timeout_secs))
        .await
        .map_err(|error| format!("Sign-in listener stopped unexpectedly: {error}"))?
}

fn accept_callback(listener: TcpListener, timeout_secs: u64) -> Result<OauthCallback, String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| error.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);

    loop {
        if Instant::now() >= deadline {
            return Err("Timed out waiting for the browser to finish signing in".to_string());
        }

        let mut stream = match listener.accept() {
            Ok((stream, _)) => stream,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(ACCEPT_POLL);
                continue;
            }
            Err(error) => return Err(format!("Sign-in listener failed: {error}")),
        };

        // Accepted sockets inherit the listener's non-blocking flag on some
        // platforms; reading the request line wants a plain blocking read.
        if stream.set_nonblocking(false).is_err() {
            continue;
        }

        let Some(target) = read_request_target(&stream) else {
            respond(&mut stream, "400 Bad Request", ERROR_PAGE);
            continue;
        };

        let params = parse_query(&target);
        let code = params.get("code").cloned();
        let error = params.get("error_description").or(params.get("error")).cloned();

        if code.is_none() && error.is_none() {
            // Not the redirect — a favicon probe or a stray connection.
            respond(&mut stream, "404 Not Found", "");
            continue;
        }

        respond(
            &mut stream,
            "200 OK",
            if error.is_some() { ERROR_PAGE } else { SUCCESS_PAGE },
        );

        return Ok(OauthCallback {
            code,
            state: params.get("state").cloned(),
            error,
        });
    }
}

/// Reads just the request target out of the first line ("GET /cb?code=… HTTP/1.1").
fn read_request_target(stream: &TcpStream) -> Option<String> {
    stream.set_read_timeout(Some(REQUEST_READ_TIMEOUT)).ok()?;
    let mut line = String::new();
    // Cap the line so a hostile local client can't make us buffer forever.
    BufReader::new(stream.take(8 * 1024))
        .read_line(&mut line)
        .ok()?;
    line.split_whitespace().nth(1).map(str::to_string)
}

fn parse_query(target: &str) -> HashMap<String, String> {
    let Some((_, query)) = target.split_once('?') else {
        return HashMap::new();
    };
    query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .map(|(key, value)| (percent_decode(key), percent_decode(value)))
        .collect()
}

/// Minimal `application/x-www-form-urlencoded` decoding. Invalid escapes are
/// left as written rather than dropped, so a malformed value still reaches the
/// web layer recognisably.
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).ok();
                match hex.and_then(|hex| u8::from_str_radix(hex, 16).ok()) {
                    Some(byte) => {
                        out.push(byte);
                        index += 3;
                    }
                    None => {
                        out.push(bytes[index]);
                        index += 1;
                    }
                }
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8_lossy(&out).into_owned()
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {len}\r\nConnection: close\r\n\r\n{body}",
        len = body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

/// The page the browser lands on. Deliberately self-contained — the tab has no
/// network access to us beyond this one response.
const SUCCESS_PAGE: &str = r#"<!doctype html><meta charset="utf-8"><title>Signed in</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#f7f7f5;color:#1b1b19;
font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
.card{text-align:center;padding:40px 48px}h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#6b6b66}
@media(prefers-color-scheme:dark){body{background:#191917;color:#f2f2ef}p{color:#a1a19b}}</style>
<div class="card"><h1>Signed in</h1><p>You can close this tab and go back to Yolo.</p></div>"#;

const ERROR_PAGE: &str = r#"<!doctype html><meta charset="utf-8"><title>Sign-in failed</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#f7f7f5;color:#1b1b19;
font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
.card{text-align:center;padding:40px 48px}h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#6b6b66}
@media(prefers-color-scheme:dark){body{background:#191917;color:#f2f2ef}p{color:#a1a19b}}</style>
<div class="card"><h1>Sign-in failed</h1><p>Go back to Yolo to see what went wrong.</p></div>"#;

#[cfg(test)]
mod tests {
    use super::{parse_query, percent_decode};

    #[test]
    fn reads_callback_parameters() {
        let params = parse_query("/callback?code=abc123&state=xyz");
        assert_eq!(params.get("code").map(String::as_str), Some("abc123"));
        assert_eq!(params.get("state").map(String::as_str), Some("xyz"));
    }

    #[test]
    fn a_target_without_a_query_has_no_parameters() {
        assert!(parse_query("/favicon.ico").is_empty());
    }

    #[test]
    fn decodes_escaped_values() {
        assert_eq!(percent_decode("a%20b+c"), "a b c");
        // A truncated escape is kept verbatim rather than swallowed.
        assert_eq!(percent_decode("100%"), "100%");
    }
}
