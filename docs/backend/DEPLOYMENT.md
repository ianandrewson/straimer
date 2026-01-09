# Deployment Guide - Raspberry Pi

This guide covers deploying Straimer to a Raspberry Pi for production use.

## Prerequisites

### Hardware Requirements
- **Raspberry Pi 4** (recommended) or Raspberry Pi 3B+
- Minimum 2GB RAM (4GB recommended)
- MicroSD card (32GB+ recommended)
- Stable power supply (5V 3A for Pi 4)
- Ethernet connection (recommended for stability)

### Software Requirements
- **Raspberry Pi OS** (64-bit recommended)
- **Node.js** 20.x or higher
- **ffmpeg** 4.x or higher
- **Yarn** package manager

## Initial Setup

### 1. Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Node.js

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v20.x.x
npm --version
```

### 3. Install Yarn

```bash
npm install -g yarn
yarn --version
```

### 4. Install ffmpeg

```bash
sudo apt install -y ffmpeg

# Verify installation
ffmpeg -version
```

### 5. Create Application User

```bash
sudo useradd -r -s /bin/bash -d /opt/straimer straimer
sudo mkdir -p /opt/straimer
sudo chown straimer:straimer /opt/straimer
```

## Application Deployment

### 1. Clone Repository

```bash
sudo -u straimer git clone https://github.com/yourusername/straimer.git /opt/straimer/app
cd /opt/straimer/app
```

### 2. Install Dependencies

```bash
sudo -u straimer yarn install
```

### 3. Build Application

```bash
sudo -u straimer yarn build:backend
```

### 4. Configure Environment

```bash
sudo -u straimer cp backend/.env.example backend/.env
sudo -u straimer nano backend/.env
```

**Production environment variables:**

```bash
# Server
PORT=3000
NODE_ENV=production

# Security - CHANGE THIS!
API_KEY=your-secure-api-key-here-use-strong-random-string

# Paths
AUDIO_LIBRARY_PATH=/opt/straimer/data/audio-library.json
AUDIO_FILES_ROOT=/opt/straimer/media

# Session (adjust based on your needs)
SESSION_IDLE_TIMEOUT_MS=300000      # 5 minutes
SESSION_CLEANUP_INTERVAL_MS=60000   # 1 minute

# Streaming
HLS_SEGMENT_DURATION=10
HLS_BITRATES=64,128,256,320

# Logging
LOG_LEVEL=info
```

### 5. Create Media Directories

```bash
sudo mkdir -p /opt/straimer/media
sudo mkdir -p /opt/straimer/data
sudo chown -R straimer:straimer /opt/straimer/media
sudo chown -R straimer:straimer /opt/straimer/data
```

### 6. Create Audio Library

```bash
sudo -u straimer nano /opt/straimer/data/audio-library.json
```

**Example:**

```json
{
  "files": [
    {
      "id": "podcast-001",
      "title": "Episode 1: Introduction",
      "path": "/opt/straimer/media/podcast-ep001.mp3",
      "duration": 3600,
      "metadata": {
        "artist": "Your Podcast",
        "album": "Season 1"
      }
    }
  ]
}
```

## Systemd Service Setup

### 1. Create Service File

```bash
sudo nano /etc/systemd/system/straimer.service
```

**Service configuration:**

```ini
[Unit]
Description=Straimer HLS Streaming Server
After=network.target

[Service]
Type=simple
User=straimer
Group=straimer
WorkingDirectory=/opt/straimer/app/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=straimer

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/straimer/data /tmp

# Resource limits
LimitNOFILE=65536
MemoryMax=1G

# Environment
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 2. Enable and Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable straimer
sudo systemctl start straimer
```

### 3. Check Service Status

```bash
sudo systemctl status straimer
sudo journalctl -u straimer -f  # Follow logs
```

## Nginx Reverse Proxy (Recommended)

### 1. Install Nginx

```bash
sudo apt install -y nginx
```

### 2. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/straimer
```

**Configuration:**

```nginx
upstream straimer_backend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;  # Change this

    client_max_body_size 10M;

    # Logging
    access_log /var/log/nginx/straimer_access.log;
    error_log /var/log/nginx/straimer_error.log;

    # Health check
    location /health {
        proxy_pass http://straimer_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # API endpoints
    location /api/ {
        proxy_pass http://straimer_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Streaming endpoints
    location /stream/ {
        proxy_pass http://straimer_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # HLS streaming optimizations
        proxy_buffering off;
        proxy_cache off;

        # CORS for HLS
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, OPTIONS";
        add_header Access-Control-Allow-Headers "Authorization, Range";
    }
}
```

