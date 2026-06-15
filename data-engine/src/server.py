import os
import time
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

# Import the main logic
from src.auto_runner import run as auto_runner_run

class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/plain")
        self.end_headers()
        self.wfile.write(b"OK")
        
    def log_message(self, format, *args):
        # Suppress standard logging for the health check so it doesn't spam Render logs
        pass

def start_server():
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(("0.0.0.0", port), HealthCheckHandler)
    print(f"[server] Listening on port {port} for UptimeRobot pings...")
    server.serve_forever()

def start_worker():
    print("[worker] Background worker started. Will run auto_runner every hour.")
    while True:
        try:
            print("[worker] Triggering auto_runner checks...")
            auto_runner_run()
        except Exception as e:
            print(f"[worker] Worker caught error from auto_runner: {e}")
            
        # Sleep for exactly 1 hour
        print("[worker] Checks finished. Sleeping for 1 hour...")
        time.sleep(3600)

def main():
    # Start web server in a daemon thread (runs in background)
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    # Start the worker loop in the main thread (blocks forever)
    start_worker()

if __name__ == "__main__":
    main()
