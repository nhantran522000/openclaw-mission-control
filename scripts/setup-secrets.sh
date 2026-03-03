#!/bin/bash

# =============================================================================
# GitHub Secrets Setup Script
# =============================================================================
# This script helps you set up SSH keys and configure GitHub secrets for CI/CD

set -e

echo "======================================"
echo "GitHub Secrets Setup"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Generate SSH key pair if not exists
echo "Step 1: Setting up SSH key for deployment"
echo "-------------------------------------------"

SSH_DIR="$HOME/.ssh/gh-deploy"
SSH_PRIVATE_KEY="$SSH_DIR/id_ed25519"
SSH_PUBLIC_KEY="$SSH_DIR/id_ed25519.pub"

if [ ! -f "$SSH_PRIVATE_KEY" ]; then
    echo -e "${YELLOW}Generating new SSH key pair...${NC}"
    mkdir -p "$SSH_DIR"
    ssh-keygen -t ed25519 -C "github-deploy@openclaw-mission-control" -f "$SSH_PRIVATE_KEY" -N ""
    chmod 600 "$SSH_PRIVATE_KEY"
    chmod 644 "$SSH_PUBLIC_KEY"
    echo -e "${GREEN}✓ SSH key pair generated${NC}"
else
    echo -e "${GREEN}✓ SSH key already exists at $SSH_PRIVATE_KEY${NC}"
fi

echo ""
echo "Public SSH key (copy this):"
echo "-------------------------------------------"
cat "$SSH_PUBLIC_KEY"
echo "-------------------------------------------"

# Step 2: Add public key to authorized_keys
echo ""
echo "Step 2: Adding SSH key to authorized_keys"
echo "-------------------------------------------"

AUTHORIZED_KEYS="$HOME/.ssh/authorized_keys"
if grep -q "$(cat $SSH_PUBLIC_KEY)" "$AUTHORIZED_KEYS" 2>/dev/null; then
    echo -e "${GREEN}✓ SSH key already in authorized_keys${NC}"
else
    echo "" >> "$AUTHORIZED_KEYS"
    cat "$SSH_PUBLIC_KEY" >> "$AUTHORIZED_KEYS"
    chmod 600 "$AUTHORIZED_KEYS"
    echo -e "${GREEN}✓ SSH key added to authorized_keys${NC}"
fi

# Step 3: Test SSH connection
echo ""
echo "Step 3: Testing SSH connection"
echo "-------------------------------------------"

HOSTNAME=$(hostname)
IP_ADDRESS=$(hostname -I | awk '{print $1}')

echo "Testing: ssh localhost -i $SSH_PRIVATE_KEY"
if ssh -i "$SSH_PRIVATE_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null localhost echo "SSH connection successful"; then
    echo -e "${GREEN}✓ SSH connection test successful${NC}"
else
    echo -e "${RED}✗ SSH connection test failed${NC}"
    exit 1
fi

# Step 4: Display GitHub secrets configuration
echo ""
echo "======================================"
echo "GitHub Secrets to Configure"
echo "======================================"
echo ""

echo "Run these commands to set GitHub secrets:"
echo "-------------------------------------------"
echo ""

echo "1. SSH Private Key:"
echo "   gh secret set SSH_PRIVATE_KEY < $SSH_PRIVATE_KEY"
echo ""

echo "2. Server Host:"
echo "   gh secret set SERVER_HOST -b '$IP_ADDRESS'"
echo ""

echo "3. Server User:"
echo "   gh secret set SERVER_USER -b '$(whoami)'"
echo ""

echo "4. PostgreSQL Password:"
echo "   gh secret set POSTGRES_PASSWORD -b 'mxG.874iEu/!'"
echo ""

echo "5. Admin API Key (generate new):"
echo "   gh secret set ADMIN_API_KEY -b '$(openssl rand -hex 32)'"
echo ""

echo "6. JWT Secret (generate new):"
echo "   gh secret set JWT_SECRET -b '$(openssl rand -hex 32)'"
echo ""

