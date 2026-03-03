# OpenClaw Mission Control - Deployment Guide

This guide covers the deployment process for the OpenClaw Mission Control application to vogalingo.win.

## Table of Contents

1. [Pre-deployment Checklist](#1-pre-deployment-checklist)
2. [Environment Configuration](#2-environment-configuration)
3. [Deployment Steps](#3-deployment-steps)
4. [Post-deployment](#4-post-deployment)
5. [Monitoring](#5-monitoring)
6. [Backup Procedures](#6-backup-procedures)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Pre-deployment Checklist

Before deploying, ensure the following requirements are met:

### DNS Setup
- [ ] DNS A record configured for `vogalingo.win` pointing to your server's IP address
- [ ] DNS A record configured for `www.vogalingo.win` (optional, for www redirect)
- [ ] DNS propagation complete (verify with `dig vogalingo.win`)

### Network Configuration
- [ ] Port 80 (HTTP) open for SSL certificate challenges
- [ ] Port 443 (HTTPS) open for secure traffic
- [ ] Firewall configured to allow inbound traffic on these ports

### Server Requirements
- [ ] Docker installed (version 20.10 or higher)
- [ ] Docker Compose installed (version 2.0 or higher)
- [ ] Sufficient disk space (minimum 10GB recommended)
- [ ] Sufficient RAM (minimum 2GB recommended)

### Domain Preparation
- [ ] Domain `vogalingo.win` is registered and accessible
- [ ] No conflicting services running on ports 80/443
- [ ] SSL certificate generation ready (Caddy will handle this automatically)

### Verification Commands
```bash
# Check Docker version
docker --version

# Check Docker Compose version
docker compose version

# Check available disk space
df -h

# Check open ports
sudo netstat -tlnp | grep -E ':(80|443)'
```

---

## 2. Environment Configuration

### Required Environment Variables

The application requires the following environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://nhan:password@postgres:5432/openclaw_mission_control` |
| `ADMIN_API_KEY` | Secret key for admin panel access | `your-secure-admin-key-here` |
| `JWT_SECRET` | Secret key for JWT token signing | `your-secure-jwt-secret-here` |

### How to Generate Secure Keys

Use the following commands to generate cryptographically secure keys:

```bash
# Generate a random 32-character hex string (for ADMIN_API_KEY)
openssl rand -hex 32

# Generate a random 64-character base64 string (for JWT_SECRET)
openssl rand -base64 48

# Alternative using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

### .env.production File Setup

Create a `.env.production` file in the project root:

```bash
# Copy the example file
cp .env.example .env.production
```

Edit `.env.production` with your production values:

```env
# Database Configuration
DATABASE_URL="postgresql://nhan:YOUR_SECURE_PASSWORD@postgres:5432/openclaw_mission_control"

# Admin Panel Authentication
ADMIN_API_KEY="your-generated-admin-api-key"

# JWT Configuration
JWT_SECRET="your-generated-jwt-secret"

# Optional: Node Environment
NODE_ENV="production"
```

**Important Security Notes:**
- Never commit `.env.production` to version control
- Use strong, unique passwords for the database
- Rotate keys periodically
- Store backup copies of keys in a secure location (e.g., password manager)

---

## 3. Deployment Steps

### Step 1: Clone the Repository

```bash
# Clone the repository
git clone <repository-url>
cd openclaw-mission-control

# Ensure you're on the correct branch
git checkout main
git pull origin main
```

### Step 2: Configure Environment

```bash
# Create production environment file
cp .env.example .env.production

# Edit with your production values
nano .env.production
```

### Step 3: Start Services

```bash
# Build and start all services in detached mode
docker-compose up -d

# This will start:
# - mission-control (Next.js application)
# - postgres (PostgreSQL database)
# - caddy (Reverse proxy with automatic SSL)
```

### Step 4: Verify Services

```bash
# Check container status
docker-compose ps

# Check application logs
docker-compose logs -f mission-control

# Verify SSL certificate generation
docker-compose logs caddy
```

### Step 5: Initialize Database

```bash
# Run database migrations
docker-compose exec mission-control npx prisma migrate deploy

# Seed the database with initial data (optional)
docker-compose exec mission-control npx prisma db seed
```

### Complete Deployment Script

Here's a complete deployment script for convenience:

```bash
#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# Pull latest changes
git pull origin main

# Start services
echo "📦 Starting Docker services..."
docker-compose up -d --build

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 10

# Run migrations
echo "🗄️ Running database migrations..."
docker-compose exec -T mission-control npx prisma migrate deploy

# Check status
echo "✅ Deployment complete!"
docker-compose ps

echo "🌐 Application available at: https://vogalingo.win"
```

---

## 4. Post-deployment

### Verify Application Access

1. **Test the main application:**
   ```bash
   curl -I https://vogalingo.win
   ```
   Expected: HTTP 200 OK

2. **Test SSL certificate:**
   ```bash
   curl -vI https://vogalingo.win 2>&1 | grep -E "(SSL|TLS|certificate)"
   ```
   Or visit in browser and check for padlock icon.

### Database Setup

```bash
# Run database migrations
docker-compose exec mission-control npx prisma migrate deploy

# Run the JSON-to-database migration script (if migrating from JSON storage)
docker-compose exec mission-control npx tsx scripts/migrate-json-to-db.ts

# Verify database connection
docker-compose exec mission-control npx prisma db pull
```

### Admin Panel Setup

1. **Access the admin panel:**
   - URL: https://vogalingo.win/admin
   - Enter your `ADMIN_API_KEY` when prompted

2. **Create your first agent:**
   - Click "Create Agent"
   - Fill in agent details (name, role, etc.)
   - Save the generated API key securely

3. **Store API key securely:**
   - The API key will only be shown once
   - Store it in a secure location (password manager)
   - This key will be used by agents to authenticate with the API

### Verification Checklist

- [ ] Application loads at https://vogalingo.win
- [ ] SSL certificate is valid
- [ ] Admin panel accessible at /admin
- [ ] Database migrations completed successfully
- [ ] First agent created and API key saved
- [ ] API endpoints responding correctly

---

## 5. Monitoring

### View Logs

```bash
# View all service logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f mission-control
docker-compose logs -f postgres
docker-compose logs -f caddy

# View last 100 lines
docker-compose logs --tail=100 mission-control
```

### Caddy Access Logs

Caddy logs all HTTP requests. View them with:

```bash
# Real-time Caddy logs
docker-compose logs -f caddy

# Filter for specific patterns
docker-compose logs caddy | grep -E "(ERROR|WARN)"
docker-compose logs caddy | grep "vogalingo.win"
```

### PostgreSQL Connection Monitoring

```bash
# Check PostgreSQL connections
docker-compose exec postgres psql -U nhan -d openclaw_mission_control -c "SELECT count(*) FROM pg_stat_activity;"

# View active connections
docker-compose exec postgres psql -U nhan -d openclaw_mission_control -c "SELECT * FROM pg_stat_activity;"

# Check database size
docker-compose exec postgres psql -U nhan -d openclaw_mission_control -c "SELECT pg_size_pretty(pg_database_size('openclaw_mission_control'));"
```

### Health Check Endpoints

The application provides health check endpoints:

```bash
# Check if application is responding
curl https://vogalingo.win/api/agents

# Check database connectivity (via Prisma)
docker-compose exec mission-control npx prisma db pull
```

### Container Health Status

```bash
# Check container health
docker-compose ps

# Inspect container details
docker inspect openclaw-mission-control-mission-control-1
```

### Resource Monitoring

```bash
# View resource usage
docker stats

# View disk usage
docker system df
```

---

## 6. Backup Procedures

### PostgreSQL Database Backup

#### Manual Backup

```bash
# Create a backup
docker-compose exec postgres pg_dump -U nhan openclaw_mission_control > backup_$(date +%Y%m%d_%H%M%S).sql

# Compressed backup
docker-compose exec postgres pg_dump -U nhan openclaw_mission_control | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

#### Automated Backup Script

Create a backup script (`backup.sh`):

```bash
#!/bin/bash
BACKUP_DIR="/path/to/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/openclaw_${TIMESTAMP}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Create backup
docker-compose exec -T postgres pg_dump -U nhan openclaw_mission_control | gzip > $BACKUP_FILE

# Keep only last 7 days of backups
find $BACKUP_DIR -name "openclaw_*.sql.gz" -mtime +7 -delete

echo "Backup created: $BACKUP_FILE"
```

### Volume Backup Locations

Docker volumes store persistent data:

```bash
# List volumes
docker volume ls

# Inspect volume location
docker volume inspect openclaw-mission-control_postgres_data

# Backup volume data
docker run --rm -v openclaw-mission-control_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_volume_backup.tar.gz /data
```

### Restore Procedures

#### Database Restore from SQL File

```bash
# Restore from uncompressed backup
cat backup_20240101_120000.sql | docker-compose exec -T postgres psql -U nhan openclaw_mission_control

# Restore from compressed backup
gunzip -c backup_20240101_120000.sql.gz | docker-compose exec -T postgres psql -U nhan openclaw_mission_control
```

#### Volume Restore

```bash
# Restore volume from backup
docker run --rm -v openclaw-mission-control_postgres_data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres_volume_backup.tar.gz -C /
```

### Complete Disaster Recovery

```bash
# 1. Stop all services
docker-compose down

# 2. Remove corrupted data (if necessary)
docker volume rm openclaw-mission-control_postgres_data

# 3. Start services
docker-compose up -d

# 4. Wait for PostgreSQL to be ready
sleep 10

# 5. Restore database
cat backup.sql | docker-compose exec -T postgres psql -U nhan openclaw_mission_control

# 6. Verify restoration
docker-compose exec postgres psql -U nhan -d openclaw_mission_control -c "SELECT count(*) FROM agents;"
```

---

## 7. Troubleshooting

### Common Issues and Solutions

#### Container Won't Start

**Symptoms:** Container exits immediately or keeps restarting

**Diagnosis:**
```bash
# Check container logs
docker-compose logs mission-control

# Check exit code
docker-compose ps
```

**Solutions:**
- Verify environment variables are set correctly
- Check for missing dependencies
- Ensure ports are not already in use
- Verify Docker has sufficient resources

#### SSL Certificate Problems

**Symptoms:** Browser shows certificate warning, Caddy logs show errors

**Diagnosis:**
```bash
# Check Caddy logs
docker-compose logs caddy

# Test certificate
curl -vI https://vogalingo.win 2>&1 | grep -i certificate
```

**Solutions:**
1. **Rate limiting:** Let's Encrypt has rate limits. Wait if you've requested too many certificates.
2. **DNS not propagated:** Verify DNS is pointing to correct IP:
   ```bash
   dig vogalingo.win
   ```
3. **Port blocked:** Ensure ports 80/443 are accessible:
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```
4. **Clear Caddy certificate cache:**
   ```bash
   docker-compose down
   docker volume rm openclaw-mission-control_caddy_data
   docker-compose up -d
   ```

#### Database Connection Issues

**Symptoms:** Application shows database errors, Prisma connection fails

**Diagnosis:**
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check PostgreSQL logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres psql -U nhan -d openclaw_mission_control -c "SELECT 1;"
```

**Solutions:**
1. **Wrong connection string:** Verify `DATABASE_URL` in `.env.production`
2. **PostgreSQL not ready:** Wait for PostgreSQL to fully start
3. **Database doesn't exist:**
   ```bash
   docker-compose exec postgres psql -U nhan -c "CREATE DATABASE openclaw_mission_control;"
   ```
4. **Run migrations:**
   ```bash
   docker-compose exec mission-control npx prisma migrate deploy
   ```

#### Application Returns 500 Errors

**Symptoms:** HTTP 500 errors, application crashes

**Diagnosis:**
```bash
# Check application logs
docker-compose logs -f mission-control

# Check for unhandled errors
docker-compose logs mission-control | grep -i error
```

**Solutions:**
- Check environment variables are correct
- Verify database schema is up to date
- Check for missing files or permissions issues
- Restart the application:
  ```bash
  docker-compose restart mission-control
  ```

#### Port Already in Use

**Symptoms:** Docker fails to start, port binding errors

**Diagnosis:**
```bash
# Find process using port
sudo lsof -i :80
sudo lsof -i :443
sudo lsof -i :3000
```

**Solutions:**
- Stop conflicting service
- Change ports in `docker-compose.yml`
- Kill process using the port:
  ```bash
  sudo kill -9 <PID>
  ```

### Debug Mode

Enable debug logging for more information:

```bash
# Set debug environment variable
DEBUG=* docker-compose up

# Or add to .env.production
NODE_ENV=development
```

### Getting Help

If issues persist:

1. Collect diagnostic information:
   ```bash
   # System info
   docker info > debug_info.txt
   
   # Container status
   docker-compose ps >> debug_info.txt
   
   # All logs
   docker-compose logs >> debug_info.txt
   ```

2. Check GitHub issues for similar problems
3. Contact support with the collected diagnostic information

---

## Quick Reference Commands

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Restart a specific service
docker-compose restart mission-control

# View logs
docker-compose logs -f mission-control

# Run migrations
docker-compose exec mission-control npx prisma migrate deploy

# Create backup
docker-compose exec postgres pg_dump -U nhan openclaw_mission_control > backup.sql

# Check SSL
docker-compose logs caddy | grep -i certificate

# Shell into container
docker-compose exec mission-control /bin/bash
```
