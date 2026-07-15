// ERPRAY-PATCH: new file. Renders the ```vega-lite fences the ERPray connector
// emits (packages/core/src/charts.ts) — copies the Mermaid.tsx pattern (same
// directory) rather than inventing a new rendering path, per
// ERPRAY_LIBRECHAT/02_BUILD_GUIDE.md §5.5 Option B.
//
// Deliberately much smaller than Mermaid.tsx: Mermaid's 850 lines are mostly
// zoom/pan/dialog machinery for arbitrary-sized diagrams. A chart the connector
// already sized to `width:'container', height:300` doesn't need that — vega-embed
// draws directly into a fixed-height container and handles its own tooltips.
//
// NO CDN. `vega-embed` (which pulls in vega + vega-lite) is an npm dependency
// bundled by Vite at build time, never fetched at runtime — the same rule the
// connector's own artifacts follow (packages/core/src/artifacts.ts header).
import React, { memo, useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
// MermaidHeader is generic (copy/show-code/expand), not Mermaid-specific despite
// the name — it already owns copy-to-clipboard via its `codeContent` prop, so
// this component does not need its own.
import MermaidHeader from './MermaidHeader';

interface VegaLiteChartProps {
  /** The raw JSON spec, as text — the connector emits it inside the fence. */
  children: string;
}

/**
 * A spec the connector never produces two ways in a row: `buildChartSpec()`
 * (packages/core/src/charts.ts) refuses rather than emit a chart with no numeric
 * measure. If parsing or rendering still fails here, that is new information —
 * show it, don't hide it behind a blank div.
 */
const VegaLiteChart: React.FC<VegaLiteChartProps> = memo(({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const viewRef = useRef<{ finalize: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    // The connector STREAMS markdown in ~40-char chunks (packages/api/src/server.ts),
    // and this effect re-fires on every partial re-render of the surrounding
    // markdown — so for the second or two while the fence is still arriving,
    // `children` is truncated, invalid JSON. Without a debounce, that reads as a
    // "Chart didn't render" error flashing on screen before snapping to the real
    // chart the instant the last chunk lands — the exact problem Mermaid.tsx
    // solved with `useDebouncedMermaid`. A short debounce here gets the same
    // result without importing that hook's much larger diagram-specific machinery.
    const timer = setTimeout(() => {
      if (cancelled) return;
      setError(null);
      render();
    }, 250);

    async function render() {
      let spec: unknown;
      try {
        spec = JSON.parse(children);
      } catch {
        // Still mid-stream (or genuinely malformed once streaming has finished —
        // buildChartSpec() never emits invalid JSON, so if this persists after
        // the message stops streaming, that is new information worth seeing).
        if (!cancelled) setError('Malformed chart spec.');
        return;
      }

      if (!containerRef.current) return;

      try {
        // Dynamic import: vega/vega-lite/vega-embed are a genuinely large
        // dependency (~1MB minified). Most conversations never render a chart, so
        // pulling this into the MAIN bundle would tax every chat load to pay for a
        // feature most messages don't use. Vite code-splits this into its own
        // chunk, fetched once, from OUR OWN build output — still no CDN.
        const embed = (await import('vega-embed')).default;
        if (cancelled || !containerRef.current) return;

        viewRef.current?.finalize();
        const result = await embed(containerRef.current, spec as never, {
          actions: { source: false, editor: false, compiled: false, export: true },
          renderer: 'svg',
        });
        if (cancelled) {
          result.view.finalize();
        } else {
          viewRef.current = result.view;
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not render this chart.');
        }
      }
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
      viewRef.current?.finalize();
    };
  }, [children, retryCount]);

  const handleToggleCode = useCallback(() => setShowCode((v) => !v), []);
  const handleRetry = useCallback(() => setRetryCount((n) => n + 1), []);

  return (
    <div className="w-full overflow-hidden rounded-md border border-border-light">
      <MermaidHeader codeContent={children} showCode={showCode} onToggleCode={handleToggleCode} />
      {showCode && (
        <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap border-b border-border-medium bg-surface-secondary p-4 text-xs text-text-secondary">
          {children}
        </pre>
      )}
      {error ? (
        <div className="border-t border-red-500/30 bg-red-500/10 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-red-500 dark:text-red-400">
              Chart didn&apos;t render
            </span>
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
          <pre className="overflow-auto text-xs text-red-600 dark:text-red-300">{error}</pre>
        </div>
      ) : (
        <div ref={containerRef} className="w-full bg-surface-primary-alt p-2" style={{ minHeight: 260 }} />
      )}
    </div>
  );
});

VegaLiteChart.displayName = 'VegaLiteChart';

export default VegaLiteChart;
