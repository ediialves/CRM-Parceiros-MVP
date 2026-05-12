import React, { useState, useRef, useEffect } from 'react';
import { Filter, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FilterDropdownProps {
  activeCount: number;
  onClearAll: () => void;
  children: React.ReactNode;
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({ 
  activeCount, 
  onClearAll, 
  children 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200 ${
          isOpen || activeCount > 0 
            ? 'bg-primary/5 border-primary text-primary' 
            : 'bg-white border-border text-text-primary hover:border-text-secondary'
        }`}
      >
        <Filter size={18} className={activeCount > 0 ? 'fill-primary/10' : ''} />
        <span className="text-sm font-medium">
          Filtros
          {activeCount > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 bg-primary text-white text-[10px] rounded-full font-bold">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDown 
          size={16} 
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 5, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute right-0 top-full z-50 mt-2 min-w-[280px] bg-surface rounded-xl border border-border shadow-lg p-4 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">Filtros</span>
              {activeCount > 0 && (
                <button 
                  onClick={() => {
                    onClearAll();
                    setIsOpen(false);
                  }}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Limpar tudo
                </button>
              )}
            </div>
            
            <div className="space-y-4">
              {children}
            </div>
            
            <div className="mt-4 pt-4 border-t border-border flex justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors shadow-sm"
              >
                Aplicar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
