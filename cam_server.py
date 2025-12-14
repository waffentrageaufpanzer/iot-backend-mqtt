import requests
from flask import Flask, Response

app = Flask(__name__)

ESP32_STREAM_URL = "http://192.168.1.8/stream"  # doi IP/port cho dung

@app.get("/")
def mjpeg():
    r = requests.get(ESP32_STREAM_URL, stream=True, timeout=(5, None), headers={"User-Agent": "proxy"})
    r.raise_for_status()
    ct = r.headers.get("Content-Type", "multipart/x-mixed-replace; boundary=frame")

    def gen():
        for chunk in r.iter_content(chunk_size=4096):
            if chunk:
                yield chunk

    resp = Response(gen(), mimetype=ct)
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["X-Accel-Buffering"] = "no"  # proxy-friendly (coi nhu hint)
    return resp
