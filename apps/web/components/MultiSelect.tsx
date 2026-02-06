'use client';

import { useState, useEffect, useRef } from 'react';

interface Option {
  label: string;
  value: string;
}

interface MultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({ options, selected, onChange, placeholder = 'Select...', className = '' }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleOption = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div
        className="flex items-center justify-between w-full px-3 py-2 bg-bg-card border border-border rounded-md cursor-pointer min-h-[44px] min-w-[200px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-sm text-text-primary truncate select-none mr-2">
          {selected.length === 0
            ? placeholder
            : `${selected.length} selected`}
        </span>
        <div className="flex items-center gap-2">
          {selected.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              className="text-xs text-text-secondary hover:text-text-primary transition-colors mr-1 underline"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              title="Clear all"
            >
              Clear
            </span>
          )}
          <svg className={`w-4 h-4 text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-bg-card border border-border rounded-md shadow-lg max-h-60 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-border">
            <input
              type="text"
              placeholder="Search..."
              className="w-full p-1 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-primary"
              value={searchTerm}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredOptions.length === 0 ? (
              <div className="p-2 text-sm text-text-secondary text-center">No options found</div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center px-3 py-2 cursor-pointer hover:bg-bg-hover"
                  onClick={() => toggleOption(option.value)}
                >
                  <div className={`w-4 h-4 mr-2 border rounded flex items-center justify-center ${selected.includes(option.value) ? 'bg-primary border-primary' : 'border-text-secondary'}`}>
                    {selected.includes(option.value) && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-text-primary select-none">{option.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
