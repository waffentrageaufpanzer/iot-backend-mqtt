import cv2
from flask import Flask, Response

app = Flask(__name__)
cap = cv2.VideoCapture(0)  # camera index 0

@app.route('/snapshot')
def snapshot():
    ok, frame = cap.read()
    if not ok:
        return "camera error", 500
    ok, jpeg = cv2.imencode('.jpg', frame)
    if not ok:
        return "encode error", 500
    return Response(jpeg.tobytes(), mimetype='image/jpeg')

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)