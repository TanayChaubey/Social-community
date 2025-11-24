'use client';

import { useState, useEffect } from 'react';
import { postsAPI } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  HeartIcon,
  ChatBubbleLeftRightIcon,
  ShareIcon,
  BookmarkIcon,
} from '@heroicons/react/24/outline';
import {
  HeartIcon as HeartSolidIcon,
  BookmarkIcon as BookmarkSolidIcon,
} from '@heroicons/react/24/solid';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Post {
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
  isLiked?: boolean;
}

interface PostFeedProps {
  userId?: string;
  visibility?: string;
  baseLocation?: string;
  tags?: string[];
}

export function PostFeed({ userId, visibility = 'public', baseLocation, tags }: PostFeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, [userId, visibility, baseLocation, tags]);

  const fetchPosts = async (pageNum = 1, append = false) => {
    try {
      const params: any = {
        page: pageNum,
        limit: 10,
        visibility,
      };

      if (userId) params.authorId = userId;
      if (baseLocation) params.baseLocation = baseLocation;
      if (tags && tags.length > 0) params.tags = tags;

      const response = await postsAPI.getPosts(params);

      if (response.success) {
        const newPosts = response.data.posts;
        if (append) {
          setPosts(prev => [...prev, ...newPosts]);
        } else {
          setPosts(newPosts);
        }
        setHasMore(response.data.pagination.hasMore);
        setPage(pageNum);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      toast.error('Failed to load posts');
    } finally {
      setIsLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    setLoadingMore(true);
    fetchPosts(page + 1, true);
  };

  const handleLike = async (postId: string, isLiked: boolean) => {
    try {
      const response = await postsAPI.likePost(postId);
      if (response.success) {
        setPosts(posts.map(post =>
          post._id === postId
            ? {
                ...post,
                isLiked: !isLiked,
                likeCount: isLiked ? post.likeCount - 1 : post.likeCount + 1
              }
            : post
        ));
      }
    } catch (error) {
      console.error('Error liking post:', error);
      toast.error('Failed to update like');
    }
  };

  const handleShare = (postId: string) => {
    if (navigator.share) {
      navigator.share({
        title: 'Check out this post on Defence Brats',
        url: `${window.location.origin}/posts/${postId}`,
      });
    } else {
      navigator.clipboard.writeText(`${window.location.origin}/posts/${postId}`);
      toast.success('Link copied to clipboard!');
    }
  };

  const handleBookmark = (postId: string) => {
    // TODO: Implement bookmark functionality
    toast.success('Post saved to bookmarks!');
  };

  if (isLoading && posts.length === 0) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                  <div className="space-y-1">
                    <div className="h-4 bg-gray-200 rounded w-24"></div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (posts.length === 0 && !isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-gray-500 mb-4">No posts found</p>
          <Button onClick={() => window.location.href = '/posts/create'}>
            Create a post
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <Card key={post._id} className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                {post.author.avatarUrl ? (
                  <img
                    src={post.author.avatarUrl}
                    alt={post.author.firstName}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-medium">
                      {post.author.firstName[0]}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium text-gray-900">
                    {post.author.firstName} {post.author.lastName}
                  </p>
                  <span className="text-sm text-gray-500">
                    @{post.author.username}
                  </span>
                  {post.visibility !== 'public' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {post.visibility}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {formatRelativeTime(post.createdAt)}
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="mb-4">
              <p className="text-gray-800 whitespace-pre-wrap">
                {post.content}
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
              <div className="flex items-center space-x-6">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleLike(post._id, post.isLiked || false)}
                  className={`flex items-center space-x-1 ${
                    post.isLiked ? 'text-red-500 hover:text-red-600' : 'text-gray-500 hover:text-gray-600'
                  }`}
                >
                  {post.isLiked ? (
                    <HeartSolidIcon className="h-5 w-5" />
                  ) : (
                    <HeartIcon className="h-5 w-5" />
                  )}
                  <span className="text-sm">{post.likeCount}</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.location.href = `/posts/${post._id}`}
                  className="flex items-center space-x-1 text-gray-500 hover:text-gray-600"
                >
                  <ChatBubbleLeftRightIcon className="h-5 w-5" />
                  <span className="text-sm">{post.commentCount}</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleShare(post._id)}
                  className="flex items-center space-x-1 text-gray-500 hover:text-gray-600"
                >
                  <ShareIcon className="h-5 w-5" />
                  <span className="text-sm">Share</span>
                </Button>
              </div>

              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleBookmark(post._id)}
                  className="flex items-center space-x-1 text-gray-500 hover:text-gray-600"
                >
                  <BookmarkIcon className="h-5 w-5" />
                  <span className="text-sm">Save</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Load More Button */}
      {hasMore && (
        <div className="text-center mt-8">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="w-full sm:w-auto"
          >
            {loadingMore ? 'Loading...' : 'Load more posts'}
          </Button>
        </div>
      )}
    </div>
  );
}