import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({
  label,
  error,
  helperText,
  required,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}
    </div>
  );
}

export interface FormProps {
  children: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  className?: string;
  noValidate?: boolean;
}

export function Form({ children, onSubmit, className, noValidate = false }: FormProps) {
  return (
    <form
      onSubmit={onSubmit}
      noValidate={noValidate}
      className={cn('space-y-4', className)}
    >
      {children}
    </form>
  );
}

export interface FormErrorProps {
  error?: string | null;
  className?: string;
}

export function FormError({ error, className }: FormErrorProps) {
  if (!error) return null;

  return (
    <div
      className={cn(
        'bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md',
        className
      )}
      role="alert"
    >
      <div className="flex">
        <svg
          className="h-5 w-5 text-red-400 mr-2 flex-shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <span>{error}</span>
      </div>
    </div>
  );
}

export interface FormSuccessProps {
  success?: string | null;
  className?: string;
}

export function FormSuccess({ success, className }: FormSuccessProps) {
  if (!success) return null;

  return (
    <div
      className={cn(
        'bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md',
        className
      )}
      role="alert"
    >
      <div className="flex">
        <svg
          className="h-5 w-5 text-green-400 mr-2 flex-shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        <span>{success}</span>
      </div>
    </div>
  );
}