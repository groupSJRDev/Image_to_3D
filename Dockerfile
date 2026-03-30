FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN pip install poetry && poetry install --no-root
COPY src/ ./src/
COPY examples/ ./examples/
RUN useradd -m -u 1000 app && chown -R app:app /app
USER app
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8010/health')"]
CMD ["poetry", "run", "uvicorn", "renderer.server:app", "--host", "0.0.0.0", "--port", "8010"]
