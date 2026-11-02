import React, { useMemo } from 'react';
import { List } from 'react-window';

const EMPTY_ROW_PROPS = Object.freeze({});

/**
 * Top-level static row renderer ensuring 100% stable component identity
 * so react-window never tears down or remounts DOM nodes during updates.
 */
function VirtualizedRowRenderer({ index, style, renderRow, ...rest }) {
  if (typeof renderRow !== 'function') return null;
  return renderRow({ index, style, ...rest });
}

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
  const mergedRowProps = useMemo(() => {
    return {
      renderRow: children,
      ...(rowProps || EMPTY_ROW_PROPS),
    };
  }, [children, rowProps]);

  if (!itemCount || itemCount <= 0) return null;

  return (
    <List
      rowCount={itemCount}
      rowHeight={itemSize}
      rowComponent={VirtualizedRowRenderer}
      rowProps={mergedRowProps}
      overscanCount={overscanCount}
      style={{ height, width, ...style }}
      className={className}
      {...props}
    />
  );
}

export default FixedSizeList;
