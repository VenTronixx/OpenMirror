#!/usr/bin/env python3
"""Capture camera frames and write a preview JPEG.

Uses ffmpeg with the V4L2 backend because it handles USB cameras more
reliably than OpenCV on Raspberry Pi Bookworm. Exits cleanly on SIGTERM
or KeyboardInterrupt.
"""

import argparse
import os
import subprocess
import sys
import time


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--camera', type=int, default=0)
    parser.add_argument('--width', type=int, default=640)
    parser.add_argument('--height', type=int, default=480)
    parser.add_argument('--preview', required=True)
    parser.add_argument('--interval', type=float, default=0.5)
    return parser.parse_args()


def main():
    args = parse_args()
    device = f'/dev/video{args.camera}'
    if not os.path.exists(device):
        print(f'Camera device {device} not found', file=sys.stderr)
        sys.exit(1)

    preview_dir = os.path.dirname(args.preview)
    if preview_dir:
        os.makedirs(preview_dir, exist_ok=True)

    fps = max(1, int(1.0 / args.interval))
    proc = subprocess.Popen(
        [
            'ffmpeg', '-y',
            '-f', 'v4l2',
            '-i', device,
            '-vf', f'fps={fps},scale={args.width}:{args.height}',
            '-update', '1',
            '-q:v', '2',
            args.preview
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL
    )

    try:
        while proc.poll() is None:
            time.sleep(0.2)
    except KeyboardInterrupt:
        pass
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == '__main__':
    main()
