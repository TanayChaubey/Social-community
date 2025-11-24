# Defence Brats Social Network

A production-ready, security-hardened, privacy-aware social networking platform specifically designed for children of defence personnel. Built with Next.js, TypeScript, MongoDB, and WebSockets.

## 🚀 Features

### Core Social Features
- **User Profiles** - Secure user registration and profiles with military base affiliations
- **Posts & Feed** - Create, share, and interact with posts (public, friends, private visibility)
- **Real-time Chat** - Instant messaging with typing indicators and read receipts
- **Comments & Likes** - Engage with content through comments and reactions
- **Notifications** - Real-time notifications for all interactions

### Security & Privacy
- **Strong Authentication** - JWT access tokens (15min) + refresh tokens (7 days) with rotation
- **Password Security** - Argon2id hashing with account lockout protection
- **Input Validation** - Comprehensive Zod schemas to prevent XSS and injection attacks
- **Rate Limiting** - Configurable rate limiting on all endpoints
- **Privacy Controls** - Private accounts, post visibility controls, and content filtering
- **GDPR Compliance** - Data export, deletion, and privacy-by-design principles

### Military Community Features
- **Base Location Networking** - Connect with others at the same military base
- **Service Branch Affiliation** - Army, Navy, Air Force, Marines, Coast Guard, Space Force
- **Moderation System** - Content moderation with reporting and admin tools
- **Age-Appropriate** - COPPA compliance with enhanced safety for minors

### Technical Features
- **Real-time Communication** - WebSocket server with Redis pub/sub scaling
- **File Uploads** - Secure S3 integration with metadata stripping
- **Docker Support** - Multi-stage builds for production and development
- **TypeScript** - Full type safety across the application
- **Database Design** - MongoDB with Mongoose for flexible schema evolution

## 🛠 Technology Stack

### Frontend
- **Next.js 16.0.1** - React framework with App Router
- **React 19.2.0** - UI library with hooks
- **TypeScript 5** - Type-safe development
- **TailwindCSS 4** - Utility-first styling
- **Zustand** - State management
- **React Query** - Server state management
- **React Hook Form** - Form handling

### Backend
- **Node.js** - Runtime environment
- **Express** - API server (for WebSocket server)
- **MongoDB** - Document database
- **Mongoose** - ODM for MongoDB
- **Redis** - Caching and session storage
- **JWT** - Authentication tokens
- **Argon2** - Password hashing
- **Zod** - Runtime validation

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Multi-service orchestration
- **AWS S3** - File storage
- **WebSocket (ws)** - Real-time communication

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication pages
│   ├── api/               # API routes
│   │   ├── auth/         # Authentication endpoints
│   │   ├── posts/        # Post management
│   │   ├── chat/         # Messaging endpoints
│   │   ├── upload/       # File upload handling
│   │   └── health/       # Health check endpoint
│   ├── dashboard/         # Main feed
│   ├── chat/              # Messages interface
│   └── profile/           # User profiles
├── components/            # React components
│   ├── auth/              # Login/Register forms
│   ├── posts/             # Post feed and creation
│   ├── chat/              # Real-time messaging
│   └── ui/                # Shared UI components
├── lib/                   # Utilities and configurations
│   ├── auth.ts            # Authentication utilities
│   ├── db.ts              # Database connection
│   ├── redis.ts           # Redis client
│   ├── validations.ts     # Zod schemas
│   └── websocket-server.ts # WebSocket server
├── models/                # Mongoose schemas
│   ├── User.ts            # User model
│   ├── Post.ts            # Post model
│   ├── Conversation.ts    # Chat conversation model
│   ├── Message.ts         # Chat message model
│   └── Notification.ts    # Notification model
├── middleware/            # Express middleware
│   └── auth.ts            # Authentication middleware
├── hooks/                 # Custom React hooks
├── stores/                # Zustand state management
└── types/                 # TypeScript type definitions
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- MongoDB (or use Docker)
- Redis (or use Docker)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Social-community
   ```

2. **Copy environment variables**
   ```bash
   cp .env.example .env.local
   ```

3. **Configure environment variables**
   Edit `.env.local` with your configuration:
   ```env
   MONGODB_URL=mongodb://localhost:27017/defence-brats
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=your-super-secret-jwt-key
   JWT_REFRESH_SECRET=your-super-secret-refresh-key
   ```

4. **Install dependencies**
   ```bash
   npm install
   ```

5. **Start development services**
   ```bash
   npm run docker:dev
   ```

6. **Run the application**
   ```bash
   npm run dev
   ```

7. **Start WebSocket server** (in another terminal)
   ```bash
   npm run websocket:dev
   ```

The application will be available at:
- **Web App**: http://localhost:3000
- **WebSocket**: ws://localhost:3001
- **MongoDB Express**: http://localhost:8081
- **Redis Commander**: http://localhost:8082

### Production Setup

1. **Configure production environment**
   ```bash
   cp .env.example .env.production
   ```

2. **Set strong secrets**
   ```bash
   openssl rand -base64 32  # For JWT secrets
   ```

3. **Build and deploy**
   ```bash
   npm run build
   npm run docker:prod
   ```

## 📚 API Documentation

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `DELETE /api/auth/logout` - User logout
- `POST /api/auth/verify-email` - Email verification

### Posts
- `GET /api/posts` - Get posts feed
- `POST /api/posts` - Create new post
- `GET /api/posts/[postId]` - Get specific post
- `PUT /api/posts/[postId]` - Update post
- `DELETE /api/posts/[postId]` - Delete post
- `POST /api/posts/[postId]/like` - Like/unlike post
- `GET /api/posts/[postId]/comments` - Get post comments
- `POST /api/posts/[postId]/comments` - Add comment

### Health & Monitoring
- `GET /api/health` - Basic health check
- `POST /api/health` - Detailed health check

## 🛡 Security Features

### Authentication & Authorization
- **JWT Access Tokens**: 15-minute expiry with automatic refresh
- **Refresh Tokens**: 7-day expiry with rotation and blacklisting
- **Password Security**: Argon2id hashing with configurable rounds
- **Account Lockout**: 10 failed attempts trigger 15-minute lockout
- **Email Verification**: Required for full platform access

### Input Validation & Sanitization
- **Zod Schemas**: Comprehensive runtime validation for all inputs
- **XSS Prevention**: Content sanitization and script tag removal
- **SQL Injection**: Prevented through Mongoose ODM
- **File Upload Security**: MIME type validation, size limits, metadata stripping

### Rate Limiting
- **Login Attempts**: 5 per minute per IP
- **Registration**: 3 per 5 minutes per IP
- **Messages**: 30 per minute per user
- **Posts**: 5 per 5 minutes per user
- **Uploads**: 10 per 5 minutes per user

### Privacy Controls
- **Private Accounts**: Users can set profiles to private
- **Post Visibility**: Public, friends-only, or private posts
- **Data Export**: GDPR-compliant data export
- **Account Deletion**: Complete data deletion on request
- **No Personal Data in Logs**: Sensitive information never logged

## 🔧 Configuration

### Environment Variables

Key configuration options:

```env
# Database
MONGODB_URL=mongodb://localhost:27017/defence-brats
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key-min-32-characters
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-characters

