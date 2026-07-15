// ERPRAY-PATCH: new file.
//
// The connector always ends an answer with one machine-parseable line
// (packages/core/src/answerContract.ts `toMarkdown()`, chips are ALWAYS the last
// section pushed):
//
//   **Next:** `Only past-due` · `Show as a chart` · `Export to Excel`
//
// Until this patch, that line rendered as literal text — a bold "Next:" label
// followed by inline code spans a user cannot click. This is the ONE thing that
// makes it interactive: strip the line out of the markdown before it reaches
// ReactMarkdown, and render 2-4 pill buttons in its place that submit the chip
// text as the next user message.
//
// This one small patch also replaces all 11 of SyteRay's old per-message action
// buttons (AGENT_BUILD_INSTRUCTIONS.md §5.4) — those were only canned prompt
// triggers, which is exactly what this does, generically, driven by the
// connector's own answer contract instead of a hardcoded button list.
import React, { memo, useCallback } from 'react';
import { useSubmitMessage } from '~/hooks';

/**
 * The chip line is always the LAST thing in the markdown (see the module header
 * for why that's guaranteed, not assumed) — anchored at end-of-string so this
 * can never misfire on a coincidental "**Next:**" appearing mid-answer.
 *
 * Deliberately NOT global/multiline: exactly one match, at the end, or none.
 */
const CHIP_LINE = /\n\n\*\*Next:\*\*\s*((?:`[^`]+`(?:\s*·\s*)?)+)\s*$/;
const CHIP_TERM = /`([^`]+)`/g;

export interface ParsedChips {
  /** The markdown with the chip line removed — feed THIS to ReactMarkdown. */
  content: string;
  /** The chip labels, in the order the connector emitted them. */
  chips: string[];
}

/**
 * Pure and cheap — safe to call on every render (including every streamed
 * chunk). A message still mid-stream simply won't match yet: the connector
 * writes the chip line in one shot at the very end of a completed answer, so a
 * truncated tail reads as ordinary trailing text until the closing backtick
 * arrives, never as a broken partial chip.
 */
export function parseChips(markdown: string): ParsedChips {
  const m = CHIP_LINE.exec(markdown);
  if (!m) return { content: markdown, chips: [] };

  const chips: string[] = [];
  let t: RegExpExecArray | null;
  CHIP_TERM.lastIndex = 0;
  while ((t = CHIP_TERM.exec(m[1])) !== null) chips.push(t[1]);

  // Cap at 4 — matches the connector's own cap (answerContract.ts buildChips()
  // slices to 4) and BRAND_GUIDE-adjacent restraint: a wall of pills reads as
  // noise, not as help.
  return { content: markdown.slice(0, m.index), chips: chips.slice(0, 4) };
}

interface FollowupChipsProps {
  chips: string[];
}

/**
 * The buttons themselves. Styled as pills using the app's own semantic tokens
 * (border-medium / surface-hover / text-secondary) rather than hardcoded
 * colors, so they inherit whatever theme is active — including the Ink & Ray
 * palette from erpray/theme.css — without a second color decision living here.
 */
export const FollowupChips: React.FC<FollowupChipsProps> = memo(({ chips }) => {
  const { submitMessage } = useSubmitMessage();

  const onClick = useCallback(
    (text: string) => {
      submitMessage({ text });
    },
    [submitMessage],
  );

  if (!chips.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Suggested follow-ups">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onClick(chip)}
          className="rounded-full border border-border-medium px-3 py-1.5 text-sm text-text-secondary transition-colors duration-150 hover:border-border-heavy hover:bg-surface-hover hover:text-text-primary"
        >
          {chip}
        </button>
      ))}
    </div>
  );
});

FollowupChips.displayName = 'FollowupChips';

export default FollowupChips;
