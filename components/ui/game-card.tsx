import React from 'react';
import { View, ViewProps } from 'react-native';

interface GameCardProps extends ViewProps {
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'quest';
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  default: 'bg-surface border-2 border-border',
  accent: 'bg-accent/10 border-2 border-accent/40',
  success: 'bg-success/10 border-2 border-success/40',
  warning: 'bg-warning/10 border-2 border-warning/40',
  quest: 'bg-primary/10 border-2 border-primary/40',
};

export function GameCard({ variant = 'default', children, className, ...props }: GameCardProps) {
  return (
    <View
      className={`rounded-2xl p-4 shadow-sm ${variantStyles[variant]} ${className ?? ''}`}
      {...props}
    >
      {children}
    </View>
  );
}
