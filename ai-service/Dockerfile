FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY ai-service/pyproject.toml .
COPY ai-service/requirements.lock .
COPY ai-service/app app
COPY ai-service/alembic.ini .
COPY ai-service/migrations migrations
COPY contracts/schemas contracts/schemas
COPY ai-service/start.sh .
RUN pip install --no-cache-dir --constraint requirements.lock .
RUN chmod +x start.sh
EXPOSE 8083
CMD ["./start.sh"]
