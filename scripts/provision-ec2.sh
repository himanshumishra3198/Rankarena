#!/bin/bash
# Run this ONCE on a fresh Ubuntu 22.04 EC2 instance.
# ssh ubuntu@<EC2_IP> then paste this script.
set -e

echo "── 1. System update ─────────────────────────────────────────────"
# DEBIAN_FRONTEND=noninteractive suppresses the needrestart prompt after upgrades
sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

echo "── 2. Install Docker ────────────────────────────────────────────"
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow ubuntu user to run docker without sudo
sudo usermod -aG docker ubuntu
newgrp docker

echo "── 3. Install AWS CLI ───────────────────────────────────────────"
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
sudo /tmp/aws/install
rm -rf /tmp/awscliv2.zip /tmp/aws

echo "── 4. Configure AWS CLI (for ECR pull) ──────────────────────────"
# The EC2 instance should use an IAM Role with AmazonEC2ContainerRegistryReadOnly
# If using IAM role (recommended): nothing to do here, AWS CLI auto-uses the role
# If using access keys (not recommended): run `aws configure` manually

echo "── 5. Create project directory ──────────────────────────────────"
mkdir -p /home/ubuntu/rankarena
cd /home/ubuntu/rankarena

echo "── 6. Create .env from example ──────────────────────────────────"
cat > .env << 'EOF'
ECR_REGISTRY=REPLACE_WITH_YOUR_ECR_REGISTRY
IMAGE_TAG=latest

DATABASE_URL=postgresql://rankarena:REPLACE_PASSWORD@postgres:5432/rankarena
JWT_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET
CORS_ORIGIN=https://rankarena.in,https://admin.rankarena.in

POSTGRES_DB=rankarena
POSTGRES_USER=rankarena
POSTGRES_PASSWORD=REPLACE_PASSWORD
EOF

echo ""
echo "!! Edit /home/ubuntu/rankarena/.env with your actual values before deploying !!"
echo ""

echo "── 7. Setup Let's Encrypt SSL ───────────────────────────────────"
sudo apt-get install -y certbot

# Point your DNS A records to this EC2 IP BEFORE running these commands.
# Replace rankarena.in with your actual domain.

# Temporarily allow port 80 in EC2 security group, then run:
# sudo certbot certonly --standalone \
#   -d rankarena.in \
#   -d www.rankarena.in \
#   -d api.rankarena.in \
#   -d admin.rankarena.in \
#   --email your@email.com \
#   --agree-tos \
#   --non-interactive

# Set up auto-renewal
echo "0 12 * * * root certbot renew --quiet --deploy-hook 'docker compose -f /home/ubuntu/rankarena/docker-compose.prod.yml restart proxy'" \
  | sudo tee /etc/cron.d/certbot-renew

echo "── 8. EC2 Security Group (configure in AWS Console) ────────────"
echo "Inbound rules required:"
echo "  Port 22   (SSH)   - your IP only"
echo "  Port 80   (HTTP)  - 0.0.0.0/0"
echo "  Port 443  (HTTPS) - 0.0.0.0/0"
echo ""
echo "Provisioning complete. Now:"
echo "  1. Edit .env with real values"
echo "  2. Run certbot to get SSL certs (see step 7 above)"
echo "  3. Push to main branch — GitHub Actions will deploy automatically"
