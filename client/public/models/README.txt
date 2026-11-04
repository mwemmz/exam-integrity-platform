blaze_face_short_range.tflite: MediaPipe BlazeFace short-range face detector (Apache License 2.0).
Taken from the npm package @mediapipe/face_detection (face_detection_short_range.tflite). The Tasks API needs
input-normalisation metadata that this copy did not have, so the metadata (RGB, mean 127.5, std 127.5) was added
to the model file; the network weights are unchanged.
yolo11n.onnx: YOLO11 nano (COCO), used for phone and object detection.
silero_vad_v5.onnx: Silero VAD v5 speech detector (MIT License), from the npm package @ricky0123/vad-web.
Used to tell human speech apart from other loud sounds. About 2.3 MB; runs in the browser on the student's device.
