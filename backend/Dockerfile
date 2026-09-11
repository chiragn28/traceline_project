FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Runs migrations before serving, and binds to $PORT when the platform
# sets one (Railway, Render, etc.) rather than a hardcoded port -- falls
# back to 8000 for a plain `docker run`. docker-compose.yml overrides this
# with --reload for local dev; a deployed worker service overrides the
# whole command to `python -m app.worker.scheduler` (same image, see
# README "Deploying it").
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
