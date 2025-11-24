'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { postsAPI } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChatBubbleLeftRightIcon,
  HeartIcon,
  UserGroupIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { formatRelativeTime } from '@/lib/utils';

interface DashboardStats {
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  totalConnections: number;
}

interface RecentPost {
  _id: string;
  content: string;
  author: {
    username: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
  };
  likeCount: number;
  commentCount: number;
  createdAt: string;
  visibility: string;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats>({
    totalPosts: 0,
    totalLikes: 0,
    totalComments: 0,
    totalConnections: 0,
  });
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch user's posts and calculate stats
      const postsResponse = await postsAPI.getPosts({
        authorId: user?._id,
        limit: 10,
      });

      if (postsResponse.success) {
        const posts = postsResponse.data.posts;
        const calculatedStats = posts.reduce(
          (acc: DashboardStats, post: any) => ({
            totalPosts: acc.totalPosts + 1,
            totalLikes: acc.totalLikes + (post.likeCount || 0),
            totalComments: acc.totalComments + (post.commentCount || 0),
            totalConnections: acc.totalConnections,
          }),
          { totalPosts: 0, totalLikes: 0, totalComments: 0, totalConnections: 50 }
        );

        setStats(calculatedStats);
        setRecentPosts(posts.slice(0, 5)); // Show 5 most recent posts
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white p-6 rounded-lg shadow">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.firstName}! 👋
        </h1>
        <p className="mt-2 text-gray-600">
          Here's what's happening in your Defence Brats community.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
            <TrophyIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPosts}</div>
            <p className="text-xs text-muted-foreground">
              +20% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Likes</CardTitle>
            <HeartIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLikes}</div>
            <p className="text-xs text-muted-foreground">
              +15% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comments</CardTitle>
            <ChatBubbleLeftRightIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalComments}</div>
            <p className="text-xs text-muted-foreground">
              +10% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connections</CardTitle>
            <UserGroupIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalConnections}</div>
            <p className="text-xs text-muted-foreground">
              +5% from last month
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Posts */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Posts</CardTitle>
            <CardDescription>Your latest activity on the platform</CardDescription>
          </CardHeader>
          <CardContent>
            {recentPosts.length > 0 ? (
              <div className="space-y-4">
                {recentPosts.map((post) => (
                  <div key={post._id} className="border-b border-gray-200 pb-4 last:border-b-0">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center">
                          <span className="text-white text-sm font-medium">
                            {post.author.firstName[0]}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {post.author.firstName} {post.author.lastName}
                        </p>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {post.content}
                        </p>
                        <div className="flex items-center space-x-4 mt-2">
                          <span className="flex items-center text-xs text-gray-500">
                            <HeartIcon className="h-4 w-4 mr-1" />
                            {post.likeCount}
                          </span>
                          <span className="flex items-center text-xs text-gray-500">
                            <ChatBubbleLeftRightIcon className="h-4 w-4 mr-1" />
                            {post.commentCount}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatRelativeTime(post.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">No posts yet</p>
                <Button className="mt-4" onClick={() => window.location.href = '/posts/create'}>
                  Create your first post
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Get started with these common tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full justify-start"
              onClick={() => window.location.href = '/posts/create'}
            >
              Create a Post
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => window.location.href = '/chat'}
            >
              Start a Conversation
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => window.location.href = '/profile'}
            >
              Update Your Profile
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => window.location.href = '/posts'}
            >
              Browse Posts
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Community Updates */}
      <Card>
        <CardHeader>
          <CardTitle>Community Updates</CardTitle>
          <CardDescription>Latest news and announcements from the Defence Brats team</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="h-2 w-2 bg-green-500 rounded-full mt-2"></div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Platform Updates
                </p>
                <p className="text-sm text-gray-600">
                  New features added: Enhanced privacy controls and improved messaging system.
                </p>
                <p className="text-xs text-gray-500 mt-1">2 hours ago</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="h-2 w-2 bg-blue-500 rounded-full mt-2"></div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Community Guidelines
                </p>
                <p className="text-sm text-gray-600">
                  Updated community guidelines are now available. Please review them.
                </p>
                <p className="text-xs text-gray-500 mt-1">1 day ago</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="h-2 w-2 bg-purple-500 rounded-full mt-2"></div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Welcome New Members
                </p>
                <p className="text-sm text-gray-600">
                  25 new members joined this week from bases across the country!
                </p>
                <p className="text-xs text-gray-500 mt-1">3 days ago</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}