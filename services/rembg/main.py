"""Background-removal microservice (spec feature 15).

A deliberately dumb image-in / image-out HTTP wrapper around ``rembg``. It
holds no credentials, talks to no database and touches no object storage:
``apps/worker`` owns every piece of that and calls this with raw bytes.
Keeping it that way means a compromise here yields, at most, someone
else's CPU time.

Two rules follow from that and must not be relaxed:

* **Bytes only, never a URL.** Accepting a URL to fetch would turn this
  into an SSRF primitive reachable from the public internet through the
  upload flow — the same class of hole ``-protocol_whitelist file`` closes
  for the ffmpeg audio worker.
* **Bounded work.** A decompression bomb or a 20000x20000 photo would
  otherwise pin a CPU for minutes. Size and pixel-count caps are checked
  before the model ever runs.
"""

from __future__ import annotations

import io
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image
from rembg import new_session, remove

# Matches `/api/uploads`'s own 10MB image cap. A request larger than what
# the web app will ever send is a bug or an attack, not a big photo.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# Guards against a decompression bomb: a 40KB PNG can declare 30000x30000
# and cost gigabytes to decode. 24 megapixels is well past any phone camera
# the invitations see.
MAX_PIXELS = 24_000_000

# `isnet-general-use` per the spec. Named explicitly rather than left to
# rembg's default so an upgrade of the library cannot silently change which
# model runs — and therefore what every couple's cut-out looks like.
MODEL_NAME = os.environ.get("REMBG_MODEL", "isnet-general-use")

app = FastAPI(title="HPWD background removal", version="1.0.0")

# Built once at import, not per request: loading the ONNX model takes
# seconds and allocates hundreds of megabytes, so doing it per request
# would make every call slow and let concurrent calls exhaust memory.
_session = new_session(MODEL_NAME)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe. Reports the model so a misconfigured deploy is visible."""
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/remove-background")
async def remove_background(file: UploadFile = File(...)) -> Response:
    """Take an image, return a PNG with the background made transparent."""
    payload = await file.read()

    if not payload:
        raise HTTPException(status_code=400, detail="empty body")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="image too large")

    try:
        with Image.open(io.BytesIO(payload)) as probe:
            # `Image.open` is lazy — it reads the header only, so the
            # dimensions are known before any pixel is decoded, which is
            # exactly what makes this check useful against a bomb.
            width, height = probe.size
            probe.verify()
    except Exception as error:  # noqa: BLE001 - any decode failure means "not an image"
        raise HTTPException(status_code=400, detail="not a decodable image") from error

    if width * height > MAX_PIXELS:
        raise HTTPException(status_code=413, detail="image has too many pixels")

    # Output is always PNG: the whole point is the alpha channel, and JPEG
    # has none, so returning the input format would silently drop the
    # transparency this service exists to produce.
    cutout = remove(payload, session=_session, force_return_bytes=True)

    return Response(content=cutout, media_type="image/png")
