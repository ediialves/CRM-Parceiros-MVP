import React from 'react';
import { Search } from 'lucide-react';

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSearch?: (value: string) => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({ onSearch, className = '', ...props }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onSearch) {
      onSearch(e.target.value);
    }
    if (props.onChange) {
      props.onChange(e);
    }
  };

  return (
    <div className={`relative flex-1 ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
      <input
        type="text"
        className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-gray-400"
        onChange={handleChange}
        {...props}
      />
    </div>
  );
};
