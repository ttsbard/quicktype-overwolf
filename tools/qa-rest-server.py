#!/usr/bin/env python3
"""QuickType REST test receiver. Requires Python 3; no packages to install.

Run: python qa-rest-server.py
QuickType Connection settings:
  URL: http://127.0.0.1:10101
  Method: POST
  Headers (JSON): {"Content-Type":"application/json"}
  Request body template: {"text":"{text}"}
Click Save, then send a phrase from Speech test or the in-game input.
The phrase appears in this console. Any URL path is accepted. Stop with Ctrl+C.
This receiver confirms REST delivery; it does not produce audio.
"""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Receiver(BaseHTTPRequestHandler):
    def reply(self, status, payload=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else b""
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.reply(204)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.reply(400, {"error": "Invalid Content-Length"})
            return
        if not 0 < length <= 65536:
            self.reply(400, {"error": "Expected a JSON body of 1 to 65536 bytes"})
            return
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            self.reply(400, {"error": "Invalid UTF-8 JSON"})
            return
        if not isinstance(data, dict) or not isinstance(data.get("text"), str) or not data["text"].strip():
            self.reply(400, {"error": "Expected a non-empty text string"})
            return
        # Escape control characters for console display; the response echoes the original text.
        print("Received: " + json.dumps(data["text"], ensure_ascii=False), flush=True)
        self.reply(200, {"ok": True, "text": data["text"]})

    def log_message(self, format, *args):
        pass


def main():
    try:
        server = ThreadingHTTPServer(("127.0.0.1", 10101), Receiver)
    except OSError as error:
        raise SystemExit("Cannot start on port 10101. Stop any other server using it.\n" + str(error))
    print(__doc__, flush=True)
    print("Listening on http://127.0.0.1:10101 - waiting for text...", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
