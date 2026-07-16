import base64
import os
import secrets
import time
import threading
import json
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

from src.auto_runner import run as auto_runner_run

DASHBOARD_USER = os.environ.get("DASHBOARD_USER", "admin")
DASHBOARD_PASSWORD = os.environ.get("DASHBOARD_PASSWORD")

STATE = {
    "status": "Starting up...",
    "last_check": None,
    "last_error": None,
    "logs": []
}

def log_update(msg):
    print(msg)
    STATE["logs"].append({"time": datetime.now(timezone.utc).isoformat(), "msg": msg})
    if len(STATE["logs"]) > 50:
        STATE["logs"].pop(0)

class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()

    def _is_authorized(self):
        if not DASHBOARD_PASSWORD:
            return False
        auth_header = self.headers.get("Authorization", "")
        if not auth_header.startswith("Basic "):
            return False
        try:
            decoded = base64.b64decode(auth_header[len("Basic "):]).decode("utf-8")
            user, _, password = decoded.partition(":")
        except Exception:
            return False
        return secrets.compare_digest(user, DASHBOARD_USER) and secrets.compare_digest(password, DASHBOARD_PASSWORD)

    def do_GET(self):
        if not self._is_authorized():
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="F1 Data Engine"')
            self.send_header("Content-type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Unauthorized")
            return

        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()

        logs_html = "".join([f"<li><span class='time local-time' data-iso='{l['time']}'>[{l['time']}]</span> {l['msg']}</li>" for l in reversed(STATE['logs'])])
        
        html = f"""
        <html>
        <head>
            <title>F1 Data Engine Status</title>
            <meta http-equiv="refresh" content="30">
            <style>
                body {{ font-family: monospace; background: #1e1e1e; color: #d4d4d4; padding: 20px; }}
                h2 {{ color: #569cd6; }}
                .status-val {{ font-weight: bold; color: #4ec9b0; }}
                .error-val {{ color: #f44747; }}
                .time {{ color: #858585; }}
                ul {{ list-style-type: none; padding: 0; }}
                li {{ margin-bottom: 8px; border-bottom: 1px solid #333; padding-bottom: 4px; }}
            </style>
        </head>
        <body>
            <h2>F1 Data Engine</h2>
            <p><strong>Status:</strong> <span class="status-val">{STATE['status']}</span></p>
            <p><strong>Last Check:</strong> <span class="local-time" data-iso="{STATE['last_check'] or ''}">{STATE['last_check'] or 'Never'}</span></p>
            <p><strong>Last Error:</strong> <span class="error-val">{STATE['last_error'] or 'None'}</span></p>
            <h3>Live Activity Logs (Auto-refresh every 30s):</h3>
            <ul>
                {logs_html}
            </ul>
            <script>
                document.querySelectorAll('.local-time').forEach(el => {{
                    const iso = el.getAttribute('data-iso');
                    if (iso) {{
                        const d = new Date(iso);
                        if (!isNaN(d.getTime())) {{
                            const formatted = d.getFullYear() + '-' + 
                                String(d.getMonth() + 1).padStart(2, '0') + '-' + 
                                String(d.getDate()).padStart(2, '0') + ' ' + 
                                String(d.getHours()).padStart(2, '0') + ':' + 
                                String(d.getMinutes()).padStart(2, '0') + ':' + 
                                String(d.getSeconds()).padStart(2, '0');
                            if (el.classList.contains('time')) {{
                                el.textContent = '[' + formatted + ']';
                            }} else {{
                                el.textContent = formatted;
                            }}
                        }}
                    }}
                }});
            </script>
        </body>
        </html>
        """
        self.wfile.write(html.encode('utf-8'))
        
    def log_message(self, format, *args):
        pass

def start_server():
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(("0.0.0.0", port), HealthCheckHandler)
    log_update(f"[server] Listening on port {port} for UptimeRobot pings and dashboard...")
    server.serve_forever()

def start_worker():
    log_update("[worker] Background worker started. Will run auto_runner every 15 minutes.")
    while True:
        try:
            STATE["status"] = "Running checks..."
            STATE["last_check"] = datetime.now(timezone.utc).isoformat()
            log_update("[worker] Triggering auto_runner checks...")
            
            auto_runner_run(log_func=log_update)
            
            STATE["status"] = "Sleeping (Idle)"
            STATE["last_error"] = None
        except Exception as e:
            log_update(f"[worker] Worker caught error from auto_runner: {e}")
            STATE["status"] = "Error"
            STATE["last_error"] = str(e)
            
        log_update("[worker] Checks finished. Sleeping for 15 minutes...")
        time.sleep(900)

def main():
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    start_worker()

if __name__ == "__main__":
    main()
