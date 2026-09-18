"""Tests for the background-removal service.

These run the REAL model. That is slow (a few seconds for the first call,
which loads the ONNX graph) but it is the only thing worth testing here:
this service is fifty lines of validation around ``rembg``, so a mocked
``remove`` would leave nothing but the validation, and the one assertion
that actually matters — that the output has a transparent background —
cannot be faked.
"""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from main import MAX_PIXELS, MAX_UPLOAD_BYTES, app

client = TestClient(app)


def photo_bytes(width: int = 320, height: int = 320, fmt: str = "PNG") -> bytes:
    """A crude 'subject on a background': a solid field with a filled circle in the middle."""
    image = Image.new("RGB", (width, height), (240, 240, 240))
    from PIL import ImageDraw

    draw = ImageDraw.Draw(image)
    margin = min(width, height) // 5
    draw.ellipse((margin, margin, width - margin, height - margin), fill=(180, 40, 60))

    buffer = io.BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


def post_image(payload: bytes, filename: str = "photo.png", content_type: str = "image/png"):
    return client.post("/remove-background", files={"file": (filename, payload, content_type)})


def test_health_reports_the_model_actually_loaded():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "model": "isnet-general-use"}


def test_returns_a_png_the_same_size_as_the_input():
    source = photo_bytes(320, 240)

    response = post_image(source)

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    with Image.open(io.BytesIO(response.content)) as cutout:
        assert cutout.format == "PNG"
        assert cutout.size == (320, 240)


def test_the_output_actually_has_a_transparent_background():
    # The whole reason this service exists. A PNG that merely *has* an alpha
    # channel proves nothing — this checks that the corners became
    # see-through and that something in the middle did not.
    response = post_image(photo_bytes(320, 320))

    with Image.open(io.BytesIO(response.content)) as cutout:
        rgba = cutout.convert("RGBA")
        assert rgba.mode == "RGBA"
        corner_alpha = rgba.getpixel((2, 2))[3]
        centre_alpha = rgba.getpixel((160, 160))[3]

    assert corner_alpha == 0, "the background corner should be fully transparent"
    assert centre_alpha > 200, "the subject in the middle should stay opaque"


def test_accepts_a_jpeg_and_still_returns_png():
    # JPEG has no alpha, so echoing the input format back would silently
    # throw away the transparency this service produces.
    response = post_image(photo_bytes(fmt="JPEG"), filename="photo.jpg", content_type="image/jpeg")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"


def test_rejects_something_that_is_not_an_image():
    response = post_image(b"this is not an image at all, not even close")

    assert response.status_code == 400
    assert "image" in response.json()["detail"]


def test_rejects_an_empty_body():
    response = post_image(b"")

    assert response.status_code == 400


def test_rejects_an_oversized_upload():
    response = post_image(b"\x89PNG\r\n\x1a\n" + b"0" * (MAX_UPLOAD_BYTES + 1))

    assert response.status_code == 413


def test_rejects_a_decompression_bomb_before_decoding_it():
    # A tiny file that declares an enormous canvas. The check has to happen
    # on the header, which is why `Image.open` (lazy) is used rather than
    # loading pixels first.
    side = 6000
    assert side * side > MAX_PIXELS
    bomb = Image.new("RGB", (side, side), (0, 0, 0))
    buffer = io.BytesIO()
    bomb.save(buffer, format="PNG")
    bomb.close()

    response = post_image(buffer.getvalue())

    assert response.status_code == 413
    assert "pixels" in response.json()["detail"]


@pytest.mark.parametrize("field", ["image", "photo", ""])
def test_rejects_a_request_whose_file_field_is_misnamed(field: str):
    # The worker sends `file`. Anything else is a caller bug, and FastAPI
    # reporting it as 422 rather than silently processing nothing is the
    # behaviour worth pinning.
    response = client.post("/remove-background", files={field or "x": ("p.png", photo_bytes(), "image/png")})

    assert response.status_code == 422
