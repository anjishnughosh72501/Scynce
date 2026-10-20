import { useState, useEffect, useCallback } from 'react';

export interface TvNavOptions {
  itemCount: number;
  columns?: number;
  onSelect?: (index: number) => void;
  onBack?: () => void;
  initialIndex?: number;
}

export function useTvNavigation({
  itemCount,
  columns = 1,
  onSelect,
  onBack,
  initialIndex = 0,
}: TvNavOptions) {
  const [focusedIndex, setFocusedIndex] = useState(initialIndex);

  useEffect(() => {
    if (focusedIndex >= itemCount && itemCount > 0) {
      setFocusedIndex(itemCount - 1);
    }
  }, [itemCount, focusedIndex]);

  const moveUp = useCallback(() => {
    setFocusedIndex((prev) => {
      const next = prev - columns;
      return next >= 0 ? next : prev;
    });
  }, [columns]);

  const moveDown = useCallback(() => {
    setFocusedIndex((prev) => {
      const next = prev + columns;
      return next < itemCount ? next : prev;
    });
  }, [columns, itemCount]);

  const moveLeft = useCallback(() => {
    setFocusedIndex((prev) => {
      if (prev % columns > 0) {
        return prev - 1;
      }
      return prev;
    });
  }, [columns]);

  const moveRight = useCallback(() => {
    setFocusedIndex((prev) => {
      if (prev % columns < columns - 1 && prev + 1 < itemCount) {
        return prev + 1;
      }
      return prev;
    });
  }, [columns, itemCount]);

  const select = useCallback(() => {
    if (onSelect && itemCount > 0) {
      onSelect(focusedIndex);
    }
  }, [onSelect, focusedIndex, itemCount]);

  const back = useCallback(() => {
    if (onBack) {
      onBack();
    }
  }, [onBack]);

  // Global Remote key listener (DPAD and Back)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          moveUp();
          break;
        case 'ArrowDown':
          e.preventDefault();
          moveDown();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          moveLeft();
          break;
        case 'ArrowRight':
          e.preventDefault();
          moveRight();
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          select();
          break;
        case 'Escape':
        case 'Backspace':
          e.preventDefault();
          back();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveUp, moveDown, moveLeft, moveRight, select, back]);

  return {
    focusedIndex,
    setFocusedIndex,
    moveUp,
    moveDown,
    moveLeft,
    moveRight,
    select,
    back,
  };
}
