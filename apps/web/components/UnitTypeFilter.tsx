'use client';

import { ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { UnitType } from '@/hooks/useDataQueries';

const ALL_TYPES: UnitType[] = ['TRACTOR', 'TRAILER', 'SWITCHER', 'BOX_TRUCK', 'AUTO', 'MISC'];

const LABELS: Record<UnitType, string> = {
  TRACTOR: 'Tractor',
  TRAILER: 'Trailer',
  SWITCHER: 'Switcher',
  BOX_TRUCK: 'Box Truck',
  AUTO: 'Auto',
  MISC: 'Misc',
};

interface UnitTypeFilterProps {
  value: UnitType[];
  onChange: (types: UnitType[]) => void;
  availableTypes?: UnitType[];
}

export function UnitTypeFilter({ value, onChange, availableTypes = ALL_TYPES }: UnitTypeFilterProps) {
  function toggle(type: UnitType) {
    if (value.includes(type)) {
      onChange(value.filter(t => t !== type));
    } else {
      onChange([...value, type]);
    }
  }

  const label = value.length === 0 || value.length === availableTypes.length
    ? 'All Types'
    : value.length === 1
    ? LABELS[value[0]!]
    : `${value.length} types`;

  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <span>{label}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-1 gap-0">
        {value.length > 0 && (
          <>
            <button
              onClick={() => onChange([])}
              className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            >
              Clear filter
            </button>
            <div className="h-px bg-border mx-1 my-1" />
          </>
        )}
        {availableTypes.map(type => {
          const selected = value.includes(type);
          return (
            <button
              key={type}
              onClick={() => toggle(type)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-md hover:bg-accent transition-colors"
            >
              <span className={selected ? 'font-medium text-foreground' : 'text-foreground/80'}>{LABELS[type]}</span>
              {selected && <Check className="h-3 w-3 text-primary shrink-0" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
