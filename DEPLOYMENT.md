# Defence Brats Social Network - Deployment Guide

This comprehensive guide covers everything you need to deploy the Defence Brats social networking platform to production.

## 🚀 Quick Deployment with Docker

### Prerequisites
- Docker & Docker Compose installed
- Node.js 20+ (for local development)
- MongoDB 7.0+ (or use Docker)
- Redis 7.2+ (or use Docker)
- AWS S3 bucket (for file storage)

### Production Deployment

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd Social-community
   cp .env.example .env.local
   ```

2. **Configure Environment Variables**
   ```bash
   # Edit .env.local with your production settings
   nano .env.local
   ```

   Critical variables to set:
   ```env
   NODE_ENV=production
   JWT_SECRET=your-super-secret-jwt-key-min-32-characters
   JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-characters
   MONGODB_URL=mongodb://username:password@your-mongodb-host/defence-brats
   REDIS_URL=redis://your-redis-host:6379
   AWS_ACCESS_KEY_ID=your-aws-access-key
   AWS_SECRET_ACCESS_KEY=your-aws-secret-key
   AWS_REGION=us-east-1
   S3_BUCKET_NAME=defence-brats-uploads
   NEXTAUTH_URL=https://yourdomain.com
   ```

3. **Build and Deploy**
   ```bash
   npm install
   npm run build
   npm run docker:prod
   ```

4. **Verify Deployment**
   ```bash
   # Check all services are running
   docker-compose ps

   # Run health checks
   npm run healthcheck

   # Check logs
   docker-compose logs -f
   ```

## 🐳 Docker Deployment Options

### Option 1: Docker Compose (Recommended)

```bash
# Production deployment with all services
docker-compose up --build -d

# Scale application instances if needed
docker-compose up --build -d --scale app=3

# Stop and remove containers
docker-compose down
```

### Option 2: Individual Services

```bash
# Build application image
docker build -t defence-brats:latest .

# Run application
docker run -d \
  --name defence-brats-app \
  -p 3000:3000 \
  --env-file .env.production \
  defence-brats:latest

# Run WebSocket server
docker run -d \
  --name defence-brats-websocket \
  -p 3001:3001 \
  --env-file .env.production \
  defence-brats:latest \
  npm run websocket
```

## 🗄️ Database Setup

### MongoDB Setup

#### Option 1: Self-hosted MongoDB
```bash
# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
sudo apt-get install gnupg
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### Option 2: MongoDB Atlas (Recommended for production)
1. Create a free MongoDB Atlas account
2. Create a new cluster
3. Get connection string and add to `.env.local`
4. Configure IP access and database user

#### Option 3: MongoDB Docker
```yaml
# Add to docker-compose.yml
mongodb:
  image: mongo:7.0
  container_name: defence-brats-mongodb
  restart: unless-stopped
  ports:
    - "27017:27017"
  environment:
    MONGO_INITDB_ROOT_USERNAME: admin
    MONGO_INITDB_ROOT_PASSWORD: securepassword
    MONGO_INITDB_DATABASE: defence-brats
  volumes:
    - mongodb_data:/data/db
  command: mongod --auth
```

### Redis Setup

#### Option 1: System Redis
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### Option 2: Redis Docker
```yaml
# Add to docker-compose.yml
redis:
  image: redis:7.2-alpine
  container_name: defence-brats-redis
  restart: unless-stopped
  ports:
    - "6379:6379"
  command: redis-server --requirepass yourpassword
  volumes:
    - redis_data:/data
```

## ☁️ AWS S3 Setup

### Create S3 Bucket
```bash
# Using AWS CLI
aws s3 mb s3://defence-brats-uploads --region us-east-1
aws s3api put-bucket-policy --bucket defence-brats-uploads --policy '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::defence-brats-uploads/*"
    }
  ]
}'
```

### Configure CORS
```bash
# Add CORS configuration to your S3 bucket
aws s3api put-bucket-cors --bucket defence-brats-uploads --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedOrigins": ["https://yourdomain.com"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}'
```

## 🔒 SSL/TLS Setup

### Option 1: Let's Encrypt (Free SSL)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot certonly --standalone -d yourdomain.com

# Combine certificate and key for Node.js
cat /etc/letsencrypt/live/yourdomain.com/fullchain.pem > /etc/ssl/certs/yourdomain-combined.pem
cat /etc/letsencrypt/live/yourdomain.com/privkey.pem >> /etc/ssl/certs/yourdomain-combined.pem
```

### Option 2: Nginx Reverse Proxy
```nginx
# /etc/nginx/sites-available/defence-brats
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Main application
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🚦 Production Considerations

### Security Hardening

1. **Environment Security**
   ```bash
   # Set proper file permissions
   chmod 600 .env.production
   chmod 700 scripts/

   # Use non-root user for containers
   echo "node:x:1000:1000::/home/node:/bin/bash" | sudo tee -a /etc/passwd
   ```

