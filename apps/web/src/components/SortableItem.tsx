import React from 'react';
import { GripVertical, X } from 'lucide-react';

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  onRemove?: (id: string) => void;
}

export const SortableItem: React.FC<SortableItemProps> = ({ id, children, onRemove }) => {
  return (
    <div className="touch-none">
      <div className="flex items-center justify-between bg-ide-surface rounded border border-ide-border hover:border-ide-accent">
        <div className="flex items-center gap-2 px-2 py-1">
          <GripVertical className="h-4 w-4 text-ide-text-dim" />
          {children}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(id);
            }}
            className="mr-1 inline-flex h-7 w-7 items-center justify-center rounded text-red-500 hover:bg-red-500/10 hover:text-red-400"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};