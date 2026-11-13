# MediaPipe (self-hosted) — فصل الشخص عن الخلفية داخل المتصفح

| الملف | المصدر | الترخيص |
|---|---|---|
| `vision_bundle.mjs`, `wasm/vision_wasm_internal.js`, `wasm/vision_wasm_internal.wasm` | npm `@mediapipe/tasks-vision@1.2.3` (Google) | Apache-2.0 — `LICENSE-2.0.txt` |
| `selfie_segmenter.tflite` | https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite (MediaPipe Selfie Segmenter, model card: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf) | Apache-2.0 |

كل الملفات مستضافة على خادم كليب كات نفسه — لا تعتمد الميزة على أي خدمة خارجية أو مدفوعة.
أزلنا فقط سطر `sourceMappingURL` من ملفات JS (لا تغيير آخر).