2. **Rate Limiting**
   - Configure firewalls to restrict access
   - Use CloudFlare or similar for DDoS protection
   - Implement application-level rate limiting (already built-in)

3. **Database Security**
   ```bash
   # Create dedicated database users with limited permissions
   use defence-brats
   db.createUser({
     user: "defence-brats-app",
     pwd: passwordPrompt(),
     roles: ["readWrite"]
   });
   ```

### Monitoring & Logging

1. **Application Monitoring**
   ```bash
   # Install PM2 for process management
   npm install -g pm2

   # Start with PM2
   pm2 start npm --name "defence-brats-app" -- start
   pm2 start npm --name "defence-brats-websocket" -- start "run websocket"

   # Enable monitoring
   pm2 install pm2-logrotate
   pm2 install pm2-server-monit
   ```

2. **Log Management**
   ```bash
   # Configure log rotation
   nano /etc/logrotate.d/defence-brats
   ```
   ```
   /var/log/defence-brats/*.log {
       daily
       missingok
       rotate 52
       compress
       notifempty
       create 644 node node
   }
   ```

3. **Health Checks**
   ```bash
   # Create systemd service
   sudo nano /etc/systemd/system/defence-brats.service
   ```
   ```ini
   [Unit]
   Description=Defence Brats Application
   After=network.target

   [Service]
   Type=simple
   User=node
   WorkingDirectory=/home/node/defence-brats
   ExecStart=/usr/bin/npm run start
   Restart=always
   RestartSec=10
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```

### Performance Optimization

1. **Database Optimization**
   ```javascript
   // Create indexes in MongoDB
   db.users.createIndex({ email: 1 }, { unique: true });
   db.posts.createIndex({ "authorId": 1, "createdAt": -1 });
   db.conversations.createIndex({ "participants": 1 });
   db.messages.createIndex({ "conversationId": 1, "createdAt": -1 });
   ```

2. **Caching Strategy**
   - Redis for sessions and real-time data
   - CDN for static assets
   - Application-level caching for frequent queries

3. **Load Balancing**
   ```bash
   # Use multiple app instances
   docker-compose up --scale app=3
   ```

## 🔄 CI/CD Pipeline

### GitHub Actions Example

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run tests
      run: npm test

    - name: Build application
      run: npm run build

    - name: Deploy to production
      run: |
        docker build -t defence-brats:${{ github.sha }} .
        docker tag defence-brats:${{ github.sha }} defence-brats:latest
        docker-compose up -d

    - name: Run health check
      run: npm run healthcheck
```

## 📊 Environment-Specific Configurations

### Development
```env
NODE_ENV=development
SKIP_EMAIL_VERIFICATION=true
LOCAL_DEV_SKIP_AUTH=false
NEXTAUTH_URL=http://localhost:3000
```

### Staging
```env
NODE_ENV=staging
SKIP_EMAIL_VERIFICATION=false
NEXTAUTH_URL=https://staging.defencebrats.com
```

### Production
```env
NODE_ENV=production
SKIP_EMAIL_VERIFICATION=false
NEXTAUTH_URL=https://defencebrats.com
```

## 🔍 Troubleshooting

### Common Issues

1. **Port Conflicts**
   ```bash
   # Check what's using port 3000
   sudo lsof -i :3000

   # Kill process
   sudo kill -9 <PID>
   ```

2. **Database Connection Issues**
   ```bash
   # Check MongoDB logs
   sudo tail -f /var/log/mongodb/mongod.log

   # Test connection
   mongo mongodb://username:password@host:port/database
   ```

3. **WebSocket Connection Issues**
   ```bash
   # Check WebSocket server logs
   docker logs defence-brats-websocket

   # Test WebSocket connection
   wscat -c ws://localhost:3001
   ```

4. **Memory Issues**
   ```bash
   # Check memory usage
   docker stats

   # Limit memory usage
   docker run --memory="2g" defence-brats:latest
   ```

### Performance Monitoring

1. **Application Metrics**
   ```bash
   # PM2 monitoring
   pm2 monit

   # Docker stats
   docker stats
   ```

2. **Database Performance**
   ```bash
   # MongoDB profiler
   db.setProfilingLevel(2);
   ```

3. **Network Performance**
   ```bash
   # Check response times
   curl -w "@%{time_total}" -o /dev/null -s https://yourdomain.com/api/health
   ```

## 📞 Support

### Getting Help

1. **Documentation**
   - Review this deployment guide
   - Check the main README.md
   - Review API documentation in the code

2. **Community Support**
   - Create an issue on GitHub
   - Join our Discord server
   - Email support@defencebrats.com

3. **Emergency Support**
   - Email emergency@defencebrats.com
   - Include deployment details and error logs

---

## ✅ Deployment Checklist

- [ ] Environment variables configured
- [ ] Database connections tested
- [ ] SSL certificates installed
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] Monitoring setup
- [ ] Backups configured
- [ ] Health checks passing
- [ ] Load testing performed
- [ ] Documentation updated
- [ ] Support channels available

Your Defence Brats platform is now ready for production deployment! 🎉