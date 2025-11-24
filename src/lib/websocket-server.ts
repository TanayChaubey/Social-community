import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { connectDB } from './db';
import { redisClient, redisHelpers } from './redis';
import { authUtils, rateLimitUtils } from './auth';
import { User, Conversation, Message, Notification } from '@/models';

/**
 * WebSocket Server for Real-time Communication
 * Security: Token authentication, rate limiting, message validation
 * Privacy: Room-based access controls, user privacy protection
 */

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  user?: any;
  isAlive?: boolean;
  rooms?: Set<string>;
  lastPing?: number;
}

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: number;
  messageId?: string;
}

interface ConnectedUser {
  userId: string;
  socket: AuthenticatedWebSocket;
  joinedAt: Date;
  rooms: Set<string>;
  lastActivity: Date;
}

class DefenceBratsWebSocketServer {
  private wss: WebSocketServer;
  private httpServer: any;
  private connectedUsers: Map<string, ConnectedUser> = new Map();
  private messageQueue: Map<string, WebSocketMessage[]> = new Map();
  private isShuttingDown = false;

  constructor(port: number = 3001) {
    this.httpServer = createServer();
    this.wss = new WebSocketServer({
      server: this.httpServer,
      perMessageDeflate: false, // Disable compression for security
      verifyClient: this.verifyClient.bind(this),
    });

    this.setupWebSocketServer();
    this.startHealthCheck();
    this.startCleanupTimer();

    // Start server
    this.httpServer.listen(port, () => {
      console.log(`✅ WebSocket server listening on port ${port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
  }

  /**
   * WebSocket client verification
   * Security: Token validation before connection establishment
   */
  private async verifyClient(info: any): Promise<boolean> {
    try {
      const { origin, req } = info;
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        console.warn('🚫 WebSocket connection rejected: No token provided');
        return false;
      }

      // Verify JWT token
      const payload = authUtils.verifyAccessToken(token);
      if (!payload) {
        console.warn('🚫 WebSocket connection rejected: Invalid token');
        return false;
      }

      // Get user from database
      const user = await User.findById(payload.userId);
      if (!user || user.isLocked()) {
        console.warn('🚫 WebSocket connection rejected: User not found or locked');
        return false;
      }

      // Store user info for later use
      (req as any).user = user;
      (req as any).userId = payload.userId;

      return true;
    } catch (error) {
      console.error('WebSocket client verification error:', error);
      return false;
    }
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    console.log('🔌 WebSocket server initialized');
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(ws: AuthenticatedWebSocket, req: any): Promise<void> {
    const userId = req.userId;
    const user = req.user;

    // Initialize connection
    ws.userId = userId;
    ws.user = user;
    ws.isAlive = true;
    ws.rooms = new Set<string>();
    ws.lastPing = Date.now();

    console.log(`👤 User ${user.username} connected (${userId})`);

    // Add to connected users
    const connectedUser: ConnectedUser = {
      userId,
      socket: ws,
      joinedAt: new Date(),
      rooms: new Set<string>(),
      lastActivity: new Date(),
    };
    this.connectedUsers.set(userId, connectedUser);

    // Join user's personal room
    await this.joinRoom(ws, `user:${userId}`);

    // Join user's active conversations
    await this.joinUserConversations(ws, userId);

    // Setup event handlers
    ws.on('message', (data) => this.handleMessage(ws, data));
    ws.on('pong', () => this.handlePong(ws));
    ws.on('close', (code, reason) => this.handleClose(ws, code, reason));
    ws.on('error', (error) => this.handleError(ws, error));

    // Send welcome message
    this.sendToUser(userId, {
      type: 'connection',
      data: {
        status: 'connected',
        userId,
        timestamp: Date.now(),
      },
    });

    // Broadcast user presence
    await this.broadcastPresence(userId, 'online');
  }

  /**
   * Handle incoming WebSocket messages
   * Security: Message validation, rate limiting, authorization checks
   */
  private async handleMessage(ws: AuthenticatedWebSocket, data: any): Promise<void> {
    try {
      if (!ws.userId) return;

      // Update last activity
      const connectedUser = this.connectedUsers.get(ws.userId);
      if (connectedUser) {
        connectedUser.lastActivity = new Date();
      }

      // Parse and validate message
      let message: WebSocketMessage;
      try {
        message = JSON.parse(data.toString());
      } catch (error) {
        this.sendError(ws, 'Invalid message format');
        return;
      }

      // Rate limiting check
      const rateLimitKey = `ws:message:${ws.userId}`;
      const current = await redisHelpers.increment(rateLimitKey, 60); // 1 minute window

      if (current > 30) { // 30 messages per minute
        this.sendError(ws, 'Rate limit exceeded');
        return;
      }

      // Handle message based on type
      switch (message.type) {
        case 'ping':
          this.sendToUser(ws.userId!, { type: 'pong', data: { timestamp: Date.now() } });
          break;

        case 'message:send':
          await this.handleSendMessage(ws, message);
          break;

        case 'message:typing':
          await this.handleTypingIndicator(ws, message);
          break;

        case 'presence:update':
          await this.handlePresenceUpdate(ws, message);
          break;

        case 'conversation:join':
          await this.handleJoinConversation(ws, message);
          break;

        case 'conversation:leave':
          await this.handleLeaveConversation(ws, message);
          break;

        case 'notifications:read':
          await this.handleMarkNotificationsRead(ws, message);
          break;

        default:
          this.sendError(ws, 'Unknown message type');
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      this.sendError(ws, 'Internal server error');
    }
  }

  /**
   * Handle send message
   */
  private async handleSendMessage(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    if (!ws.userId || !message.data.conversationId || !message.data.content) {
      this.sendError(ws, 'Invalid message data');
      return;
    }

    const { conversationId, content, messageType = 'text', replyTo } = message.data;

    try {
      // Verify user is participant in conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.isParticipant(ws.userId)) {
        this.sendError(ws, 'Not authorized to send message to this conversation');
        return;
      }

      // Create message
      const newMessage = new Message({
        conversationId,
        senderId: ws.userId,
        content: content.trim(),
        messageType,
        replyTo,
        readBy: [{ userId: ws.userId, readAt: new Date() }],
      });

      await newMessage.save();

      // Populate sender information
      await newMessage.populate('senderId', 'username firstName lastName avatarUrl');

      // Update conversation's last message
      await conversation.updateLastMessage(content, ws.userId, messageType);

      // Create message object for broadcasting
      const messageData = {
        type: 'message:receive',
        data: {
          message: newMessage,
          conversationId,
        },
        timestamp: Date.now(),
      };

      // Broadcast to conversation participants
      await this.broadcastToRoom(`conversation:${conversationId}`, messageData, ws.userId);

      // Create notifications for offline users
      await this.createMessageNotifications(conversation, newMessage, ws.userId);

      // Queue message for offline users
      await this.queueMessageForOfflineUsers(conversation, messageData);

    } catch (error) {
      console.error('Error sending message:', error);
      this.sendError(ws, 'Failed to send message');
    }
  }

  /**
   * Handle typing indicator
   */
  private async handleTypingIndicator(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    if (!ws.userId || !message.data.conversationId) return;

    const { conversationId, isTyping } = message.data;

    try {
      // Verify user is participant in conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.isParticipant(ws.userId)) return;

      // Debounce typing indicators (3 seconds)
      const typingKey = `typing:${conversationId}:${ws.userId}`;
      if (isTyping) {
        await redisHelpers.setWithExpiry(typingKey, 'true', 3);
      } else {
        await redisHelpers.del(typingKey);
      }

      // Broadcast to conversation (excluding sender)
      const typingData = {
        type: 'typing',
        data: {
          conversationId,
          userId: ws.userId,
          username: ws.user.username,
          isTyping,
        },
        timestamp: Date.now(),
      };

      await this.broadcastToRoom(`conversation:${conversationId}`, typingData, ws.userId);

    } catch (error) {
      console.error('Error handling typing indicator:', error);
    }
  }

  /**
   * Handle presence update
   */
  private async handlePresenceUpdate(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    if (!ws.userId || !message.data.status) return;

    const { status } = message.data;

    try {
      // Update user's presence status
      await this.broadcastPresence(ws.userId, status);

    } catch (error) {
      console.error('Error handling presence update:', error);
    }
  }

  /**
   * Handle join conversation
   */
  private async handleJoinConversation(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    if (!ws.userId || !message.data.conversationId) return;

    const { conversationId } = message.data;

    try {
      // Verify user is participant
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.isParticipant(ws.userId)) {
        this.sendError(ws, 'Not authorized to join this conversation');
        return;
      }

      // Join conversation room
      await this.joinRoom(ws, `conversation:${conversationId}`);

      // Send confirmation
      this.sendToUser(ws.userId, {
        type: 'conversation:joined',
        data: { conversationId },
      });

    } catch (error) {
      console.error('Error joining conversation:', error);
      this.sendError(ws, 'Failed to join conversation');
    }
  }

  /**
   * Handle leave conversation
   */
  private async handleLeaveConversation(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    if (!ws.userId || !message.data.conversationId) return;

    const { conversationId } = message.data;

    try {
      await this.leaveRoom(ws, `conversation:${conversationId}`);

      this.sendToUser(ws.userId, {
        type: 'conversation:left',
        data: { conversationId },
      });

    } catch (error) {
      console.error('Error leaving conversation:', error);
    }
  }

  /**
   * Handle mark notifications as read
   */
  private async handleMarkNotificationsRead(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<void> {
    if (!ws.userId) return;

    try {
      await Notification.markAllAsRead(ws.userId);

      this.sendToUser(ws.userId, {
        type: 'notifications:read',
        data: { success: true },
      });

    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  }

  /**
   * Join user to room
   */
  private async joinRoom(ws: AuthenticatedWebSocket, roomName: string): Promise<void> {
    if (!ws.rooms || ws.rooms.has(roomName)) return;

    ws.rooms.add(roomName);

    const connectedUser = this.connectedUsers.get(ws.userId!);
    if (connectedUser) {
      connectedUser.rooms.add(roomName);
    }

    // Store room membership in Redis for scaling
    await redisHelpers.listPush(`room:${roomName}`, ws.userId!);
  }

  /**
   * Leave room
   */
  private async leaveRoom(ws: AuthenticatedWebSocket, roomName: string): Promise<void> {
    if (!ws.rooms || !ws.rooms.has(roomName)) return;

    ws.rooms.delete(roomName);

    const connectedUser = this.connectedUsers.get(ws.userId!);
    if (connectedUser) {
      connectedUser.rooms.delete(roomName);
    }

    // Remove from Redis room membership
    // Note: This would require more complex Redis operations
  }

  /**
   * Join user's active conversations
   */
  private async joinUserConversations(ws: AuthenticatedWebSocket, userId: string): Promise<void> {
    try {
      const conversations = await Conversation.find({
        participants: userId,
        isArchived: { $ne: true },
      }).select('_id');

      for (const conversation of conversations) {
        await this.joinRoom(ws, `conversation:${conversation._id.toString()}`);
      }
    } catch (error) {
      console.error('Error joining user conversations:', error);
    }
  }

  /**
   * Send message to specific user
   */
  private sendToUser(userId: string, message: WebSocketMessage): void {
    const connectedUser = this.connectedUsers.get(userId);
    if (!connectedUser || connectedUser.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      connectedUser.socket.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending message to user:', error);
    }
  }

  /**
   * Broadcast message to room
   */
  private async broadcastToRoom(
    roomName: string,
    message: WebSocketMessage,
    excludeUserId?: string
  ): Promise<void> {
    const messageStr = JSON.stringify(message);

    // Send to connected users in the room
    for (const [userId, connectedUser] of this.connectedUsers) {
      if (connectedUser.rooms.has(roomName) && userId !== excludeUserId) {
        if (connectedUser.socket.readyState === WebSocket.OPEN) {
          try {
            connectedUser.socket.send(messageStr);
          } catch (error) {
            console.error('Error broadcasting to user:', userId, error);
          }
        }
      }
    }

    // Publish to Redis for cross-server broadcasting
    await redisHelpers.publish('ws:broadcast', JSON.stringify({
      room: roomName,
      message,
      excludeUserId,
    }));
  }

  /**
   * Broadcast presence update
   */
  private async broadcastPresence(userId: string, status: string): Promise<void> {
    const presenceData = {
      type: 'presence',
      data: {
        userId,
        status, // 'online', 'offline', 'away'
      },
      timestamp: Date.now(),
    };

    await this.broadcastToRoom('presence', presenceData);
  }

  /**
   * Create message notifications for offline users
   */
  private async createMessageNotifications(
    conversation: any,
    message: any,
    senderId: string
  ): Promise<void> {
    try {
      const recipients = conversation.participants.filter(
        (participantId: any) => !participantId.equals(senderId)
      );

      for (const recipientId of recipients) {
        // Check if user is online
        const isUserOnline = this.connectedUsers.has(recipientId.toString());

        if (!isUserOnline) {
          await Notification.createNotification(
            recipientId.toString(),
            'message',
            `New message from ${message.senderId.firstName}`,
            message.content.substring(0, 100),
            {
              conversationId: conversation._id,
              messageId: message._id,
              userId: senderId,
            }
          );
        }
      }
    } catch (error) {
      console.error('Error creating message notifications:', error);
    }
  }

  /**
   * Queue message for offline users
   */
  private async queueMessageForOfflineUsers(
    conversation: any,
    messageData: WebSocketMessage
  ): Promise<void> {
    // Implementation for storing messages for offline users
    // This would involve storing messages in Redis or database
  }

  /**
   * Handle WebSocket pong
   */
  private handlePong(ws: AuthenticatedWebSocket): void {
    ws.isAlive = true;
    ws.lastPing = Date.now();
  }

  /**
   * Handle WebSocket close
   */
  private async handleClose(ws: AuthenticatedWebSocket, code: number, reason: Buffer): Promise<void> {
    if (!ws.userId) return;

    console.log(`👤 User ${ws.user?.username} disconnected (${ws.userId})`);

    // Remove from connected users
    this.connectedUsers.delete(ws.userId);

    // Broadcast user offline presence
    await this.broadcastPresence(ws.userId, 'offline');

    // Clean up room memberships
    if (ws.rooms) {
      for (const room of ws.rooms) {
        // Remove from Redis room membership
      }
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleError(ws: AuthenticatedWebSocket, error: Error): void {
    console.error(`WebSocket error for user ${ws.userId}:`, error);
  }

  /**
   * Send error message to client
   */
  private sendError(ws: AuthenticatedWebSocket, error: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { error },
        timestamp: Date.now(),
      }));
    }
  }

  /**
   * Start health check timer
   */
  private startHealthCheck(): void {
    setInterval(() => {
      this.wss.clients.forEach((ws: any) => {
        if (!ws.isAlive) {
          console.log('Terminating inactive WebSocket connection');
          ws.terminate();
          return;
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      // Clean up inactive connections
      const now = Date.now();
      const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

      for (const [userId, connectedUser] of this.connectedUsers) {
        if (now - connectedUser.lastActivity.getTime() > inactiveThreshold) {
          console.log(`Cleaning up inactive connection: ${userId}`);
          connectedUser.socket.terminate();
          this.connectedUsers.delete(userId);
        }
      }
    }, 60000); // 1 minute
  }

  /**
   * Graceful shutdown
   */
  private async gracefulShutdown(): Promise<void> {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    console.log('🔄 Shutting down WebSocket server...');

    // Close all connections
    for (const [userId, connectedUser] of this.connectedUsers) {
      try {
        connectedUser.socket.close(1000, 'Server shutting down');
      } catch (error) {
        console.error(`Error closing connection for ${userId}:`, error);
      }
    }

    // Close WebSocket server
    this.wss.close(() => {
      console.log('✅ WebSocket server shut down');
    });

    // Close HTTP server
    this.httpServer.close(() => {
      console.log('✅ HTTP server shut down');
    });
  }

  /**
   * Get server statistics
   */
  public getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      totalConnections: this.wss.clients.size,
      uptime: process.uptime(),
    };
  }
}

// Start the WebSocket server
if (require.main === module) {
  const port = parseInt(process.env.WS_PORT || '3001');

  // Connect to database first
  connectDB().then(() => {
    // Connect to Redis
    redisClient.connect().then(() => {
      // Start WebSocket server
      new DefenceBratsWebSocketServer(port);
    }).catch((error) => {
      console.error('Failed to connect to Redis:', error);
      process.exit(1);
    });
  }).catch((error) => {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  });
}

export default DefenceBratsWebSocketServer;