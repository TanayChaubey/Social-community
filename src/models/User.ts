import mongoose, { Schema, Document } from 'mongoose';
import argon2 from 'argon2';

/**
 * User document interface
 * Security: Password hash is stored, never plain passwords
 * Privacy: Minimal personal data collected, GDPR compliant
 */
export interface IUser extends Document {
  email: string;
  passwordHash: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  bio?: string;
  isPrivate: boolean;
  role: 'user' | 'moderator' | 'admin';
  baseLocation?: string; // Military base location for networking
  serviceBranch?: string; // Army, Navy, Air Force, etc.
  parentRank?: string; // Parent's rank/category
  emailVerified: boolean;
  emailVerificationToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  refreshTokens: string[]; // Array of valid refresh tokens
  loginAttempts: number;
  lockUntil?: Date;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  isLocked(): boolean;
  incrementLoginAttempts(): Promise<void>;
  resetLoginAttempts(): Promise<void>;
  addRefreshToken(token: string): Promise<void>;
  removeRefreshToken(token: string): Promise<void>;
  getPublicProfile(): any; // Returns safe user data for API responses
}

/**
 * User schema with security and privacy considerations
 * Security features: password hashing, account lockout, email verification
 * Privacy features: minimal data collection, private accounts option
 */
const UserSchema = new Schema<IUser>({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(email: string) {
        // Basic email validation
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Please provide a valid email address'
    }
  },
  passwordHash: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long'],
    // Never return password hash in queries
    select: false
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters'],
    validate: {
      validator: function(username: string) {
        // Alphanumeric and underscores only
        return /^[a-zA-Z0-9_]+$/.test(username);
      },
      message: 'Username can only contain letters, numbers, and underscores'
    }
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  avatarUrl: {
    type: String,
    default: null,
    validate: {
      validator: function(url: string) {
        if (!url) return true;
        // Basic URL validation for S3 images
        return /^https?:\/\/.+\.(jpg|jpeg|png|webp)$/i.test(url);
      },
      message: 'Avatar URL must be a valid image URL'
    }
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: ''
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['user', 'moderator', 'admin'],
    default: 'user'
  },
  baseLocation: {
    type: String,
    trim: true,
    maxlength: [100, 'Base location cannot exceed 100 characters']
  },
  serviceBranch: {
    type: String,
    enum: ['army', 'navy', 'airforce', 'marines', 'coastguard', 'spaceforce'],
    trim: true
  },
  parentRank: {
    type: String,
    trim: true,
    maxlength: [100, 'Parent rank cannot exceed 100 characters']
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    select: false // Never return in queries
  },
  passwordResetToken: {
    type: String,
    select: false // Never return in queries
  },
  passwordResetExpires: {
    type: Date,
    select: false // Never return in queries
  },
  refreshTokens: [{
    type: String,
    select: false // Never return in queries
  }],
  loginAttempts: {
    type: Number,
    default: 0,
    select: false // Never return in queries
  },
  lockUntil: {
    type: Date,
    select: false // Never return in queries
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  // Security: Add indexes for performance and security
  indexes: [
    { email: 1 }, // Unique index for email lookups
    { username: 1 }, // Unique index for username lookups
    { createdAt: -1 }, // For sorting users by creation date
    { baseLocation: 1, createdAt: -1 }, // For base-based user discovery
    { emailVerificationToken: 1 }, // For email verification lookups
    { passwordResetToken: 1 }, // For password reset lookups
    { lockUntil: 1 } // For account lockout management
  ]
});

/**
 * Password hashing middleware
 * Security: Hash passwords before saving using Argon2
 */
UserSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('passwordHash')) {
    return next();
  }

  try {
    // Security: Use Argon2id for password hashing (recommended for security)
    const hash = await argon2.hash(this.passwordHash, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3, // 3 iterations
      parallelism: 1, // 1 thread
    });

    this.passwordHash = hash;
    next();
  } catch (error) {
    next(error as Error);
  }
});

/**
 * Method to compare password for authentication
 * Security: Constant-time comparison to prevent timing attacks
 */
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    // Security: Use Argon2 verify for constant-time comparison
    return await argon2.verify(this.passwordHash, candidatePassword);
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
};

/**
 * Method to check if account is locked
 * Security: Prevent brute force attacks
 */
UserSchema.methods.isLocked = function(): boolean {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

/**
 * Method to increment login attempts for rate limiting
 * Security: Account lockout after failed attempts
 */
UserSchema.methods.incrementLoginAttempts = async function(): Promise<void> {
  const maxAttempts = 10;
  const lockTime = 15 * 60 * 1000; // 15 minutes

  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }

  const updates: any = { $inc: { loginAttempts: 1 } };

  // Lock account if reached max attempts and not already locked
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }

  return this.updateOne(updates);
};

/**
 * Method to reset login attempts after successful login
 */
UserSchema.methods.resetLoginAttempts = async function(): Promise<void> {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: new Date() }
  });
};

/**
 * Method to add refresh token
 * Security: Track valid refresh tokens for token rotation
 */
UserSchema.methods.addRefreshToken = async function(token: string): Promise<void> {
  // Limit refresh tokens per user (max 5 tokens)
  const maxTokens = 5;

  if (this.refreshTokens.length >= maxTokens) {
    // Remove oldest token
    this.refreshTokens.shift();
  }

  this.refreshTokens.push(token);
  return this.save();
};

/**
 * Method to remove refresh token
 */
UserSchema.methods.removeRefreshToken = async function(token: string): Promise<void> {
  this.refreshTokens = this.refreshTokens.filter((t: string) => t !== token);
  return this.save();
};

/**
 * Method to get public profile data
 * Privacy: Excludes sensitive information
 */
UserSchema.methods.getPublicProfile = function() {
  return {
    _id: this._id,
    username: this.username,
    firstName: this.firstName,
    lastName: this.lastName,
    avatarUrl: this.avatarUrl,
    bio: this.bio,
    isPrivate: this.isPrivate,
    role: this.role,
    baseLocation: this.baseLocation,
    serviceBranch: this.serviceBranch,
    createdAt: this.createdAt,
    // Security: Never include email, password hash, tokens, or authentication data
  };
};

/**
 * Static method to find user by email with password
 */
UserSchema.statics.findByEmailWithPassword = function(email: string) {
  return this.findOne({ email }).select('+passwordHash +loginAttempts +lockUntil');
};

/**
 * Static method to find user by username with password
 */
UserSchema.statics.findByUsernameWithPassword = function(username: string) {
  return this.findOne({ username }).select('+passwordHash +loginAttempts +lockUntil');
};

export const User = mongoose.model<IUser>('User', UserSchema);