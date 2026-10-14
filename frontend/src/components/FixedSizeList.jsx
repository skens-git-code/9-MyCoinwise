import React, { useMemo } from 'react';
import { List } from 'react-window';

const EMPTY_ROW_PROPS = Object.freeze({});

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
  rowProps,
  style = {},
  className = '',
  overscanCount = 3,
  ...props
}) {
  const RowComponent = useMemo(() => {
    const renderRow = typeof children === 'function' ? children : null;
    return function VirtualizedRowItem({ index, style: itemStyle }) {
      if (!renderRow) return null;
      return renderRow({ index, style: itemStyle });
    };
  }, [children]);

  // Stable empty object: a fresh `rowProps={{}}` literal on every render
  // would re-render every virtualized row.
  const stableRowProps = rowProps ?? EMPTY_ROW_PROPS;

  if (!itemCount || itemCount <= 0) return null;

  return (
    <List
      rowCount={itemCount}
      rowHeight={itemSize}
      rowComponent={RowComponent}
      rowProps={stableRowProps}
      overscanCount={overscanCount}
      style={{ height, width, ...style }}
      className={className}
      {...props}
    />
  );
}

export default FixedSizeList;
