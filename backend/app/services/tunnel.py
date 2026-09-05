import re
import shutil
import subprocess
import sys
import threading


def start_cloudflare_tunnel(port: int = 8000) -> subprocess.Popen | None:
    """Start Cloudflare's temporary quick tunnel and print its public URL."""
    executable = shutil.which("cloudflared")
    if executable is None:
        print("Cloudflare tunnel unavailable: install cloudflared and run this command again.")
        print("Install guide: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/")
        return None

    process = subprocess.Popen(
        [executable, "tunnel", "--url", f"http://127.0.0.1:{port}"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )

    def stream_output() -> None:
        assert process.stdout is not None
        for line in process.stdout:
            match = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
            if match:
                print(f"Cloudflare public URL: {match.group(0)}")
            else:
                print(f"[cloudflared] {line}", end="")

    threading.Thread(target=stream_output, daemon=True).start()
    return process
