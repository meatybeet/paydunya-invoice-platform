import re
import shutil
import subprocess
import sys
import threading
from collections.abc import Callable


def start_cloudflare_tunnel(
    port: int = 8000, on_url: Callable[[str], None] | None = None
) -> subprocess.Popen | None:
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
                public_url = match.group(0)
                if on_url is not None:
                    on_url(public_url)
                print(f"Cloudflare public URL: {public_url}")
            else:
                print(f"[cloudflared] {line}", end="")

    threading.Thread(target=stream_output, daemon=True).start()
    return process
