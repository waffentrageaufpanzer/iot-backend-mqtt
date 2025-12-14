from flask import Flask, Response, jsonify
from flask_cors import CORS
import cv2
import threading
import time

app = Flask(__name__)
CORS(app)

# ====== CONFIG ======
CAMERA_INDEX = 0
PORT = 5001

# Windows: dùng DirectShow cho đỡ lỗi MSMF
cap = cv2.VideoCapture(CAMERA_INDEX, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
cap.set(cv2.CAP_PROP_FPS, 30)

latest_jpg = None
lock = threading.Lock()

def camera_worker():
    global latest_jpg
    while True:
        ok, frame = cap.read()
        if not ok:
            time.sleep(0.1)
            continue

        # Encode JPEG
        ok2, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if not ok2:
            continue

        with lock:
            latest_jpg = buf.tobytes()

        time.sleep(0.01)  # giảm CPU chút

@app.get("/health")
def health():
    return jsonify({"ok": True})

@app.get("/snapshot")
def snapshot():
    with lock:
        if latest_jpg is None:
            return ("No frame yet", 503)
        jpg = latest_jpg

    return Response(jpg, mimetype="image/jpeg")

@app.get("/stream")
def stream():
    def gen():
        boundary = b"--frame\r\n"
        while True:
            with lock:
                jpg = latest_jpg

            if jpg is None:
                time.sleep(0.05)
                continue

            yield boundary
            yield b"Content-Type: image/jpeg\r\n"
            yield f"Content-Length: {len(jpg)}\r\n\r\n".encode()
            yield jpg
            yield b"\r\n"
            time.sleep(0.03)  # ~30fps (tuỳ máy)

    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")

if __name__ == "__main__":
    t = threading.Thread(target=camera_worker, daemon=True)
    t.start()

    # 0.0.0.0 để máy khác trong LAN xem được
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
