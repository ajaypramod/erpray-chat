# ERPray artifact/chip regression tests

Proves two things that were previously only checked by hand, once, in a
one-off Playwright session that left no trace once the terminal closed:

1. The connector's artifact directive syntax actually opens a Sandpack panel.
2. The sandboxed artifact iframe actually blocks `fetch()` back to the
   connector, so the chip/chat-command fallback is load-bearing, not
   speculative.

Both were real bugs once, and both were invisible to `client`'s own unit
tests — those only ever assert a markdown *string*, never open a browser.

## Running it

You need the real erpray-chat Docker image up (the exact one production
runs), with `stub-connector.mjs` in this directory standing in for the
connector — no real NetSuite or LLM credentials needed.

```bash
# 1. Start the stub connector (from this directory):
node stub-connector.mjs   # listens on :7444

# 2. Point your local librechat.yaml's custom-endpoint baseURL at it:
#      baseURL: 'http://host.docker.internal:7444/v1'
#    (see erpray-app/deploy/librechat.yaml for the full endpoint block —
#    copy it and swap only baseURL)

# 3. Bring up the chat container (mounting your edited librechat.yaml),
#    with ALLOW_REGISTRATION=true and a permissive REGISTER_MAX/LOGIN_MAX
#    for repeated local test runs — never set those that high in production.

# 4. From the erpray-chat repo root:
npm run e2e:erpray
```

## What NOT to conclude if these pass

Green here proves the FRONTEND renders the connector's answer contract
correctly. It does not prove the connector's SQL, metrics, or NetSuite
assumptions are correct — those are `erpray-app`'s own test suite and
`VALIDATION_DEBT.md`'s job.
