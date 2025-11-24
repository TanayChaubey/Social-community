import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

/**
 * JWT token interface for access tokens
 * Security: Short-lived tokens (15 minutes) for API access
 */
export interface JWTPayload {
  userId: string;
  email: string;
  username: string;
  role: 'user' | 'moderator' | 'admin';
  iat?: number;
  exp?: number;
}

/**
 * JWT token interface for refresh tokens
 * Security: Longer-lived tokens (7 days) for token rotation
 */
export interface RefreshTokenPayload {
  userId: string;
  tokenId: string; // Unique identifier for token tracking
  iat?: number;
  exp?: number;
}

/**
 * Authentication utilities class
 * Security: Centralized JWT management with token rotation
 * Privacy: Minimal payload data, no sensitive information
 */
class AuthUtils {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;

  constructor() {
    this.accessTokenSecret = process.env.JWT_SECRET || 'your-access-secret-key';
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
    this.accessTokenExpiry = '15m'; // 15 minutes
    this.refreshTokenExpiry = '7d'; // 7 days

    // Validate secrets in production
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error('JWT_SECRET must be at least 32 characters in production');
      }
      if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
        throw new Error('JWT_REFRESH_SECRET must be at least 32 characters in production');
      }
    }
  }

  /**
   * Generate access token for API authentication
   * Security: Short expiry, minimal payload
   */
  generateAccessToken(user: {
    _id: Types.ObjectId;
    email: string;
    username: string;
    role: string;
  }): string {
    const payload: JWTPayload = {
      userId: user._id.toString(),
      email: user.email,
      username: user.username,
      role: user.role as 'user' | 'moderator' | 'admin',
    };

    return jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'defence-brats',
      audience: 'defence-brats-users',
      algorithm: 'HS256',
    });
  }

  /**
   * Generate refresh token for token rotation
   * Security: Unique tokenId for tracking and revocation
   */
  generateRefreshToken(userId: string): { token: string; tokenId: string } {
    const tokenId = new Types.ObjectId().toString(); // Unique identifier
    const payload: RefreshTokenPayload = {
      userId,
      tokenId,
    };

    const token = jwt.sign(payload, this.refreshTokenSecret, {
      expiresIn: this.refreshTokenExpiry,
      issuer: 'defence-brats',
      audience: 'defence-brats-refresh',
      algorithm: 'HS256',
    });

    return { token, tokenId };
  }

  /**
   * Verify access token
   * Security: Returns null for invalid tokens
   */
  verifyAccessToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'defence-brats',
        audience: 'defence-brats-users',
        algorithms: ['HS256'],
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      console.error('Access token verification failed:', error);
      return null;
    }
  }

  /**
   * Verify refresh token
   * Security: Returns null for invalid tokens
   */
  verifyRefreshToken(token: string): RefreshTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        issuer: 'defence-brats',
        audience: 'defence-brats-refresh',
        algorithms: ['HS256'],
      }) as RefreshTokenPayload;

      return decoded;
    } catch (error) {
      console.error('Refresh token verification failed:', error);
      return null;
    }
  }

  /**
   * Extract token from Authorization header
   * Security: Supports Bearer token format
   */
  extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * Extract token from query parameters (for WebSocket)
   * Security: Fallback method for WebSocket authentication
   */
  extractTokenFromQuery(query: any): string | null {
    if (typeof query.token === 'string') {
      return query.token;
    }
    return null;
  }

  /**
   * Check if token will expire soon (within 5 minutes)
   * Security: Proactive token refresh
   */
  isTokenExpiringSoon(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return true; // Treat invalid tokens as expiring
      }

      const now = Math.floor(Date.now() / 1000);
      const fiveMinutes = 5 * 60; // 5 minutes in seconds

      return decoded.exp - now < fiveMinutes;
    } catch (error) {
      return true; // Treat errors as expiring
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.exp) {
        return null;
      }

      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate password reset token
   * Security: Short expiry (1 hour) and single use
   */
  generatePasswordResetToken(userId: string): string {
    const payload = {
      userId,
      type: 'password-reset',
    };

    return jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: '1h',
      issuer: 'defence-brats',
      audience: 'defence-brats-password-reset',
      algorithm: 'HS256',
    });
  }

  /**
   * Verify password reset token
   */
  verifyPasswordResetToken(token: string): { userId: string } | null {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'defence-brats',
        audience: 'defence-brats-password-reset',
        algorithms: ['HS256'],
      }) as any;

      if (decoded.type !== 'password-reset') {
        return null;
      }

      return { userId: decoded.userId };
    } catch (error) {
      console.error('Password reset token verification failed:', error);
      return null;
    }
  }

  /**
   * Generate email verification token
   * Security: Short expiry (24 hours) for email verification
   */
  generateEmailVerificationToken(userId: string, email: string): string {
    const payload = {
      userId,
      email,
      type: 'email-verification',
    };

    return jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: '24h',
      issuer: 'defence-brats',
      audience: 'defence-brats-email-verification',
      algorithm: 'HS256',
    });
  }

  /**
   * Verify email verification token
   */
  verifyEmailVerificationToken(token: string): { userId: string; email: string } | null {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret, {
        issuer: 'defence-brats',
        audience: 'defence-brats-email-verification',
        algorithms: ['HS256'],
      }) as any;

      if (decoded.type !== 'email-verification') {
        return null;
      }

      return { userId: decoded.userId, email: decoded.email };
    } catch (error) {
      console.error('Email verification token verification failed:', error);
      return null;
    }
  }
}

// Export singleton instance
export const authUtils = new AuthUtils();

/**
 * Session-based authentication utilities for web
 * Alternative to JWT for web-based authentication
 */
export const sessionUtils = {
  /**
   * Generate secure session ID
   */
  generateSessionId(): string {
    return new Types.ObjectId().toString() + Date.now().toString(36);
  },

  /**
   * Session key for Redis storage
   */
  getSessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  },

  /**
   * User session key for Redis storage (for listing user sessions)
   */
  getUserSessionKey(userId: string): string {
    return `user_sessions:${userId}`;
  },

  /**
   * Session TTL in seconds (7 days)
   */
  getSessionTTL(): number {
    return 7 * 24 * 60 * 60; // 7 days in seconds
  },
};

/**
 * Rate limiting utilities
 */
export const rateLimitUtils = {
  /**
   * Generate rate limit key
   */
  getRateLimitKey(identifier: string, action: string, window: number): string {
    return `rate_limit:${action}:${identifier}:${Math.floor(Date.now() / (window * 1000))}`;
  },

  /**
   * Rate limit windows in seconds
   */
  windows: {
    login: 60, // 1 minute
    register: 300, // 5 minutes
    passwordReset: 900, // 15 minutes
    message: 60, // 1 minute
    post: 300, // 5 minutes
    upload: 300, // 5 minutes
  },

  /**
   * Rate limit maximum attempts
   */
  limits: {
    login: 5, // 5 attempts per minute
    register: 3, // 3 attempts per 5 minutes
    passwordReset: 3, // 3 attempts per 15 minutes
    message: 30, // 30 messages per minute
    post: 5, // 5 posts per 5 minutes
    upload: 10, // 10 uploads per 5 minutes
  },
};