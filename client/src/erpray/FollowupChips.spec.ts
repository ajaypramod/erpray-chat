// ERPRAY-PATCH: new file.
//
// Tests parseChips() against the EXACT string shape the connector emits
// (erpray-app/packages/core/src/answerContract.ts toMarkdown()), not a
// hand-guessed approximation of it — the two repos evolve independently, and a
// test against an imagined format would pass while the real integration silently
// broke.
import { parseChips } from './FollowupChips';

describe('parseChips', () => {
  it('handles a REAL string captured from composeAnswer()/toMarkdown() (2026-07-15)', () => {
    // Not hand-typed — this is the literal output of running
    // `toMarkdown(composeAnswer({...}))` from erpray-app/packages/core, captured
    // once and pinned here. The two repos evolve independently; a test against
    // an imagined format could pass forever while the real integration silently
    // broke the day the connector's chip-formatting changed.
    const real =
      'Here are **2** results.\n\n| Customer | Sales Revenue |\n| --- | --- |\n' +
      '| Acme | $120,000 |\n| Globex | $80,000 |\n\n**Key observations**\n' +
      '- Total across 2 rows: **$200,000**.\n\n**Next:** `Export to Excel`';

    const { content, chips } = parseChips(real);
    expect(chips).toEqual(['Export to Excel']);
    expect(content).not.toContain('**Next:**');
    expect(content).toContain('Total across 2 rows'); // everything else intact
  });

  it('strips the connector\'s exact chip-line format and extracts every chip', () => {
    // Verbatim shape from answerContract.ts: `parts.push('', \`**Next:** ...\`)`
    // joined with '\n' — i.e. a BLANK line, then the chip line, at the very end.
    const markdown =
      "**$2,417,882**.\n\n**Key observations**\n- Total across 12 rows: **$2,417,882**.\n\n" +
      '**Next:** `Only past-due` · `Show as a chart` · `Export to Excel`';

    const { content, chips } = parseChips(markdown);

    expect(chips).toEqual(['Only past-due', 'Show as a chart', 'Export to Excel']);
    // The chip line — and the blank line before it — must be GONE, not just
    // hidden: leftover trailing whitespace would show up as a dangling blank
    // paragraph under every single answer.
    expect(content).toBe(
      "**$2,417,882**.\n\n**Key observations**\n- Total across 12 rows: **$2,417,882**.",
    );
    expect(content).not.toContain('Next:');
    expect(content).not.toContain('`');
  });

  it('handles the single-chip case (Export reasoner emits just one)', () => {
    const { chips, content } = parseChips('Here it is.\n\n**Next:** `Export to Excel`');
    expect(chips).toEqual(['Export to Excel']);
    expect(content).toBe('Here it is.');
  });

  it('returns no chips, and the content UNCHANGED, when there is no chip line', () => {
    const markdown = '**42**.';
    const { content, chips } = parseChips(markdown);
    expect(chips).toEqual([]);
    expect(content).toBe(markdown);
  });

  it('does not misfire on "Next:" appearing mid-answer, only at the true end', () => {
    // A hypothetical answer body that happens to contain similar-looking text
    // partway through must not be mistaken for the real, END-anchored chip line.
    const markdown = 'Next: this is not the chip line, just a coincidence.\n\nMore text after it.';
    const { content, chips } = parseChips(markdown);
    expect(chips).toEqual([]);
    expect(content).toBe(markdown);
  });

  it('does not render a broken chip while the line is still streaming in', () => {
    // The connector streams markdown in ~40-char chunks (packages/api/src/server.ts).
    // A truncated tail — the closing backtick of the last chip hasn't arrived yet
    // — must not parse as a spurious partial chip.
    const partial = 'The answer.\n\n**Next:** `Only past-due` · `Show as a ch';
    const { content, chips } = parseChips(partial);
    expect(chips).toEqual([]);
    expect(content).toBe(partial); // untouched — nothing to strip yet
  });

  it('caps at 4 chips, matching the connector\'s own cap (buildChips() slices to 4)', () => {
    const markdown =
      'x.\n\n**Next:** `a` · `b` · `c` · `d` · `e` · `f`';
    const { chips } = parseChips(markdown);
    expect(chips).toHaveLength(4);
    expect(chips).toEqual(['a', 'b', 'c', 'd']);
  });
});
