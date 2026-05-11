import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  ...props 
}) => {
  const baseStyles = 'px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-light focus:ring-primary',
    secondary: 'bg-white text-text-primary border border-border hover:bg-background focus:ring-gray-400',
    accent: 'bg-accent text-white hover:opacity-90 focus:ring-accent',
    danger: 'bg-danger text-white hover:opacity-90 focus:ring-danger',
    ghost: 'bg-transparent text-text-secondary hover:bg-gray-100 hover:text-text-primary focus:ring-gray-300',
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? 'Carregando...' : children}
    </button>
  );
};
