FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        poppler-utils \
        tesseract-ocr \
        tesseract-ocr-eng \
        tesseract-ocr-vie \
    && rm -rf /var/lib/apt/lists/*
COPY ai-service/pyproject.toml .
COPY ai-service/requirements.lock .
COPY ai-service/app app
COPY ai-service/alembic.ini .
COPY ai-service/migrations migrations
COPY contracts/schemas contracts/schemas
COPY contracts/taxonomy contracts/taxonomy
COPY ai-service/start.sh .
RUN pip install --no-cache-dir --constraint requirements.lock .
RUN chmod +x start.sh
EXPOSE 8083
CMD ["./start.sh"]
