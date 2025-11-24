'use client';

import { PostFeed } from '@/components/posts/post-feed';
import { Button } from '@/components/ui/button';
import { MainLayout } from '@/components/layout/navigation';
import { PlusIcon } from '@heroicons/react/24/outline';

export default function PostsPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">
            Community Posts
          </h1>
          <Button
            onClick={() => window.location.href = '/posts/create'}
            className="flex items-center space-x-2"
          >
            <PlusIcon className="h-5 w-5" />
            <span>Create Post</span>
          </Button>
        </div>

        {/* Filters could go here */}
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center space-x-4">
            <select className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3 border text-sm">
              <option value="public">Public Posts</option>
              <option value="friends">Friends Only</option>
              <option value="all">All Posts</option>
            </select>

            <select className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3 border text-sm">
              <option value="recent">Most Recent</option>
              <option value="popular">Most Popular</option>
            </select>
          </div>
        </div>

        <PostFeed />
      </div>
    </MainLayout>
  );
}