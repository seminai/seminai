.PHONY: help dev up down build rebuild logs clean clean-all test migrate seed

# Default target
help:
	@echo "Available commands:"
	@echo "  make dev        - Start development environment"
	@echo "  make up         - Start containers in background"
	@echo "  make down       - Stop containers"
	@echo "  make build      - Build images without cache"
	@echo "  make rebuild    - Rebuild and restart containers"
	@echo "  make logs       - Show logs"
	@echo "  make clean      - Remove containers and images"
	@echo "  make clean-all  - Remove everything (containers, images, volumes)"
	@echo "  make test       - Run tests in container"
	@echo "  make migrate    - Run Prisma migrations"
	@echo "  make seed       - Run database seed"

# Start development environment
dev:
	docker compose up --build

# Start containers in detached mode
up:
	docker compose up -d

# Stop containers
down:
	docker compose down

# Build images without using cache
build:
	docker compose build --no-cache

# Rebuild and restart containers
rebuild: down
	docker compose up --build -d

# Show container logs
logs:
	docker compose logs -f app

# Clean containers and images
clean:
	docker compose down --rmi all

# Clean everything including volumes
clean-all:
	docker compose down --rmi all --volumes --remove-orphans

# Run tests
test:
	docker compose exec app bun test

# Run migrations
migrate:
	docker compose exec app bunx prisma migrate deploy

# Run database seed
seed:
	docker compose exec app bunx prisma db seed

# Dump local database
db-dump:
	npm exec ts-node --transpile-only src/utils/db-dump.ts

# Production commands
prod-up:
	docker compose -f docker-compose.prod.yml up -d

prod-down:
	docker compose -f docker-compose.prod.yml down

prod-logs:
	docker compose -f docker-compose.prod.yml logs -f app

prod-build:
	docker compose -f docker-compose.prod.yml build --no-cache

prod-rebuild: prod-down
	docker compose -f docker-compose.prod.yml up --build -d

