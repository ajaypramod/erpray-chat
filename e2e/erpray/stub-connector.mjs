/**
 * A stub standing in for the real ERPray connector (erpray-app), for exactly
 * one purpose: prove the erpray-chat FRONTEND renders the connector's answer
 * contract correctly — chips as real buttons, charts, and (the one that
 * mattered most) the grid artifact opening a REAL Sandpack panel rather than
 * a syntax-highlighted code dump.
 *
 * This exists because that exact bug shipped once and stayed green in unit
 * tests for weeks: every assertion checked the markdown STRING, never a
 * rendered browser. See erpray-app's packages/core/src/artifactDirective.ts
 * for the full story. `artifacts.spec.ts` in this directory is the test that
 * would have caught it — run it after any change to how erpray-chat parses
 * or renders the connector's markdown, not just after a change to this stub.
 *
 * Usage: `node stub-connector.mjs` (defaults to :7444), or
 * `PORT=7444 node stub-connector.mjs`. Point erpray-chat's librechat.yaml
 * custom-endpoint baseURL at this (from inside Docker on Windows/Mac:
 * `http://host.docker.internal:<PORT>/v1`).
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 7444);

const CHART_SPEC = {
  $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
  title: 'Sales Revenue by Customer',
  data: {
    values: [
      { customer: 'Acme Corp', sales_revenue: 120000 },
      { customer: 'Globex', sales_revenue: 80000 },
      { customer: 'Initech', sales_revenue: 45000 },
    ],
  },
  mark: { type: 'bar', tooltip: true },
  encoding: {
    x: { field: 'customer', type: 'nominal', sort: null, axis: { labelAngle: -35 } },
    y: { field: 'sales_revenue', type: 'quantitative', axis: { format: '$,.0f' } },
    color: { value: '#F5A623' },
  },
  width: 'container',
  height: 300,
  config: { background: 'transparent' },
};

/** Shaped like renderGrid() in erpray-app's packages/core/src/artifacts.ts —
 *  including the fetch() call to /v1/embed-api/preview, the exact call whose
 *  sandboxed-iframe behavior artifacts.spec.ts's sandbox test exercises. */
function gridHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Grid</title>
<style>
body{margin:0;font-family:system-ui;background:#06080F;color:#EDF1F7;padding:16px}
table{border-collapse:collapse;width:100%}
th,td{padding:8px 12px;border-bottom:1px solid #1D2842;text-align:left}
#msg{margin-top:12px;padding:10px;border-radius:8px;font-size:13px}
.ok{background:#0F2A1B;color:#8BD5A0}
.bad{background:#2E1518;color:#FF8B8B}
</style></head><body>
<h3>Sandbox fetch test</h3>
<table><thead><tr><th>Order</th><th>Due Date</th></tr></thead>
<tbody><tr><td>SO1042</td><td id="cell">2026-07-22</td></tr></tbody></table>
<button id="btn">Test fetch() to connector</button>
<div id="msg"></div>
<script>
document.getElementById('btn').onclick = async () => {
  const msg = document.getElementById('msg');
  msg.className = ''; msg.textContent = 'calling...';
  try {
    const res = await fetch('http://localhost:${PORT}/v1/embed-api/preview', {
      method: 'POST',
      headers: {'Content-Type':'application/json','X-ERPray-Embed-Token':'stub-token'},
      body: JSON.stringify({actionId:'so.set_due_date', targetId:'1', value:'2027-01-01'}),
    });
    const data = await res.json();
    msg.className = 'ok';
    msg.textContent = 'FETCH SUCCEEDED (sandbox does NOT block it): ' + JSON.stringify(data);
  } catch (e) {
    msg.className = 'bad';
    msg.textContent = 'FETCH BLOCKED (TypeError, as the fallback path expects): ' + e.message;
  }
};
</script>
</body></html>`;
}

/** The REAL directive shape (packages/core/src/artifactDirective.ts): the
 *  HTML body wrapped in its OWN ```html fence INSIDE the directive. A bare
 *  fence, or a directive with no inner fence, both render as a plain code
 *  block — not an opened artifact panel. */
function artifact(id, title, html) {
  return [`:::artifact{identifier="${id}" type="text/html" title="${title}"}`, '```html', html, '```', ':::'].join(
    '\n',
  );
}

const GRID_ANSWER = `**$245,000**.

**Key observations**
- Top customer, Acme Corp, is 49% of the total — concentration worth watching.

_The query behind this answer_

\`\`\`sql
SELECT BUILTIN.DF(t.entity) AS customer, SUM(tl.netamount) AS sales_revenue
FROM transactionline tl JOIN "transaction" t ON tl."transaction" = t.id
WHERE t.type = 'CustInvc' AND tl.mainline = 'F' AND tl.taxline = 'F' AND tl.cogs = 'F'
GROUP BY BUILTIN.DF(t.entity) ORDER BY SUM(tl.netamount) DESC
\`\`\`

\`\`\`vega-lite
${JSON.stringify(CHART_SPEC, null, 2)}
\`\`\`

${artifact('erpray-grid', 'Grid', gridHtml())}

[Open "Grid" in a new tab](http://localhost:${PORT}/embed/grid/stub-token) — full screen, always works.

**Next:** \`Only past-due\` · \`Show as a chart\` · \`Export to Excel\``;

const REFINED_ANSWER = `Filtered to past-due rows only — served from what you already asked for, no new query.

| Order | Due Date |
|---|---|
| SO1042 | 2026-07-22 |

**Next:** \`Show as a chart\` · \`Export to Excel\``;

function answerFor(question) {
  if (/only past-due|past-due/i.test(question)) return REFINED_ANSWER;
  return GRID_ANSWER;
}

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};

  if (req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ object: 'list', data: [{ id: 'erpray-balanced', object: 'model' }] }));
  }

  if (req.url === '/embed/grid/stub-token') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(gridHtml());
  }

  if (req.url === '/v1/embed-api/preview') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(
      JSON.stringify({
        token: 'preview-' + randomUUID(),
        summary: 'Change the due date on sales order **SO1042** from **2026-07-22** to **2027-01-01**.',
        before: '2026-07-22',
        after: '2027-01-01',
      }),
    );
  }

  if (req.url === '/v1/chat/completions') {
    const question = body.messages?.[body.messages.length - 1]?.content ?? '';
    if (question.startsWith('ERPRAY_FAST_TITLE')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          id: 'x',
          object: 'chat.completion',
          created: 0,
          model: 'erpray-balanced',
          choices: [{ index: 0, message: { role: 'assistant', content: 'E2E demo' }, finish_reason: 'stop' }],
        }),
      );
    }

    const markdown = answerFor(question);

    if (body.stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const id = 'chatcmpl-' + randomUUID();
      const send = (delta, finish = null) =>
        res.write(
          `data: ${JSON.stringify({
            id,
            object: 'chat.completion.chunk',
            created: 0,
            model: 'erpray-balanced',
            choices: [{ index: 0, delta, finish_reason: finish }],
          })}\n\n`,
        );
      send({ role: 'assistant', content: '' });
      for (let i = 0; i < markdown.length; i += 60) send({ content: markdown.slice(i, i + 60) });
      send({}, 'stop');
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        id: 'x',
        object: 'chat.completion',
        created: 0,
        model: 'erpray-balanced',
        choices: [{ index: 0, message: { role: 'assistant', content: markdown }, finish_reason: 'stop' }],
      }),
    );
  }

  res.writeHead(404);
  res.end('not found: ' + req.url);
});

server.listen(PORT, () => console.log(`erpray e2e stub connector listening on :${PORT}`));
