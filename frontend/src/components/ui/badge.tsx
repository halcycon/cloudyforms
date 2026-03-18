import * as React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
}

const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-primary-600 text-white border-transparent',
  secondary: 'bg-gray-100 text-gray-800 border-transparent',
  destructive: 'bg-red-100 text-red-700 border-transparent',
  outline: 'border-gray-300 text-gray-700 bg-transparent',
  success: 'bg-green-100 text-green-700 border-transparent',
  warning: 'bg-yellow-100 text-yellow-700 border-transparent',
};

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
