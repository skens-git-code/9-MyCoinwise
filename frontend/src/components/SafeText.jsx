import React from 'react';
import DOMPurify from 'dompurify';

/**
 * SafeText component
 * Renders user-supplied text safely, stripping any HTML tags or script injection
 * vectors using DOMPurify with an empty allowed-tags whitelist.
 */
export default function SafeText({ children, as: Tag = 'span', ...rest }) {
  if (children === null || children === undefined) {
    return null;
  }
  const clean = DOMPurify.sanitize(String(children), { ALLOWED_TAGS: [] });
  return <Tag {...rest}>{clean}</Tag>;
}
