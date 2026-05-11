import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <label className="text-sm font-medium text-text-secondary">{label}</label>}
      <input
        className={`px-3 py-2 bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-gray-400 ${className} ${error ? 'border-danger focus:ring-danger' : ''}`}
        {...props}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
};
