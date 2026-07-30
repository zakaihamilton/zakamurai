# AI memory profiling

Use this workflow to validate browser-local AI changes on real hardware. Automated tests exercise
the lifecycle and cleanup rules, but they cannot reproduce WebGPU allocation pressure or device
loss accurately.

## Automated lifecycle soak

```bash
npm run test:ai-soak
```

The soak alternates 200 completion and agent requests against the same mocked engine. It verifies
that smaller completion contexts reuse a larger loaded engine, RAG memory is handed off only once,
and the WebGPU reservation is released after unloading. It does not download a model or measure
real GPU memory.

## Real-device run

1. Start the app with `npm run dev`, open Chrome, and cache the prompt and completion models from
   the model manager.
2. Open Chrome Task Manager and DevTools **Performance monitor**. Record the tab's JavaScript
   memory and the browser GPU process memory after the workspace becomes idle.
3. Run at least 20 cycles of:
   - several completion-triggering edits less than 15 seconds apart;
   - one agent request using the active prompt model;
   - cancellation of one in-progress request;
   - another completion request.
4. Background the tab for at least 60 seconds, return to it, and run one more request.
5. From the More actions menu, choose **Export Support Report**. Summarize its local AI metrics:

```bash
npm run analyze:ai -- /path/to/zakamurai-support-report.json
```

Chromium exposes a non-standard JavaScript heap reading, so its support reports include heap start,
end, and delta fields. Browsers without that API simply omit those fields. GPU memory must still be
read from the browser or operating-system task manager.

## What to look for

- After the first shared-model request, nearby completion/agent cycles should not repeatedly report
  initialization time.
- A WebGPU failure in RAG should produce one fallback warning per worker lifetime, not one per file.
- Cancellation should finish promptly without leaving the AI status in a generating state.
- After the 60-second idle unload and a DevTools garbage collection, JavaScript and GPU memory
  should move back toward the post-load baseline. Investigate sustained growth over three repeated
  runs or growth greater than roughly 15% of the baseline.
- Recovery count, p95 latency, time to first token, and peak JavaScript heap should not regress
  materially between builds on the same device and browser version.

Record the browser version, operating system, model IDs, device memory, baseline, peak, and
post-idle readings with every profile so results remain comparable.
