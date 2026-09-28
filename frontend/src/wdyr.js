import React from 'react';

if (import.meta.env.DEV) {
  import('@welldone-software/why-did-you-render').then((module) => {
    const whyDidYouRender = module.default;
    whyDidYouRender(React, {
      trackAllPureComponents: false,
      trackHooks: true,
      logOnDifferentValues: true,
      collapseGroups: true,
    });
  }).catch((err) => {
    console.debug('whyDidYouRender skipped:', err?.message);
  });
}
