'use client';

import { useState, useEffect } from 'react';
import { chatAPI } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import { formatRelativeTime } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface Conversation {
  _id: string;
  name?: string;
  type: 'direct' | 'group';
  participants: Array<{
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
  }>;
  lastMessage?: {
    content: string;
    senderId: {
      username: string;
      firstName: string;
      lastName: string;
    };
    timestamp: string;
    messageType: string;
  };
  unreadCount: number;
  updatedAt: string;
  metadata: {
    baseLocation?: string;
    isOfficial?: boolean;
  };
}

export function ChatList() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const response = await chatAPI.getConversations();
      if (response.success) {
        setConversations(response.data.conversations);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getConversationName = (conversation: Conversation) => {
    if (conversation.type === 'group' && conversation.name) {
      return conversation.name;
    }

    // For direct messages, show the other person's name
    const otherParticipants = conversation.participants.filter(
      p => p.username !== 'current_user' // This should be the logged-in user
    );

    if (otherParticipants.length > 0) {
      const other = otherParticipants[0];
      return `${other.firstName} ${other.lastName}`;
    }

    return 'Unknown Conversation';
  };

  const getConversationAvatar = (conversation: Conversation) => {
    if (conversation.type === 'group') {
      return (
        <div className="h-12 w-12 bg-blue-500 rounded-full flex items-center justify-center">
          <UserGroupIcon className="h-6 w-6 text-white" />
        </div>
      );
    }

    // For direct messages, show the other person's avatar
    const otherParticipants = conversation.participants.filter(
      p => p.username !== 'current_user'
    );

    if (otherParticipants.length > 0 && otherParticipants[0].avatarUrl) {
      return (
        <img
          src={otherParticipants[0].avatarUrl}
          alt={otherParticipants[0].firstName}
          className="h-12 w-12 rounded-full object-cover"
        />
      );
    }

    if (otherParticipants.length > 0) {
      const other = otherParticipants[0];
      return (
        <div className="h-12 w-12 bg-green-500 rounded-full flex items-center justify-center">
          <span className="text-white font-medium">
            {other.firstName[0]}
          </span>
        </div>
      );
    }

    return (
      <div className="h-12 w-12 bg-gray-400 rounded-full flex items-center justify-center">
        <span className="text-white font-medium">?</span>
      </div>
    );
  };

  const getLastMessagePreview = (conversation: Conversation) => {
    if (!conversation.lastMessage) {
      return 'No messages yet';
    }

    const { content, senderId, messageType } = conversation.lastMessage;

    if (messageType === 'image') {
      return `${senderId.firstName} shared an image`;
    }

    const senderName = conversation.type === 'group'
      ? `${senderId.firstName}: `
      : '';

    return `${senderName}${content}`;
  };

  const openConversation = (conversationId: string) => {
    router.push(`/chat/${conversationId}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="h-12 w-12 bg-gray-200 rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Create Conversation Button */}
      <Card>
        <CardContent className="p-4">
          <Button
            onClick={() => router.push('/chat/new')}
            className="w-full flex items-center justify-center space-x-2"
          >
            <PencilIcon className="h-5 w-5" />
            <span>Start New Conversation</span>
          </Button>
        </CardContent>
      </Card>

      {/* Conversation List */}
      {conversations.length > 0 ? (
        conversations.map((conversation) => (
          <Card
            key={conversation._id}
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => openConversation(conversation._id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                {getConversationAvatar(conversation)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {getConversationName(conversation)}
                    </p>
                    <div className="flex items-center space-x-2">
                      {conversation.metadata.isOfficial && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          Official
                        </span>
                      )}
                      {conversation.unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white">
                          {conversation.unreadCount}
                        </span>
                      )}
                      <p className="text-xs text-gray-500">
                        {formatRelativeTime(conversation.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-sm text-gray-600 truncate">
                      {getLastMessagePreview(conversation)}
                    </p>
                    <ChatBubbleLeftRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  </div>
                  {conversation.type === 'group' && (
                    <div className="flex items-center space-x-1 mt-1">
                      <span className="text-xs text-gray-500">
                        {conversation.participants.length} members
                      </span>
                      {conversation.metadata.baseLocation && (
                        <span className="text-xs text-blue-600">
                          📍 {conversation.metadata.baseLocation}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <ChatBubbleLeftRightIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No conversations yet
            </h3>
            <p className="text-gray-600 mb-4">
              Start a conversation to connect with other members of the defence community.
            </p>
            <Button onClick={() => router.push('/chat/new')}>
              Start New Conversation
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}