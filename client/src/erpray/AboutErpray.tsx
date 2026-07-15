/**
 * The in-app half of MIT compliance (AGENT_BUILD_INSTRUCTIONS.md §1.1): the
 * LICENSE file at repo root satisfies the legal letter, but a customer using
 * the product never opens that file. This is the surface they actually see —
 * rendered in the General settings tab, the one place every user eventually
 * looks, rather than a dedicated "About" tab (which would need a new
 * SettingsTabValues enum member in the upstream `librechat-data-provider`
 * package — a far larger patch than crediting LibreChat actually requires).
 */
import React from 'react';

function AboutErpray() {
  return (
    <div className="pb-3 text-xs text-text-secondary">
      <div className="border-t border-border-light pt-3">
        ERPray is built on{' '}
        <a
          href="https://librechat.ai"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-text-primary"
        >
          LibreChat
        </a>
        , used under the{' '}
        <a
          href="https://github.com/danny-avila/LibreChat/blob/main/LICENSE"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-text-primary"
        >
          MIT License
        </a>
        .
      </div>
    </div>
  );
}

export default React.memo(AboutErpray);
