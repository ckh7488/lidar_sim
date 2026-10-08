"""Build and serve locally. Stop with Ctrl+C. Does not alter the source data."""
import argparse
import functools
import os
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from build import build, ROOT

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def do_GET(self):
        if self.path == '/favicon.ico':
            self.send_response(204); self.end_headers(); return
        super().do_GET()

class Server(ThreadingHTTPServer):
    allow_reuse_address = False
    def server_bind(self):
        # Windows SO_REUSEADDR can share a port with another agent's server.
        if os.name == 'nt': self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port', type=int, default=8768)
    p.add_argument('--no-build', action='store_true')
    args = p.parse_args()
    try:
        with socket.create_connection(('127.0.0.1', args.port), timeout=0.3):
            p.exit(1, f'Port {args.port} is already in use. Choose another --port; the existing server was left running.\n')
    except OSError:
        pass
    directory = ROOT/'dist' if args.no_build else build()
    if not (directory/'index.html').is_file(): p.error('Run python tools/build.py first')
    try:
        server = Server(('127.0.0.1', args.port), functools.partial(Handler, directory=str(directory)))
    except OSError as error:
        p.exit(1, f'Cannot use port {args.port}: {error}\nChoose another port with --port 8770.\n')
    print(f'Open http://127.0.0.1:{args.port}/ | Ctrl+C to stop', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
