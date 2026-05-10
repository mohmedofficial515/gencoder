# -*- coding: utf-8 -*-
"""
DeepSeek Bridge Quick Test
Run: python C:\\gencoder\\test_bridge.py
"""
import json
import sys
import urllib.request
import urllib.error

# Fix Windows console encoding
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = "http://127.0.0.1:5000"

def check_status():
    print("[1] Checking bridge status...")
    req = urllib.request.urlopen(f"{BASE}/api/deepseek/status", timeout=5)
    status = json.loads(req.read())
    print(f"    connected    : {status['connected']}")
    print(f"    pending      : {status['pending']}")
    print(f"    max_pending  : {status['max_pending']}")
    return status["connected"]

def test_chat(message="Say: test successful"):
    print(f"\n[2] Sending message: '{message}'")
    payload = json.dumps({
        "model": "deepseek-bridge",
        "messages": [{"role": "user", "content": message}],
        "stream": False,
        "temperature": 0.3,
    }).encode()

    req = urllib.request.Request(
        f"{BASE}/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=130) as resp:
            result = json.loads(resp.read())
            text = result["choices"][0]["message"]["content"]
            print(f"\n[OK] Response:\n{text}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"\n[ERR] HTTP {e.code}: {body}")
    except Exception as e:
        print(f"\n[ERR] {e}")

if __name__ == "__main__":
    try:
        connected = check_status()
        if not connected:
            print("\n[WARN] Chrome extension NOT connected!")
            print("  Steps:")
            print("  1. Install the Chrome extension from:")
            print(r"     C:\Users\MOHAMED AHMED\Desktop\hybrid_synth\extension")
            print("  2. Open chat.deepseek.com in Chrome and log in")
            print("  3. Check that the extension icon shows a GREEN dot")
            print("  4. Re-run this script")
        else:
            test_chat()
    except Exception as e:
        print(f"[ERR] Backend unreachable: {e}")
        print("  Start it with:")
        print("  cd C:\\Users\\MOHAMED AHMED\\Desktop\\hybrid_synth")
        print("  python -m uvicorn src.api.server:app --port 5000")
