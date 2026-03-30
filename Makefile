# ─────────────────────────────────────────────────────────────────────────────
# VML 3D Renderer — Makefile
# ─────────────────────────────────────────────────────────────────────────────
# Usage:  make <target>
#   make            — build and start everything
#   make help       — list all targets
# ─────────────────────────────────────────────────────────────────────────────

.DEFAULT_GOAL := up

# ── Docker Compose (full stack) ──────────────────────────────────────────────

.PHONY: up down build rebuild logs status restart

up: _ensure-env _ensure-db ## Build (if needed) and start all services
	docker compose up --build -d

down: ## Stop and remove all containers
	docker compose down

build: _ensure-env ## Build images without starting
	docker compose build

rebuild: _ensure-env ## Force rebuild images from scratch (no cache)
	docker compose build --no-cache

logs: ## Tail logs from all services
	docker compose logs -f

status: ## Show container status and health
	docker compose ps

restart: down up ## Stop everything, then rebuild and start

# ── Individual services ──────────────────────────────────────────────────────

.PHONY: up-backend up-frontend down-backend down-frontend \
        logs-backend logs-frontend restart-backend restart-frontend

up-backend: _ensure-env _ensure-db ## Start backend only
	docker compose up --build -d backend

up-frontend: ## Start frontend only (backend must be running)
	docker compose up --build -d frontend

down-backend: ## Stop backend
	docker compose stop backend

down-frontend: ## Stop frontend
	docker compose stop frontend

logs-backend: ## Tail backend logs
	docker compose logs -f backend

logs-frontend: ## Tail frontend logs
	docker compose logs -f frontend

restart-backend: ## Restart backend
	docker compose restart backend

restart-frontend: ## Restart frontend
	docker compose restart frontend

# ── Local development (no Docker) ───────────────────────────────────────────

.PHONY: dev-backend dev-frontend dev install install-backend install-frontend

dev: ## Start both services locally (no Docker) — requires two terminals
	@echo "Run in separate terminals:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

dev-backend: _ensure-env ## Start backend locally with Poetry
	cd "$(CURDIR)" && poetry run renderer

dev-frontend: ## Start frontend Vite dev server locally
	cd "$(CURDIR)/frontend" && npm run dev

install: install-backend install-frontend ## Install all dependencies locally

install-backend: ## Install Python dependencies via Poetry (includes dev tools)
	poetry install --extras dev

install-frontend: ## Install Node dependencies
	cd "$(CURDIR)/frontend" && npm install

# ── Linting and formatting ──────────────────────────────────────────────────

.PHONY: lint lint-frontend lint-backend fmt fmt-frontend fmt-backend typecheck

lint: lint-backend lint-frontend ## Run all linters

lint-frontend: ## Lint frontend with ESLint
	cd "$(CURDIR)/frontend" && npx eslint .

lint-backend: ## Lint Python with ruff
	poetry run ruff check src/

fmt: fmt-backend fmt-frontend ## Auto-format all code

fmt-backend: ## Format Python with ruff
	poetry run ruff format src/
	poetry run ruff check --fix src/

fmt-frontend: ## Format frontend with ESLint --fix
	cd "$(CURDIR)/frontend" && npx eslint . --fix

typecheck: ## TypeScript type check (no emit)
	cd "$(CURDIR)/frontend" && npx tsc -b --noEmit

# ── Database ─────────────────────────────────────────────────────────────────

.PHONY: db-reset db-shell db-backup

db-reset: ## Delete the SQLite database (will be recreated on next start)
	@echo "Deleting renderer.db..."
	rm -f renderer.db
	@echo "Database reset. Restart the backend to recreate tables."

db-shell: ## Open SQLite shell on the database
	sqlite3 renderer.db

db-backup: ## Backup the database with timestamp
	@mkdir -p backups
	cp renderer.db "backups/renderer-$$(date +%Y%m%d-%H%M%S).db"
	@echo "Backup saved to backups/"

# ── Poetry / dependency management ──────────────────────────────────────────

.PHONY: lock add-dep

lock: ## Regenerate poetry.lock after pyproject.toml changes
	poetry lock

add-dep: ## Add a Python dependency (usage: make add-dep pkg=slowapi)
	poetry add $(pkg)
	@echo "Don't forget to rebuild: make rebuild"

# ── Cleanup ──────────────────────────────────────────────────────────────────

.PHONY: clean clean-docker clean-python clean-frontend

clean: clean-python clean-frontend ## Remove local build artifacts (not Docker)

clean-docker: down ## Stop containers and remove images/volumes
	docker compose down --rmi local --volumes --remove-orphans

clean-python: ## Remove Python cache files
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	rm -rf .ruff_cache

clean-frontend: ## Remove frontend build artifacts
	rm -rf frontend/dist frontend/node_modules/.vite

# ── Docker shell access ─────────────────────────────────────────────────────

.PHONY: shell-backend shell-frontend

shell-backend: ## Open a shell in the running backend container
	docker compose exec backend /bin/bash

shell-frontend: ## Open a shell in the running frontend container
	docker compose exec frontend /bin/sh

# ── Utilities ────────────────────────────────────────────────────────────────

.PHONY: health env-check help

health: ## Check backend health endpoint
	@curl -sf http://localhost:8010/health && echo "" || echo "Backend not responding"

env-check: ## Verify .env has required variables
	@test -f .env || (echo "ERROR: .env not found — run: cp .env.example .env" && exit 1)
	@grep -q "GEMINI_API_KEY=." .env 2>/dev/null \
		&& echo "GEMINI_API_KEY: set" \
		|| echo "WARNING: GEMINI_API_KEY not set in .env"
	@grep -q "GEMINI_API_KEY=your_" .env 2>/dev/null \
		&& echo "WARNING: GEMINI_API_KEY still has placeholder value" \
		|| true

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Internal targets ─────────────────────────────────────────────────────────

_ensure-env:
	@test -f .env || (echo "Creating .env from .env.example..." && cp .env.example .env)

_ensure-db:
	@test -f renderer.db || touch renderer.db