# Step 5: Optional: Auto-set secrets
echo ""
echo "======================================"
echo "Auto-configure Secrets?"
echo "======================================"
read -p "Do you want to automatically set GitHub secrets now? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Setting secrets..."

    gh secret set SSH_PRIVATE_KEY < "$SSH_PRIVATE_KEY"
    echo -e "${GREEN}✓ SSH_PRIVATE_KEY set${NC}"

    gh secret set SERVER_HOST -b "$IP_ADDRESS"
    echo -e "${GREEN}✓ SERVER_HOST set${NC}"

    gh secret set SERVER_USER -b "$(whoami)"
    echo -e "${GREEN}✓ SERVER_USER set${NC}"

    gh secret set POSTGRES_PASSWORD -b "mxG.874iEu/!"
    echo -e "${GREEN}✓ POSTGRES_PASSWORD set${NC}"

    ADMIN_KEY=$(openssl rand -hex 32)
    gh secret set ADMIN_API_KEY -b "$ADMIN_KEY"
    echo -e "${GREEN}✓ ADMIN_API_KEY set${NC}"
    echo "   Save this key: $ADMIN_KEY"

    JWT_SECRET=$(openssl rand -hex 32)
    gh secret set JWT_SECRET -b "$JWT_SECRET"
    echo -e "${GREEN}✓ JWT_SECRET set${NC}"

    echo ""
    echo -e "${GREEN}======================================"
    echo "All secrets configured successfully!"
    echo "======================================${NC}"
else
    echo "Skipped auto-configuration. Run the commands above manually."
fi

# Step 6: Update .env.production
echo ""
echo "Step 6: Updating .env.production"
echo "-------------------------------------------"

ENV_FILE=".env.production"
cat > "$ENV_FILE" << EOF
# Database
POSTGRES_PASSWORD=mxG.874iEu/!
DATABASE_URL=postgresql://nhan:\${POSTGRES_PASSWORD}@postgres:5432/postgres?schema=openclaw_mission_control

# Application
PORT=3000
NODE_ENV=production

# Docker Image
DOCKER_IMAGE=ghcr.io/nhantran522000/openclaw-mission-control:latest

# Authentication (auto-generated, update after setting secrets)
ADMIN_API_KEY=your-admin-api-key-here
JWT_SECRET=your-jwt-secret-here
EOF

echo -e "${GREEN}✓ .env.production updated${NC}"

# Step 7: Create deployment script
echo ""
echo "Step 7: Creating deployment script"
echo "-------------------------------------------"

DEPLOY_SCRIPT="scripts/deploy.sh"
cat > "$DEPLOY_SCRIPT" << 'EOF'
#!/bin/bash

# Deployment script for manual deployment to production

set -e

echo "======================================"
echo "Deploying OpenClaw Mission Control"
echo "======================================"
echo ""

cd "$(dirname "$0")/.."

# Pull latest code
echo "Pulling latest code..."
git pull origin main

# Pull latest Docker image
echo "Pulling latest Docker image..."
docker pull ghcr.io/nhantran522000/openclaw-mission-control:latest

# Restart services
echo "Restarting services..."
docker-compose up -d --force-recreate

# Run database migrations
echo "Running database migrations..."
docker-compose exec -T mission-control npx prisma migrate deploy

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 10

# Check service status
echo ""
echo "Service status:"
docker-compose ps

# Health check
echo ""
echo "Health check..."
if curl -f https://vogalingo.win/api/health; then
    echo -e "\n✓ Deployment successful!"
else
    echo -e "\n✗ Health check failed"
    exit 1
fi
EOF

chmod +x "$DEPLOY_SCRIPT"
echo -e "${GREEN}✓ Deployment script created at $DEPLOY_SCRIPT${NC}"

# Summary
echo ""
echo "======================================"
echo "Setup Complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Push code to GitHub: git push origin main"
echo "2. GitHub Actions will automatically:"
echo "   - Run tests"
echo "   - Build Docker image"
echo "   - Push to GHCR"
echo "   - Deploy to server"
echo ""
echo "Or deploy manually: ./scripts/deploy.sh"
echo ""
echo "Monitor CI/CD: gh run list --repo nhantran522000/openclaw-mission-control"
echo "View workflow: https://github.com/nhantran522000/openclaw-mission-control/actions"
echo ""
