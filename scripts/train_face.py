#!/usr/bin/env python3
"""Train an OpenCV face recognizer from uploaded photos.

Usage:
  python scripts/train_face.py \
    --person alice \
    --name "Alice" \
    --photos /tmp/1.jpg /tmp/2.jpg ... \
    --outdir /home/openmirror/openmirror/data/faces \
    --algorithm LBPH
"""

import argparse
import json
import os
import sys

import cv2


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--person', required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--photos', nargs='+', required=True)
    parser.add_argument('--outdir', required=True)
    parser.add_argument('--algorithm', default='LBPH', choices=['LBPH', 'EigenFaces', 'FisherFaces'])
    parser.add_argument('--cascade', default=None)
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


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)


def crop_face(image_path, cascade):
    img = cv2.imread(image_path)
    if img is None:
        return None
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(64, 64)
    )
    if len(faces) == 0:
        return None
    x, y, w, h = faces[0]
    # Add a small margin
    margin = int(0.1 * w)
    x1 = max(0, x - margin)
    y1 = max(0, y - margin)
    x2 = min(gray.shape[1], x + w + margin)
    y2 = min(gray.shape[0], y + h + margin)
    return gray[y1:y2, x1:x2]


def resize_for_algorithm(face, algorithm):
    if algorithm == 'LBPH':
        return cv2.resize(face, (200, 200))
    if algorithm == 'EigenFaces':
        return cv2.resize(face, (200, 200))
    if algorithm == 'FisherFaces':
        return cv2.resize(face, (200, 200))
    return face


def create_recognizer(algorithm):
    if algorithm == 'LBPH':
        return cv2.face.LBPHFaceRecognizer_create(
            radius=1,
            neighbors=8,
            grid_x=8,
            grid_y=8
        )
    if algorithm == 'EigenFaces':
        return cv2.face.EigenFaceRecognizer_create(num_components=80)
    if algorithm == 'FisherFaces':
        return cv2.face.FisherFaceRecognizer_create(num_components=0)
    raise ValueError(f'Unknown algorithm: {algorithm}')


def main():
    args = parse_args()

    cascade_path = find_cascade(args.cascade)
    if not cascade_path:
        print(json.dumps({'ok': False, 'error': 'Haar cascade not found'}))
        sys.exit(1)

    cascade = cv2.CascadeClassifier(cascade_path)

    base_dir = os.path.abspath(args.outdir)
    person_dir = os.path.join(base_dir, args.person)
    original_dir = os.path.join(person_dir, 'photos', 'original')
    cropped_dir = os.path.join(person_dir, 'photos', 'cropped')
    ensure_dir(original_dir)
    ensure_dir(cropped_dir)

    # Save originals and produce cropped faces
    trained = 0
    for idx, photo_path in enumerate(args.photos, start=1):
        ext = os.path.splitext(photo_path)[1].lower() or '.jpg'
        original_name = f'{idx}{ext}'
        original_dest = os.path.join(original_dir, original_name)
        try:
            img = cv2.imread(photo_path)
            if img is None:
                continue
            cv2.imwrite(original_dest, img)
        except Exception:
            continue

        face = crop_face(photo_path, cascade)
        if face is None:
            continue
        face = resize_for_algorithm(face, args.algorithm)
        cropped_dest = os.path.join(cropped_dir, f'{idx}.pgm')
        cv2.imwrite(cropped_dest, face)
        trained += 1

    if trained == 0:
        print(json.dumps({'ok': False, 'error': 'No face found in any photo'}))
        sys.exit(1)

    # Save/update label metadata for this person
    label_path = os.path.join(person_dir, 'label.json')
    with open(label_path, 'w', encoding='utf-8') as f:
        json.dump({'id': args.person, 'name': args.name}, f)

    # Build training set from all persons
    faces = []
    labels = []
    label_to_person = {}

    for label_idx, person_id in enumerate(sorted(os.listdir(base_dir))):
        person_path = os.path.join(base_dir, person_id)
        if not os.path.isdir(person_path):
            continue
        lbl_file = os.path.join(person_path, 'label.json')
        if not os.path.exists(lbl_file):
            continue
        with open(lbl_file, 'r', encoding='utf-8') as f:
            info = json.load(f)
        label_to_person[str(label_idx)] = info

        cropped_path = os.path.join(person_path, 'photos', 'cropped')
        if not os.path.isdir(cropped_path):
            continue
        for fname in sorted(os.listdir(cropped_path)):
            fpath = os.path.join(cropped_path, fname)
            img = cv2.imread(fpath, cv2.IMREAD_GRAYSCALE)
            if img is None:
                continue
            faces.append(img)
            labels.append(label_idx)

    if len(set(labels)) < 2 and args.algorithm in ('EigenFaces', 'FisherFaces'):
        print(json.dumps({
            'ok': False,
            'error': f'{args.algorithm} requires at least 2 different persons. Only {len(set(labels))} found.'
        }))
        sys.exit(1)

    recognizer = create_recognizer(args.algorithm)
    recognizer.train(faces, numpy.array(labels))

    model_path = os.path.join(base_dir, 'trainer.yml')
    recognizer.write(model_path)

    with open(os.path.join(base_dir, 'labels.json'), 'w', encoding='utf-8') as f:
        json.dump(label_to_person, f)

    with open(os.path.join(base_dir, 'algorithm.json'), 'w', encoding='utf-8') as f:
        json.dump({'algorithm': args.algorithm}, f)

    print(json.dumps({
        'ok': True,
        'trainedImages': trained,
        'totalPersons': len(set(labels)),
        'algorithm': args.algorithm
    }))


if __name__ == '__main__':
    import numpy
    main()
