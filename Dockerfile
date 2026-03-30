FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN pip install poetry && poetry install --no-root
COPY src/ ./src/
COPY examples/ ./examples/
CMD ["poetry", "run", "uvicorn", "renderer.server:app", "--host", "0.0.0.0", "--port", "8010"]
