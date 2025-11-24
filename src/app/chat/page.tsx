'use client';

import { ChatList } from '@/components/chat/chat-list';
import { MainLayout } from '@/components/layout/navigation';

export default function ChatPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Messages
          </h1>
          <p className="mt-2 text-gray-600">
            Connect with other members of the defence community.
          </p>
        </div>

        <ChatList />
      </div>
    </MainLayout>
  );
}