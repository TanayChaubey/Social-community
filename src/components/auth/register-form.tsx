'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormField, FormError, FormSuccess } from '@/components/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';
import { authAPI } from '@/lib/api-client';
import { RegisterInput } from '@/lib/validations';
import { validatePassword } from '@/lib/utils';
import { getServiceBranchDisplay } from '@/lib/utils';

export function RegisterForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registeredUser, setRegisteredUser] = useState<any>(null);
  const router = useRouter();
  const { login } = useAuthStore();

  const form = useForm<RegisterInput>({
    resolver: zodResolver(z.object({
      email: z.string().email().toLowerCase(),
      password: z.string().min(8),
      confirmPassword: z.string(),
      username: z.string().min(3).max(20),
      firstName: z.string().min(1).max(50),
      lastName: z.string().min(1).max(50),
      baseLocation: z.string().max(100).optional(),
      serviceBranch: z.enum(['army', 'navy', 'airforce', 'marines', 'coastguard', 'spaceforce']).optional(),
      parentRank: z.string().max(100).optional(),
    })),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      username: '',
      firstName: '',
      lastName: '',
      baseLocation: '',
      serviceBranch: undefined,
      parentRank: '',
    },
  });

  const password = form.watch('password');
  const confirmPassword = form.watch('confirmPassword');

  const getPasswordErrors = () => {
    if (!password) return [];
    const validation = validatePassword(password);
    return validation.errors;
  };

  const onSubmit = async (data: RegisterInput) => {
    // Validate password strength
    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.isValid) {
      toast.error('Password does not meet requirements');
      return;
    }

    setIsLoading(true);

    try {
      const response = await authAPI.register(data);

      if (response.success) {
        const { user, accessToken, refreshToken } = response.data;

        // Store user data and tokens
        login(user, { accessToken, refreshToken });

        setRegistrationSuccess(true);
        setRegisteredUser(user);

        toast.success('Registration successful!');

        // Show verification message
        setTimeout(() => {
          router.push('/dashboard');
        }, 3000);
      } else {
        if (response.details) {
          // Show validation errors
          response.details.forEach((error: any) => {
            form.setError(error.field as keyof RegisterInput, {
              type: 'manual',
              message: error.message,
            });
          });
        } else {
          toast.error(response.error || 'Registration failed');
        }
      }
    } catch (error) {
      console.error('Registration error:', error);

      if (error instanceof Error) {
        if (error.message.includes('Rate limit')) {
          toast.error(error.message);
        } else {
          toast.error('Registration failed. Please try again.');
        }
      } else {
        toast.error('Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (registrationSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <CardTitle className="text-2xl font-bold text-green-600">
                Registration Successful!
              </CardTitle>
              <CardDescription>
                Welcome to Defence Brats, {registeredUser?.firstName}!
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-md">
                <p className="text-sm">
                  Your account has been created successfully. Please check your email for verification instructions.
                </p>
              </div>
              <p className="text-sm text-gray-600">
                You will be redirected to your dashboard in a few seconds...
              </p>
              <Button
                onClick={() => router.push('/dashboard')}
                className="w-full"
              >
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900">
            Defence Brats
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Join the defence community network
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              Create your account
            </CardTitle>
            <CardDescription className="text-center">
              Fill in the form below to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="First Name"
                  name="firstName"
                  form={form}
                >
                  <Input
                    placeholder="John"
                    autoComplete="given-name"
                    disabled={isLoading}
                    {...form.register('firstName')}
                  />
                </FormField>

                <FormField
                  label="Last Name"
                  name="lastName"
                  form={form}
                >
                  <Input
                    placeholder="Doe"
                    autoComplete="family-name"
                    disabled={isLoading}
                    {...form.register('lastName')}
                  />
                </FormField>
              </div>

              <FormField
                label="Username"
                name="username"
                helperText="This will be your unique identifier on the platform"
                form={form}
              >
                <Input
                  placeholder="johndoe"
                  autoComplete="username"
                  disabled={isLoading}
                  {...form.register('username')}
                />
              </FormField>

              <FormField
                label="Email Address"
                name="email"
                helperText="We'll send verification instructions to this email"
                form={form}
              >
                <Input
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={isLoading}
                  {...form.register('email')}
                />
              </FormField>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="Password"
                  name="password"
                  helperText="Must be at least 8 characters with uppercase, lowercase, number, and special character"
                  form={form}
                >
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      autoComplete="new-password"
                      disabled={isLoading}
                      {...form.register('password')}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <svg
                          className="h-5 w-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="h-5 w-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </FormField>

                <FormField
                  label="Confirm Password"
                  name="confirmPassword"
                  form={form}
                >
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
                      autoComplete="new-password"
                      disabled={isLoading}
                      {...form.register('confirmPassword')}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <svg
                          className="h-5 w-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="h-5 w-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </FormField>
              </div>

              {/* Password strength indicator */}
              {password && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">Password Requirements:</div>
                  <div className="space-y-1">
                    {[
                      { label: 'At least 8 characters', met: password.length >= 8 },
                      { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
                      { label: 'One lowercase letter', met: /[a-z]/.test(password) },
                      { label: 'One number', met: /\d/.test(password) },
                      { label: 'One special character', met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) },
                    ].map((requirement, index) => (
                      <div key={index} className="flex items-center text-sm">
                        {requirement.met ? (
                          <svg
                            className="h-4 w-4 text-green-500 mr-2"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="h-4 w-4 text-gray-300 mr-2"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                        <span className={requirement.met ? 'text-green-600' : 'text-gray-500'}>
                          {requirement.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <FormField
                label="Base Location"
                name="baseLocation"
                helperText="Military base or installation (optional)"
                form={form}
              >
                <Input
                  placeholder="Fort Bragg, Naval Base San Diego, etc."
                  disabled={isLoading}
                  {...form.register('baseLocation')}
                />
              </FormField>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="Service Branch"
                  name="serviceBranch"
                  helperText="Select if applicable"
                  form={form}
                >
                  <select
                    {...form.register('serviceBranch')}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 py-2 px-3 border text-sm"
                    disabled={isLoading}
                  >
                    <option value="">Select branch</option>
                    <option value="army">Army 🪖</option>
                    <option value="navy">Navy ⚓</option>
                    <option value="airforce">Air Force ✈️</option>
                    <option value="marines">Marines 🪂</option>
                    <option value="coastguard">Coast Guard 🚢</option>
                    <option value="spaceforce">Space Force 🚀</option>
                  </select>
                </FormField>

                <FormField
                  label="Parent's Rank/Position"
                  name="parentRank"
                  helperText="Optional"
                  form={form}
                >
                  <Input
                    placeholder="E.g., Sergeant, Captain, etc."
                    disabled={isLoading}
                    {...form.register('parentRank')}
                  />
                </FormField>
              </div>

              <Button
                type="submit"
                className="w-full"
                loading={isLoading}
                disabled={isLoading}
              >
                {isLoading ? 'Creating account...' : 'Create account'}
              </Button>
            </Form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">
                    Already have an account?
                  </span>
                </div>
              </div>

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => router.push('/auth/login')}
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading}
                >
                  Sign in to existing account
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-xs text-gray-500">
          By creating an account, you agree to our{' '}
          <a href="/terms" className="text-blue-600 hover:text-blue-500">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacy" className="text-blue-600 hover:text-blue-500">
            Privacy Policy
          </a>
          <br />
          This platform is designed for children of defence personnel. By registering, you confirm that you meet this criteria.
        </div>
      </div>
    </div>
  );
}