# Slim, not alpine: onnxruntime ships manylinux wheels that need glibc, and
# on alpine pip would fall back to building from source.
FROM python:3.11-slim

# libgl1/libglib2.0-0 are opencv's runtime dependencies. rembg pulls
# opencv-python-headless, which still links against them; without these the
# import fails at container start with "libGL.so.1: cannot open shared object
# file" — a crash loop that says nothing about the real cause.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./

# Bake the model into the image rather than letting the first request
# download 170MB from GitHub. Otherwise the first couple to press "Xoá nền"
# after a deploy waits for that download, every replica downloads its own
# copy, and the service is one GitHub outage away from being broken.
ENV U2NET_HOME=/app/models
RUN mkdir -p /app/models \
    && python -c "from rembg import new_session; new_session('isnet-general-use')"

# This service must never be reachable from the internet: it takes arbitrary
# images and spends CPU on them, with no authentication of its own (the
# worker is the only thing that should be able to call it). Publish it on an
# internal network only.
EXPOSE 7000

# uvicorn directly, NOT through a shell or a wrapper: the same SIGTERM
# forwarding problem documented in apps/worker/src/index.ts. A wrapper that
# swallows the signal means every deploy kills an in-flight inference.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7000", "--workers", "1"]
