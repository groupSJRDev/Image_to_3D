FROM python:3.11-slim
WORKDIR /app
ENV POETRY_VIRTUALENVS_IN_PROJECT=true
ENV PYTHONPATH=/app/src
COPY pyproject.toml poetry.lock ./
RUN pip install poetry && poetry install --no-root
COPY src/ ./src/
COPY examples/ ./examples/
RUN useradd -m -u 1500 vmlapp && chown -R vmlapp:vmlapp /app
USER vmlapp
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8010/health')"]
CMD ["/app/.venv/bin/uvicorn", "renderer.server:app", "--host", "0.0.0.0", "--port", "8010"]
