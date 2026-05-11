import React from 'react';

interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ message = 'Carregando informações...' }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 gap-4 w-full h-full min-h-[200px]">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      <p className="text-text-secondary animate-pulse">{message}</p>
    </div>
  );
};
