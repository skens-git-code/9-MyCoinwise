import React, { useMemo } from 'react';
import { List } from 'react-window';

/**
 * High-performance virtualized list adapter wrapping react-window v2 `List`.
 * Provides seamless drop-in API compatibility for <FixedSizeList>
 * while supporting modern React 19 concurrent features.
 */
export function FixedSizeList({
  height,
  width = '100%',
  itemCount = 0,
  itemSize = 50,
  children,
  style = {},
  className = '',
  overscanCount = 3,
  ...props
}) {
  const RowComponent = useMemo(() => {
    return function VirtualizedRowItem({ index, style: itemStyle }) {
      if (typeof children === 'function') {
        return children({ index, style: itemStyle });
      }
      return null;
    };
  }, [children]);

  if (!itemCount || itemCount <= 0) return null;

  return (
    <List
      rowCount={itemCount}
      rowHeight={itemSize}
      rowComponent={RowComponent}
      rowProps={{}}
      overscanCount={overscanCount}
      style={{ height, width, ...style }}
      className={className}
      {...props}
    />
  );
}

export default FixedSizeList;
