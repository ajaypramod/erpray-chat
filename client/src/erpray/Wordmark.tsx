// ERPRAY-PATCH: new file.
//
// THE WORDMARK RULE (BRAND_GUIDE.md §1.1) — read this before touching this file.
//
// The name has exactly one failure mode: read as "ER-Pray" ("we pray our ERP
// works"), which undermines everything the brand stands for. The fix is
// mechanical and non-negotiable: the name renders SPLIT — "ERP" in Snow
// (#EDF1F7) + "ray" in the ray gradient (#FFD34D -> #F5A623 -> #FF7847) — with a
// hair of extra letter-space between the "P" and the "r". The color break and the
// spacing ARE the pronunciation guide. A single-color "ERPray" in display type is
// a brand bug, not a style choice.
//
// This is the ONE place that split renders. Every surface that needs the wordmark
// imports this component rather than writing "ERPray" as a text literal — the
// moment a second hand-rolled copy exists, one of them will eventually regress to
// flat text and nobody will notice until a screenshot goes out.
import React from 'react';

interface WordmarkProps {
  className?: string;
  /** px, controls both font-size and the icon mark alongside it. */
  size?: number;
  /** Show the small block+beam icon mark to the left (BRAND_GUIDE.md §5). */
  withMark?: boolean;
}

export const Wordmark: React.FC<WordmarkProps> = ({ className, size = 22, withMark = false }) => (
  <span
    className={className}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: size * 0.4,
      fontFamily: "'Geist Sans', ui-sans-serif, system-ui, sans-serif",
      fontWeight: 800,
      fontSize: size,
      letterSpacing: '-0.02em',
      lineHeight: 1,
      userSelect: 'none',
    }}
  >
    {withMark && (
      // The block+beam mark, §5: a dark rounded square with a golden diagonal
      // beam breaking out of its lower-left corner past the top-right edge.
      <svg
        width={size * 1.1}
        height={size * 1.1}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <rect x="2" y="2" width="28" height="28" rx="7" fill="#121A2E" />
        <defs>
          <linearGradient id="erpray-beam" x1="6" y1="26" x2="27" y2="5" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFD34D" />
            <stop offset="0.55" stopColor="#F5A623" />
            <stop offset="1" stopColor="#FF7847" />
          </linearGradient>
        </defs>
        <path d="M7 25 L25 6" stroke="url(#erpray-beam)" strokeWidth="3.4" strokeLinecap="round" />
        <path
          d="M10.5 27 L27.5 9"
          stroke="url(#erpray-beam)"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.45"
        />
      </svg>
    )}
    <span style={{ display: 'inline-flex' }}>
      <span style={{ color: '#EDF1F7' }}>ERP</span>
      {/* The letter-space that keeps this reading as two units, ERP + ray,
          rather than one undifferentiated word. Not a hyphen — BRAND_GUIDE.md
          is explicit that a hyphen is a spoken pronunciation aid, never part of
          the written wordmark. */}
      <span style={{ marginLeft: '0.02em' }} />
      <span
        style={{
          background: 'linear-gradient(100deg, #FFD34D 0%, #F5A623 55%, #FF7847 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        ray
      </span>
    </span>
  </span>
);

/** BRAND_GUIDE.md §1.1 rule 7: tagline adjacency defends the name — keeping it
 *  visually near the wordmark primes the ERP parse before the eye hits "ray". */
export const Tagline: React.FC<{ className?: string }> = ({ className }) => (
  <span
    className={className}
    style={{
      color: '#94A1B8',
      fontFamily: "'Geist Sans', ui-sans-serif, system-ui, sans-serif",
      fontSize: 13,
      fontWeight: 500,
    }}
  >
    Ask your ERP anything.
  </span>
);

export default Wordmark;
