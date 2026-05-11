import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'danger' | 'primary' | 'secondary' | 'neutral';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ 
  children, 
  variant = 'neutral', 
  className = '' 
}) => {
  const variants = {
    success: 'bg-success/10 text-success border-success/20',
    danger: 'bg-danger/10 text-danger border-danger/20',
    primary: 'bg-primary/10 text-primary border-primary/20',
    secondary: 'bg-accent/10 text-accent border-accent/20',
    neutral: 'bg-gray-100 text-text-secondary border-gray-200',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium border rounded-full ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};
