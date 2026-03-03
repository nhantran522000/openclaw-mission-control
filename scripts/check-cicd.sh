#!/bin/bash

# =============================================================================
# CI/CD Status Checker Script
# =============================================================================
# This script checks the status of GitHub Actions CI/CD workflows

set -e

echo "======================================"
echo "OpenClaw Mission Control CI/CD Status"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if gh CLI is authenticated
if ! gh auth status >/dev/null 2>&1; then
    echo -e "${RED}✗ Not authenticated with GitHub${NC}"
    echo "Please run: gh auth login"
    exit 1
fi

# Get latest runs
echo "Latest Workflow Runs:"
echo "-------------------------------------------"
gh run list --repo nhantran522000/openclaw-mission-control --limit 10 --json conclusion,status,displayTitle,createdAt,updatedAt,headBranch --template 'table: {{.status}} | {{.conclusion}} | {{.displayTitle}} | {{.headBranch}} | {{.createdAt}}'

echo ""
echo "======================================"

# Get status of latest run
LATEST_RUN=$(gh run list --repo nhantran522000/openclaw-mission-control --limit 1 --json databaseId --jq '.[0].databaseId')

if [ -n "$LATEST_RUN" ]; then
    echo "Latest Run Details:"
    echo "-------------------------------------------"
    gh run view --repo nhantran522000/openclaw-mission-control "$LATEST_RUN" --log-failed || true

    echo ""
    echo "Jobs:"
    echo "-------------------------------------------"
    gh run view --repo nhantran522000/openclaw-mission-control "$LATEST_RUN" --json jobs --jq '.jobs[] | "\(.name): \(.status) \(.conclusion)"'
else
    echo -e "${YELLOW}No workflow runs found${NC}"
fi

echo ""
echo "======================================"

# Check for failed runs
FAILED_RUNS=$(gh run list --repo nhantran522000/openclaw-mission-control --limit 5 --json databaseId,conclusion --jq '[.[] | select(.conclusion == "failure")] | length')

if [ "$FAILED_RUNS" -gt 0 ]; then
    echo -e "${YELLOW}⚠ Warning: $FAILED_RUNS failed runs in last 5${NC}"
    echo ""
    echo "Recent Failed Runs:"
    echo "-------------------------------------------"
    gh run list --repo nhantran522000/openclaw-mission-control --limit 5 --json conclusion,displayTitle,createdAt --jq '[.[] | select(.conclusion == "failure")] | "\(.displayTitle) - \(.createdAt)"'
else
    echo -e "${GREEN}✓ No failed runs in last 5${NC}"
fi

echo ""
echo "======================================"

# Deployment status
echo "Deployment Status:"
echo "-------------------------------------------"
DEPLOYED_RUNS=$(gh run list --repo nhantran522000/openclaw-mission-control --workflow=ci-cd.yml --limit 5 --json databaseId,conclusion,status,headBranch --jq '[.[] | select(.conclusion == "success" and .headBranch == "main")] | length')

if [ "$DEPLOYED_RUNS" -gt 0 ]; then
    echo -e "${GREEN}✓ Last successful deployment: $DEPLOYED_RUNS runs${NC}"

    # Get the latest successful deployment
    LATEST_DEPLOY=$(gh run list --repo nhantran522000/openclaw-mission-control --workflow=ci-cd.yml --limit 1 --json databaseId,conclusion,headBranch --jq '.[0]')

    if echo "$LATEST_DEPLOY" | jq -e '.conclusion == "success"' >/dev/null; then
        echo -e "${GREEN}✓ Latest run on main was successful${NC}"
    fi
else
    echo -e "${YELLOW}⚠ No successful deployments on main branch yet${NC}"
fi

echo ""
echo "======================================"

# Check Docker image
echo "Docker Image Status:"
echo "-------------------------------------------"
if docker images | grep -q "ghcr.io/nhantran522000/openclaw-mission-control"; then
    echo -e "${GREEN}✓ Docker image present locally${NC}"
    docker images ghcr.io/nhantran522000/openclaw-mission-control --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
else
    echo -e "${YELLOW}⚠ Docker image not found locally${NC}"
fi

echo ""
echo "======================================"

# Server status
echo "Server Status:"
echo "-------------------------------------------"
if docker-compose ps >/dev/null 2>&1; then
    docker-compose ps
else
    echo -e "${YELLOW}⚠ Docker compose not running or not in correct directory${NC}"
fi

echo ""
echo "======================================"

# Health check
echo "Application Health Check:"
echo "-------------------------------------------"
if curl -sf https://vogalingo.win/api/health >/dev/null 2>&1; then
    HEALTH=$(curl -sf https://vogalingo.win/api/health)
    echo -e "${GREEN}✓ Application is healthy${NC}"
    echo "$HEALTH" | jq '.' 2>/dev/null || echo "$HEALTH"
else
    echo -e "${RED}✗ Application health check failed${NC}"
fi

echo ""
echo "======================================"
echo "Actions:"
echo "-------------------------------------------"
echo "View workflows: https://github.com/nhantran522000/openclaw-mission-control/actions"
echo "Trigger deployment: gh workflow run ci-cd.yml -f deploy=true --repo nhantran522000/openclaw-mission-control"
echo "View logs for latest run: gh run view --repo nhantran522000/openclaw-mission-control --log"
echo ""
