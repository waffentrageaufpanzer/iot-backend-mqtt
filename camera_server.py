"""
📷 CAMERA SERVER HTTPS - Stream webcam realtime
Chạy local, truy cập qua HTTPS

Cài đặt:
    pip install flask opencv-python

Chạy:
    python camera_server.py

Truy cập:
    https://localhost:5000/stream
    https://192.168.1.x:5000/stream (từ thiết bị khác cùng mạng)
"""
from flask import Flask, Response, render_template_string
import cv2
import ssl
import os

app = Flask(__name__)

# ===== CẤU HÌNH =====
CAMERA_INDEX = 0      # 0 = webcam mặc định, 1/2 = camera khác
PORT = 5000
QUALITY = 50          # JPEG quality (1-100)
WIDTH = 640           # Độ rộng
HEIGHT = 480          # Độ cao

# ===== WEBCAM =====
camera = None

def get_camera():
    global camera
    if camera is None:
        camera = cv2.VideoCapture(CAMERA_INDEX)
        camera.set(cv2.CAP_PROP_FRAME_WIDTH, WIDTH)
        camera.set(cv2.CAP_PROP_FRAME_HEIGHT, HEIGHT)
    return camera

def generate_frames():
    """Generator cho MJPEG stream"""
    cam = get_camera()
    while True:
        success, frame = cam.read()
        if not success:
            break
        
        # Encode JPEG
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, QUALITY])
        frame_bytes = buffer.tobytes()
        
        # MJPEG format
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

# ===== ROUTES =====
@app.route('/')
def index():
    """Trang chủ với preview"""
    html = '''
    <!DOCTYPE html>
    <html>
    <head>
        <title>📷 Camera Stream</title>
        <style>
            body { 
                font-family: Arial; 
                background: #1a1a2e; 
                color: white; 
                text-align: center; 
                padding: 20px;
            }
            img { 
                border-radius: 10px; 
                box-shadow: 0 0 20px rgba(0,0,0,0.5);
                max-width: 100%;
            }
            .info { 
                background: #16213e; 
                padding: 15px; 
                border-radius: 10px; 
                margin: 20px auto;
                max-width: 600px;
            }
            code { 
                background: #0f3460; 
                padding: 5px 10px; 
                border-radius: 5px;
                display: block;
                margin: 10px 0;
            }
            a { color: #4facfe; }
        </style>
    </head>
    <body>
        <h1>📷 Camera Stream HTTPS</h1>
        <img src="/stream" alt="Camera Stream">
        
        <div class="info">
            <h3>🔗 Stream URLs:</h3>
            <p>Local:</p>
            <code>https://localhost:''' + str(PORT) + '''/stream</code>
            <p>Từ thiết bị khác (cùng mạng):</p>
            <code>https://YOUR_IP:''' + str(PORT) + '''/stream</code>
            <p>
                <a href="/stream" target="_blank">Mở stream trực tiếp →</a>
            </p>
        </div>
        
        <div class="info">
            <h3>📝 Sử dụng trong IoT Dashboard:</h3>
            <p>1. Vào Quản lý Slots → Sửa slot Camera</p>
            <p>2. Điền Stream URL:</p>
            <code>https://YOUR_IP:''' + str(PORT) + '''/stream</code>
        </div>
    </body>
    </html>
    '''
    return render_template_string(html)

@app.route('/stream')
def stream():
    """MJPEG stream endpoint"""
    return Response(
        generate_frames(),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )

@app.route('/snapshot')
def snapshot():
    """Chụp 1 ảnh"""
    cam = get_camera()
    success, frame = cam.read()
    if success:
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
        return Response(buffer.tobytes(), mimetype='image/jpeg')
    return "Error", 500

# ===== TẠO HTTPS CERTIFICATE =====
def create_ssl_cert():
    """Tạo self-signed certificate nếu chưa có"""
    cert_file = 'cert.pem'
    key_file = 'key.pem'
    
    if not os.path.exists(cert_file) or not os.path.exists(key_file):
        print("🔐 Tạo SSL Certificate...")
        
        # Dùng OpenSSL command (cần cài OpenSSL)
        os.system(f'''openssl req -x509 -newkey rsa:4096 -nodes \
            -out {cert_file} -keyout {key_file} \
            -days 365 -subj "/CN=localhost" \
            -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null''')
        
        if os.path.exists(cert_file):
            print("✅ Certificate created!")
        else:
            print("⚠️ Không tạo được certificate, dùng cách thủ công...")
            create_cert_manual()
    
    return cert_file, key_file

def create_cert_manual():
    """Tạo certificate bằng Python (không cần OpenSSL)"""
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        import datetime
        
        # Generate key
        key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )
        
        # Generate certificate
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, u"localhost"),
        ])
        
        cert = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer
        ).public_key(
            key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.datetime.utcnow()
        ).not_valid_after(
            datetime.datetime.utcnow() + datetime.timedelta(days=365)
        ).add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName(u"localhost"),
                x509.IPAddress(ipaddress.IPv4Address(u"127.0.0.1")),
            ]),
            critical=False,
        ).sign(key, hashes.SHA256(), default_backend())
        
        # Write key
        with open("key.pem", "wb") as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption()
            ))
        
        # Write cert
        with open("cert.pem", "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        
        print("✅ Certificate created (Python)!")
        
    except ImportError:
        print("❌ Cần cài: pip install cryptography")
        print("   Hoặc tạo certificate thủ công (xem hướng dẫn)")

# ===== MAIN =====
if __name__ == '__main__':
    import socket
    
    # Lấy IP local
    hostname = socket.gethostname()
    local_ip = socket.gethostbyname(hostname)
    
    print("="*50)
    print("📷 CAMERA SERVER HTTPS")
    print("="*50)
    
    # Kiểm tra webcam
    print(f"\n📷 Opening camera {CAMERA_INDEX}...")
    cam = get_camera()
    if not cam.isOpened():
        print("❌ Không mở được webcam!")
        print("   Thử đổi CAMERA_INDEX = 1 hoặc 2")
        exit(1)
    print("✅ Camera OK!")
    
    # Tạo SSL cert
    cert_file, key_file = create_ssl_cert()
    
    # Hiển thị URL
    print(f"\n🌐 Server đang chạy:")
    print(f"   Local:   https://localhost:{PORT}")
    print(f"   Network: https://{local_ip}:{PORT}")
    print(f"\n📡 Stream URL (dùng cho IoT Dashboard):")
    print(f"   https://{local_ip}:{PORT}/stream")
    print(f"\n⚠️  Lần đầu truy cập, trình duyệt sẽ cảnh báo 'Not Secure'")
    print(f"   → Click 'Advanced' → 'Proceed to localhost'")
    print("="*50)
    print("Nhấn Ctrl+C để dừng")
    print("="*50)
    
    # Chạy server
    try:
        if os.path.exists(cert_file) and os.path.exists(key_file):
            # HTTPS
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(cert_file, key_file)
            app.run(host='0.0.0.0', port=PORT, ssl_context=context, threaded=True)
        else:
            # Fallback HTTP (sẽ bị Mixed Content)
            print("⚠️ Chạy HTTP (không có certificate)")
            app.run(host='0.0.0.0', port=PORT, threaded=True)
    except KeyboardInterrupt:
        print("\n👋 Bye!")
    finally:
        if camera:
            camera.release()
