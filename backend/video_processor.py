import cv2
import os
import math
from typing import Dict, Any, Generator, Tuple

class VideoProcessor:
    def __init__(self, target_fps: float = 3.0):
        self.target_fps = target_fps

    def get_metadata(self, video_path: str) -> Dict[str, Any]:
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video file: {video_path}")

        original_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / original_fps if original_fps > 0 else 0.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()

        return {
            "fps": float(original_fps),
            "target_fps": self.target_fps,
            "total_frames": total_frames,
            "duration": float(duration),
            "width": width,
            "height": height
        }

    def extract_sampled_frames(self, video_path: str, output_frames_dir: str = None) -> Generator[Tuple[int, float, Any], None, None]:
        """
        Yields (frame_idx, timestamp_seconds, frame_bgr)
        downsampled to self.target_fps.
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video file: {video_path}")

        original_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        step = max(1, int(round(original_fps / self.target_fps)))

        if output_frames_dir:
            os.makedirs(output_frames_dir, exist_ok=True)

        current_frame = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if current_frame % step == 0:
                timestamp = current_frame / original_fps
                if output_frames_dir:
                    pass # Skipping disk write for extreme efficiency
                yield current_frame, timestamp, frame

            current_frame += 1

        cap.release()

    @staticmethod
    def format_timestamp(seconds: float) -> str:
        """Converts float seconds to MM:SS or HH:MM:SS format."""
        total_secs = int(seconds)
        mins = total_secs // 60
        secs = total_secs % 60
        hours = mins // 60
        mins = mins % 60
        if hours > 0:
            return f"{hours:02d}:{mins:02d}:{secs:02d}"
        return f"{mins:02d}:{secs:02d}"
