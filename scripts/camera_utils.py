"""Camera abstraction for Raspberry Pi using ffmpeg + V4L2.

OpenCV's V4L2 backend hangs with the Logitech USB camera on Bookworm, so this
module relies on ffmpeg to output MJPEG frames on stdout and decodes them with
OpenCV.
"""

import os
import subprocess
import sys
import time


def _configure_opencv_env():
    for key in (
        'OPENCV_VIDEOIO_PRIORITY_GSTREAMER',
        'OPENCV_VIDEOIO_PRIORITY_V4L2',
        'OPENCV_VIDEOIO_PRIORITY_MSMF',
    ):
        os.environ.setdefault(key, '0')
    os.environ.setdefault('GST_REGISTRY_UPDATE', 'no')


_configure_opencv_env()


class Camera:
    def __init__(self, index=0, width=640, height=480, fps=5):
        self.index = index
        self.width = width
        self.height = height
        self.fps = fps
        self.proc = None
        self._buffer = b''

    def open(self):
        device = f'/dev/video{self.index}'
        if not os.path.exists(device):
            return False
        try:
            self.proc = subprocess.Popen(
                [
                    'ffmpeg', '-y',
                    '-f', 'v4l2',
                    '-input_format', 'mjpeg',
                    '-i', device,
                    '-vf', f'fps={self.fps},scale={self.width}:{self.height}',
                    '-f', 'image2pipe',
                    '-vcodec', 'mjpeg',
                    'pipe:1'
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                bufsize=256 * 1024
            )
            # Wait briefly for ffmpeg to negotiate, then confirm we can read a frame.
            time.sleep(1.0)
            frame = self._read_frame(timeout=5.0)
            if frame is not None:
                return True
            self._kill_proc()
        except Exception as e:
            print(f'ffmpeg backend failed: {e}', file=sys.stderr)
            self._kill_proc()
        return False

    def _read_frame(self, timeout=5.0):
        import cv2
        import numpy as np
        start = time.time()
        while time.time() - start < timeout:
            chunk = self.proc.stdout.read(65536)
            if not chunk:
                # ffmpeg may have exited; avoid busy-looping.
                if self.proc.poll() is not None:
                    return None
                time.sleep(0.05)
                continue
            self._buffer += chunk
            soi = self._buffer.find(b'\xff\xd8')
            if soi == -1:
                self._buffer = self._buffer[-1:] if self._buffer else b''
                continue
            eoi = self._buffer.find(b'\xff\xd9', soi)
            if eoi == -1:
                self._buffer = self._buffer[soi:]
                continue
            jpeg = self._buffer[soi:eoi + 2]
            self._buffer = self._buffer[eoi + 2:]
            frame = cv2.imdecode(np.frombuffer(jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)
            if frame is not None:
                return frame
        return None

    def _kill_proc(self):
        if self.proc:
            try:
                self.proc.kill()
                self.proc.wait(timeout=2)
            except Exception:
                pass
            self.proc = None

    def read(self):
        if self.proc is None:
            return False, None
        if self.proc.poll() is not None:
            return False, None
        frame = self._read_frame(timeout=5.0)
        if frame is not None:
            return True, frame
        return False, None

    def release(self):
        self._buffer = b''
        self._kill_proc()
