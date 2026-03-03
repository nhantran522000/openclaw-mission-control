# CI/CD Setup Guide

This document describes the CI/CD pipeline for OpenClaw Mission Control using GitHub Actions.

## Overview

The CI/CD pipeline automates:
- ✅ Testing (ESLint, TypeScript, Build)
- ✅ Security scanning (Trivy)
- ✅ Docker image building and pushing to GHCR
- ✅ Deployment to production server
- ✅ Health checks

## Workflow Triggers

The workflow runs on:
- **Push** to `main` or `develop` branches
- **Pull requests** to `main`
- **Manual trigger** via `workflow_dispatch`

## Pipeline Stages

### 1. Test and Build
- Checkout code
- Install dependencies
- Run ESLint
- TypeScript type checking
- Build Next.js application
- Run tests (if configured)

### 2. Security Scan
- Run Trivy vulnerability scanner
- Upload results to GitHub Security

### 3. Docker Build and Push
- Build Docker image
- Push to GitHub Container Registry (GHCR)
- Tag with branch, SHA, and semver

### 4. Deploy to Server
- SSH into production server
- Pull latest Docker image
- Restart services with docker-compose
- Run database migrations
- Verify deployment with health check

## GitHub Secrets Required

Configure these secrets in your GitHub repository settings:

```bash
# SSH key for server access
gh secret set SSH_PRIVATE_KEY

# Server connection details
gh secret set SERVER_HOST       # e.g., "116.110.40.250"
gh secret set SERVER_USER       # e.g., "nhan"

# Database password
gh secret set POSTGRES_PASSWORD # e.g., "mxG.874iEu/!"

# Application secrets
gh secret set ADMIN_API_KEY     # Auto-generated
gh secret set JWT_SECRET        # Auto-generated
```

## Quick Start

### Initial Setup

1. **Run the secrets setup script:**
   ```bash
   cd ~/projects/openclaw-mission-control
   ./scripts/setup-secrets.sh
   ```

2. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Setup CI/CD pipeline"
   git push origin main
   ```

3. **Monitor the workflow:**
   ```bash
   gh run list --repo nhantran522000/openclaw-mission-control
   ```

### Manual Deployment

Trigger a deployment manually:

```bash
gh workflow run ci-cd.yml -f deploy=true --repo nhantran522000/openclaw-mission-control
```

Or deploy directly from the server:

```bash
cd ~/projects/openclaw-mission-control
./scripts/deploy.sh
```

## Monitoring

### Check CI/CD Status

```bash
# Run the status checker script
./scripts/check-cicd.sh

# Or use gh CLI directly
gh run list --repo nhantran522000/openclaw-mission-control --limit 10

# View latest run details
gh run view --repo nhantran522000/openclaw-mission-control --log

# View failed runs
gh run list --repo nhantran522000/openclaw-mission-control --json conclusion,displayTitle --jq '[.[] | select(.conclusion == "failure")]'
```

### View Workflow Runs

Visit: https://github.com/nhantran522000/openclaw-mission-control/actions

## Docker Registry

Images are stored in GitHub Container Registry:

- **Registry**: `ghcr.io/nhantran522000/openclaw-mission-control`
- **Tags**: `latest`, `main`, `<sha>`, `<version>`

### Pull Latest Image

```bash
docker pull ghcr.io/nhantran522000/openclaw-mission-control:latest
```

### List Available Images

```bash
gh api repos/nhantran522000/openclaw-mission-control/packages/container-images/openclaw-mission-control/versions
```

## Server Deployment

### Automatic Deployment

On every push to `main`, the workflow:
1. Builds Docker image
2. Pushes to GHCR
3. SSHs into server
4. Pulls latest image
5. Restarts services
6. Runs migrations

### Manual Deployment

```bash
# Option 1: Use deployment script
cd ~/projects/openclaw-mission-control
./scripts/deploy.sh

# Option 2: Manual docker-compose
docker-compose pull mission-control
docker-compose up -d --force-recreate
docker-compose exec -T mission-control npx prisma migrate deploy
```

## Troubleshooting

### Workflow Failed

Check the logs:
```bash
gh run view --repo nhantran522000/openclaw-mission-control --log-failed
```

Common issues:
- **SSH connection failed**: Check `SSH_PRIVATE_KEY` secret and server accessibility
- **Docker pull failed**: Check GHCR authentication and image availability
- **Migration failed**: Check database connection and schema

### Deployment Failed

1. Check server logs:
   ```bash
   docker-compose logs -f mission-control
   ```

2. Check service status:
   ```bash
   docker-compose ps
   ```

3. Restart services manually:
   ```bash
   docker-compose restart
   ```

4. Revert to previous image:
   ```bash
   docker-compose pull mission-control:previous-tag
   docker-compose up -d
   ```

### Health Check Failed

```bash
# Check if service is running
curl https://vogalingo.win/api/health

# Check Caddy logs
docker-compose logs caddy

# Check Next.js logs
docker-compose logs mission-control

# Check database connection
docker-compose exec -T postgres psql -U nhan -d postgres -c "SELECT 1;"
```

## Security

- SSH keys are stored as GitHub secrets (encrypted)
- Database credentials are never committed
- API keys are rotated via admin panel
- Trivy scans for vulnerabilities on every build
- GitHub Dependabot monitors for dependency updates

## Rollback

To rollback to a previous version:

1. **Find previous image tag:**
   ```bash
   gh run list --repo nhantran522000/openclaw-mission-control --limit 5
   ```

2. **Pull specific image:**
   ```bash
   docker pull ghcr.io/nhantran522000/openclaw-mission-control:<previous-sha>
   ```

3. **Update docker-compose.yml:**
   ```yaml
   mission-control:
     image: ghcr.io/nhantran522000/openclaw-mission-control:<previous-sha>
   ```

4. **Restart:**
   ```bash
   docker-compose up -d --force-recreate
   ```

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/setup-secrets.sh` | Setup SSH keys and GitHub secrets |
| `scripts/check-cicd.sh` | Check CI/CD pipeline status |
| `scripts/deploy.sh` | Manual deployment to production |

## Environment Variables

| Variable | Description | Location |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | `.env.production`, GitHub Secrets |
| `POSTGRES_PASSWORD` | Database password | GitHub Secrets |
| `ADMIN_API_KEY` | Admin authentication key | GitHub Secrets |
| `JWT_SECRET` | JWT signing secret | GitHub Secrets |
| `DOCKER_IMAGE` | Docker image reference | `docker-compose.yml` |

## Best Practices

1. **Never commit secrets**: Use GitHub Secrets or `.env.local`
2. **Test before deploying**: Use `develop` branch for testing
3. **Monitor deployments**: Check CI/CD status after each push
4. **Keep images updated**: Regular dependency updates via Dependabot
5. **Backup database**: Regular backups of PostgreSQL data
6. **Monitor logs**: Check Docker logs for errors

## Support

- **GitHub Actions Documentation**: https://docs.github.com/en/actions
- **GitHub Container Registry**: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- **Docker Compose**: https://docs.docker.com/compose/

## Related Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Server deployment guide
- [TESTING.md](./TESTING.md) - Testing procedures
- [README.md](./README.md) - Project overview
