#!/usr/bin/env python3
"""Run face detection and recognition from the Pi camera.

Outputs one JSON object per line:
  {"event":"detected","personId":"alice","confidence":42.5}
  {"event":"unknown"}
  {"event":"lost"}
"""

import argparse
import json
import os
import sys
import time

import cv2


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

    cap = cv2.VideoCapture(args.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)

    if not cap.isOpened():
        emit('error', message='Cannot open camera')
        sys.exit(1)

    lost_counter = 0
    last_event = None
    last_person_id = None
    last_preview = 0
    current_label = None

    while True:
        ret, frame = cap.read()
        if not ret:
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
        face_img = gray[y:y+h, x:x+w]

        # Resize to training size for Eigen/Fisher consistency
        if args.algorithm in ('EigenFaces', 'FisherFaces'):
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
