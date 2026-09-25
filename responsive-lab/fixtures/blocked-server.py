"""Local deterministic iframe-denial fixture; bind only to loopback."""
from http.server import BaseHTTPRequestHandler, HTTPServer
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Security-Policy', "frame-ancestors 'none'")
        self.send_header('X-Frame-Options', 'DENY')
        self.end_headers()
        self.wfile.write(b'<!doctype html><title>Blocked iframe fixture</title><h1>Direct access works; embedding is denied.</h1>')
if __name__ == '__main__':
    print('Iframe denial fixture: http://localhost:8765/')
    HTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
