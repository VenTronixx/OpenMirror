#!/usr/bin/env python3
"""Run face detection and recognition from the Pi camera.

Uses ffmpeg with V4L2 to capture MJPEG frames because OpenCV's V4L2 backend
hangs with this USB camera on Raspberry Pi Bookworm.

Outputs one JSON object per line:
  {"event":"detected","personId":"alice","confidence":42.5}
  {"event":"unknown"}
  {"event":"lost"}
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import time


_ffmpeg_proc = None


def _configure_opencv_env():
    """Disable video I/O backends that can hang during import on Raspberry Pi."""
    for key in (
        'OPENCV_VIDEOIO_PRIORITY_GSTREAMER',
        'OPENCV_VIDEOIO_PRIORITY_V4L2',
        'OPENCV_VIDEOIO_PRIORITY_MSMF',
    ):
        os.environ.setdefault(key, '0')
    os.environ.setdefault('GST_REGISTRY_UPDATE', 'no')


_configure_opencv_env()
import cv2  # noqa: E402
import numpy as np  # noqa: E402


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--labels', required=True)
    parser.add_argument('--algorithm', default='LBPH')
    parser.add_argument('--cascade', default=None)
    parser.add_argument('--threshold', type=float, default=80.0)
    parser.add_argument('--interval', type=float, default=1.0)
    parser.add_argument('--lost-frames', type=int, default=5)
    parser.add_argument('--camera', type=int, default=0)
    parser.add_argument('--width', type=int, default=640)
    parser.add_argument('--height', type=int, default=480)
    parser.add_argument('--preview', default=None)
    parser.add_argument('--preview-interval', type=float, default=0.2)
    return parser.parse_args()


def find_cascade(cascade_arg):
    if cascade_arg and os.path.exists(cascade_arg):
        return cascade_arg
    candidates = [
        '/usr/share/opencv4/haarcascades/haarcascade_frontalface_default.xml',
        '/usr/share/opencv/haarcascades/haarcascade_frontalface_default.xml',
        '/usr/local/share/opencv4/haarcascades/haarcascade_frontalface_default.xml',
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def create_recognizer(algorithm):
    if algorithm == 'LBPH':
        return cv2.face.LBPHFaceRecognizer_create()
    if algorithm == 'EigenFaces':
        return cv2.face.EigenFaceRecognizer_create()
    if algorithm == 'FisherFaces':
        return cv2.face.FisherFaceRecognizer_create()
    raise ValueError(f'Unknown algorithm: {algorithm}')


def emit(event, **kwargs):
    data = {'event': event, **kwargs}
    print(json.dumps(data), flush=True)


def start_ffmpeg(camera, width, height, fps, frame_path):
    device = f'/dev/video{camera}'
    if not os.path.exists(device):
        raise RuntimeError(f'Camera device {device} not found')
    proc = subprocess.Popen(
        [
            'ffmpeg', '-y',
            '-f', 'v4l2',
            '-input_format', 'mjpeg',
            '-i', device,
            '-vf', f'fps={fps},scale={width}:{height}',
            '-update', '1',
            '-q:v', '2',
            frame_path
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL
    )
    return proc


def read_frame(frame_path, timeout=5.0):
    start = time.time()
    while time.time() - start < timeout:
        if os.path.exists(frame_path):
            try:
                with open(frame_path, 'rb') as f:
                    data = f.read()
                if len(data) > 0:
                    frame = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
                    if frame is not None:
                        return frame
            except Exception:
                pass
        time.sleep(0.05)
    return None


def main():
    args = parse_args()

    if not os.path.exists(args.model):
        emit('error', message='Model not found')
        sys.exit(1)

    cascade_path = find_cascade(args.cascade)
    if not cascade_path:
        emit('error', message='Haar cascade not found')
        sys.exit(1)

    cascade = cv2.CascadeClassifier(cascade_path)
    recognizer = create_recognizer(args.algorithm)
    recognizer.read(args.model)

    with open(args.labels, 'r', encoding='utf-8') as f:
        labels = json.load(f)

    emit('ready')

    frame_dir = os.path.dirname(args.preview) if args.preview else '/tmp'
    os.makedirs(frame_dir, exist_ok=True)
    frame_path = os.path.join(frame_dir, f'.openmirror_frame_{os.getpid()}.jpg')

    fps = max(1, int(1.0 / min(args.interval, args.preview_interval)))
    ffmpeg = start_ffmpeg(args.camera, args.width, args.height, fps, frame_path)
    global _ffmpeg_proc
    _ffmpeg_proc = ffmpeg

    def _shutdown(signum, frame):
        if _ffmpeg_proc is not None:
            try:
                _ffmpeg_proc.terminate()
                _ffmpeg_proc.wait(timeout=2)
            except Exception:
                try:
                    _ffmpeg_proc.kill()
                except Exception:
                    pass
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    lost_counter = 0
    last_event = None
    last_person_id = None
    last_preview = 0
    current_label = None

    try:
        # Wait for the first frame before entering the main loop.
        frame = read_frame(frame_path, timeout=10.0)
        if frame is None:
            emit('error', message='Camera did not produce frames')
            sys.exit(1)

        while True:
            frame = read_frame(frame_path, timeout=2.0)
            if frame is None:
                time.sleep(args.interval)
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(
                gray,
                scaleFactor=1.2,
                minNeighbors=5,
                minSize=(100, 100)
            )

            if len(faces) == 0:
                lost_counter += 1
                if lost_counter >= args.lost_frames and last_event != 'lost':
                    emit('lost')
                    last_event = 'lost'
                    current_label = None
                if args.preview and time.time() - last_preview >= args.preview_interval:
                    _write_preview(frame, args.preview, None)
                    last_preview = time.time()
                time.sleep(args.interval)
                continue

            lost_counter = 0
            x, y, w, h = faces[0]

            # Add the same 10% margin used during training so the crop matches the trained images.
            margin = int(0.1 * w)
            x1 = max(0, x - margin)
            y1 = max(0, y - margin)
            x2 = min(gray.shape[1], x + w + margin)
            y2 = min(gray.shape[0], y + h + margin)
            face_img = gray[y1:y2, x1:x2]

            # Resize to the same size used during training so the recognizer compares like-for-like.
            face_img = cv2.resize(face_img, (200, 200))

            label_idx, confidence = recognizer.predict(face_img)
            label_key = str(label_idx)

            if confidence > args.threshold or label_key not in labels:
                if last_event != 'unknown':
                    emit('unknown', confidence=float(confidence))
                    last_event = 'unknown'
                current_label = 'Unknown'
            else:
                person = labels[label_key]
                if last_event != 'detected' or last_person_id != person['id']:
                    emit('detected', personId=person['id'], name=person['name'], confidence=float(confidence))
                    last_event = 'detected'
                    last_person_id = person['id']
                current_label = person['name']

            if args.preview and time.time() - last_preview >= args.preview_interval:
                _write_preview(frame, args.preview, current_label, x, y, w, h)
                last_preview = time.time()

            time.sleep(args.interval)
    finally:
        ffmpeg.terminate()
        try:
            ffmpeg.wait(timeout=3)
        except subprocess.TimeoutExpired:
            ffmpeg.kill()
        if os.path.exists(frame_path):
            try:
                os.remove(frame_path)
            except Exception:
                pass


def _write_preview(frame, preview_path, label=None, x=None, y=None, w=None, h=None):
    try:
        annotated = frame.copy()
        if label and x is not None:
            cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 255, 0), 2)
            cv2.putText(annotated, label, (x, y - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        cv2.imwrite(preview_path, annotated)
    except Exception:
        pass


if __name__ == '__main__':
    main()