# File Storage
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
S3_BUCKET_NAME=defence-brats-uploads

# Application
NODE_ENV=development
PORT=3000
WS_PORT=3001
NEXTAUTH_URL=http://localhost:3000
```

See `.env.example` for all available options.

### Docker Configuration

The project includes comprehensive Docker setup:

- **Dockerfile**: Multi-stage production build
- **Dockerfile.dev**: Development build with hot reloading
- **docker-compose.yml**: Production services
- **docker-compose.dev.yml**: Development services with debugging tools

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix
```

## 📊 Monitoring & Logging

### Health Checks
- Basic health endpoint: `GET /api/health`
- Detailed health with stats: `POST /api/health`
- WebSocket health check: `GET http://localhost:3001/health`

### Logging
- Structured logging with no personal data
- Security event tracking
- Performance monitoring integration ready
- Error tracking with Sentry support

### Performance Monitoring
- Database connection health
- Redis connection health
- WebSocket server statistics
- Memory and CPU usage tracking

## 🔒 Security Notes

### Production Deployment Checklist

- [ ] Set strong, unique JWT secrets (32+ characters)
- [ ] Configure secure MongoDB authentication
- [ ] Enable Redis password protection
- [ ] Set up HTTPS with valid SSL certificates
- [ ] Configure CORS for your domain
- [ ] Set up backup strategy for MongoDB
- [ ] Configure log rotation and monitoring
- [ ] Set up intrusion detection
- [ ] Review and update rate limits
- [ ] Test security configurations

### Common Security Pitfalls to Avoid

- ❌ Never commit `.env` files or secrets to version control
- ❌ Never use default passwords in production
- ❌ Never disable input validation
- ❌ Never log sensitive user data
- ❌ Never use JWT secrets shorter than 32 characters
- ❌ Never disable rate limiting in production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript strict mode
- Write comprehensive tests for new features
- Ensure all inputs are validated
- Add security comments for sensitive operations
- Update documentation for API changes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For security issues, please email security@defencebrats.com

For general support and questions, please create an issue in the repository.

## 🙏 Acknowledgments

- Built for the defence community
- Security-first development approach
- Privacy-by-design principles
- COPPA compliance for minor protection
