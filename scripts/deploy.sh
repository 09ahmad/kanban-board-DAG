#!/bin/bash

# TaskFlow Pro - Production Deployment Script
# Usage: ./scripts/deploy.sh [--build] [--pull]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
BUILD=false
PULL=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --build)
            BUILD=true
            shift
            ;;
        --pull)
            PULL=true
            shift
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Usage: $0 [--build] [--pull]"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  TaskFlow Pro - Production Deployment  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo "Please copy .env.production.example to .env and fill in your values."
    exit 1
fi

# Check required environment variables
source .env

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "CHANGE_ME_TO_A_VERY_LONG_RANDOM_STRING_AT_LEAST_32_CHARS" ]; then
    echo -e "${RED}Error: JWT_SECRET must be set in .env${NC}"
    exit 1
fi

if [ -z "$POSTGRES_PASSWORD" ] || [ "$POSTGRES_PASSWORD" = "CHANGE_ME_SECURE_PASSWORD" ]; then
    echo -e "${RED}Error: POSTGRES_PASSWORD must be set in .env${NC}"
    exit 1
fi

echo -e "${YELLOW}Checking Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed!${NC}"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed!${NC}"
    exit 1
fi

# Pull latest images if requested
if [ "$PULL" = true ]; then
    echo -e "${YELLOW}Pulling latest base images...${NC}"
    docker compose pull postgres redis server ws-server web
fi

# Build images if requested
if [ "$BUILD" = true ]; then
    echo -e "${YELLOW}Building application images...${NC}"
    docker compose build --no-cache
fi

# Stop existing containers
echo -e "${YELLOW}Stopping existing containers...${NC}"
docker compose down --remove-orphans

# Start services
echo -e "${YELLOW}Starting services...${NC}"
docker compose up -d

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
sleep 10

# Check health
echo -e "${YELLOW}Checking service health...${NC}"
docker compose ps

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!                 ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Services running:"
echo "  - REST API: http://localhost:4000"
echo "  - WebSocket: ws://localhost:4001"
echo "  - Web App: http://localhost:3000"
echo "  - PostgreSQL: localhost:5432"
echo "  - Redis: localhost:6379"
echo ""
echo "To view logs:"
echo "  docker compose logs -f"
echo ""
echo "To stop:"
echo "  docker compose down"
echo ""