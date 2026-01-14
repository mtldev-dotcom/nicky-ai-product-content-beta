/**
 * Toast utility functions for easy toast notifications
 * These are convenience wrappers around the useToast hook
 */

import type { ToastType } from '@/components/ui/Toast';

export interface ToastOptions {
  type?: ToastType;
  title: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Helper function to create toast notifications
 * This is a convenience wrapper - components should use useToast hook directly
 */
export function createToast(options: ToastOptions) {
  return {
    type: options.type ?? 'info',
    title: options.title,
    description: options.description,
    duration: options.duration,
    action: options.action,
  };
}

/**
 * Predefined toast messages for common scenarios
 */
export const toastMessages = {
  welcome: {
    type: 'success' as const,
    title: 'Welcome to Product Architect!',
    description: "Let's create your first product to get started.",
    duration: 6000,
  },
  emailConfirmed: {
    type: 'success' as const,
    title: 'Email confirmed!',
    description: 'Your account has been verified. Setting up your workspace...',
    duration: 4000,
  },
  orgCreated: {
    type: 'success' as const,
    title: 'Workspace created!',
    description: 'Your organization is ready. Configure your store settings next.',
    duration: 5000,
  },
  settingsSaved: {
    type: 'success' as const,
    title: 'Settings saved',
    description: 'Your configuration has been updated.',
    duration: 3000,
  },
  productCreated: {
    type: 'success' as const,
    title: 'Product created!',
    description: 'Your product has been saved successfully.',
    duration: 4000,
  },
  error: {
    type: 'error' as const,
    title: 'Something went wrong',
    description: 'Please try again or contact support if the problem persists.',
    duration: 5000,
  },
  connectionTestSuccess: {
    type: 'success' as const,
    title: 'Connection successful!',
    description: 'Your store is connected and ready to use.',
    duration: 3000,
  },
  connectionTestFailed: {
    type: 'error' as const,
    title: 'Connection failed',
    description: 'Please check your URL and API key and try again.',
    duration: 5000,
  },
};
