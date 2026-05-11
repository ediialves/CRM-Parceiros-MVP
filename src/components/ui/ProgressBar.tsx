import React from 'react';

interface ProgressBarProps {
  progress: number; // 0 to 100
  label?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, label, className = '' }) => {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={`w-full space-y-1 ${className}`}>
      {label && (
        <div className="flex justify-between text-xs font-medium text-text-secondary mb-1">
          <span>{label}</span>
          <span>{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary-light transition-all duration-500 ease-out" 
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
};