### 3. Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/straimer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Optional: SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Firewall Configuration

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

## Performance Tuning

### 1. Increase File Limits

```bash
sudo nano /etc/security/limits.conf
```

Add:

```
straimer soft nofile 65536
straimer hard nofile 65536
```

### 2. Optimize System Settings

```bash
sudo nano /etc/sysctl.conf
```

Add:

```
# Network tuning
net.core.somaxconn = 1024
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.ip_local_port_range = 10000 65000

# Memory
vm.swappiness = 10
```

Apply:

```bash
sudo sysctl -p
```

## Monitoring

### 1. View Logs

```bash
# Service logs
sudo journalctl -u straimer -f

# Nginx logs
sudo tail -f /var/log/nginx/straimer_access.log
sudo tail -f /var/log/nginx/straimer_error.log
```

### 2. Check Resource Usage

```bash
# Memory and CPU
htop

# Disk usage
df -h

# Service status
sudo systemctl status straimer
```

### 3. Check Active Sessions

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost/api/sessions
```

## Backup Strategy

### 1. Backup Audio Library

```bash
sudo cp /opt/straimer/data/audio-library.json \
  /opt/straimer/data/audio-library.json.backup.$(date +%Y%m%d)
```

### 2. Backup Configuration

```bash
sudo cp backend/.env backend/.env.backup
```

### 3. Automated Backup Script

```bash
sudo nano /opt/straimer/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/straimer/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup library
cp /opt/straimer/data/audio-library.json \
  $BACKUP_DIR/audio-library_$DATE.json

# Keep only last 7 days
find $BACKUP_DIR -name "audio-library_*.json" -mtime +7 -delete
```

```bash
sudo chmod +x /opt/straimer/backup.sh
sudo crontab -e -u straimer
```

Add:

```
0 2 * * * /opt/straimer/backup.sh
```

## Maintenance

### 1. Update Application

```bash
cd /opt/straimer/app
sudo -u straimer git pull
sudo -u straimer yarn install
sudo -u straimer yarn build:backend
sudo systemctl restart straimer
```

### 2. View Memory Usage

```bash
curl http://localhost/health | jq '.memory'
```

### 3. Reload Audio Library

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  -X POST http://localhost/api/library/reload
```

### 4. Terminate All Sessions

```bash
# Get all sessions
SESSIONS=$(curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost/api/sessions | jq -r '.sessions[].sessionId')

# Terminate each
for sid in $SESSIONS; do
  curl -H "Authorization: Bearer YOUR_API_KEY" \
    -X DELETE http://localhost/api/sessions/$sid
done
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
sudo journalctl -u straimer -n 50

# Check if port is available
sudo netstat -tlnp | grep 3000

# Check permissions
ls -la /opt/straimer/app/backend/dist/
```

### High Memory Usage

```bash
# Check memory
free -h

# Check sessions
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost/api/sessions | jq '.stats'

# Restart service
sudo systemctl restart straimer
```

### ffmpeg Issues

```bash
# Check if ffmpeg is available
which ffmpeg
ffmpeg -version

# Check if straimer user can access ffmpeg
sudo -u straimer ffmpeg -version

# Check audio file permissions
sudo -u straimer ls -la /opt/straimer/media/
```

### No Audio Output

```bash
# Test audio file manually
ffmpeg -i /opt/straimer/media/test.mp3 -t 10 -f null -

# Check session status
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost/api/sessions/YOUR_SESSION_ID

# Check logs for ffmpeg errors
sudo journalctl -u straimer | grep ffmpeg
```

## Security Hardening

### 1. Change Default API Key

Always use a strong, random API key in production:

```bash
# Generate secure key
openssl rand -base64 32
```

### 2. Restrict Network Access

Only allow access from specific IPs:

```bash
sudo ufw allow from YOUR_IP_ADDRESS to any port 80
sudo ufw allow from YOUR_IP_ADDRESS to any port 443
```

### 3. Regular Updates

```bash
sudo apt update && sudo apt upgrade -y
```

## Support

For issues and questions:
- Check logs: `sudo journalctl -u straimer -f`
- Review [CLAUDE.md](./CLAUDE.md) for development guidance
- See [backend/tests/API-TEST.md](./backend/tests/API-TEST.md) for API testing

## Performance Expectations

On Raspberry Pi 4 (4GB):
- **Concurrent streams**: 5-10 (depending on bitrates)
- **Memory usage**: 200-500MB typical
- **CPU usage**: 20-40% per active stream
- **Network**: ~256kbps per stream (highest quality)
