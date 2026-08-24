# ChatGPT app submission checklist

This checklist complements the live MCP catalog and the OpenAI submission portal scan. Do not copy a tool catalog or store a tool count here.

## Connection and listing

- Confirm the production HTTPS MCP endpoint initializes through streamable HTTP and OAuth discovery succeeds.
- In ChatGPT web, have a workspace admin allow custom MCP apps under **Workspace Settings → Permissions & Roles → Connected Data**. Enable Developer mode under **Settings → Apps → Advanced Settings**, create KrabiClaw under **Workspace Settings → Apps → Create**, review the discovered tools, publish it to the intended users, connect through OAuth, and rerun the cases below in a new conversation.
- Verify the publisher identity, public listing, support URL, privacy policy, terms, logo, category, availability, release notes, demo credentials, and domain challenge.
- Scan the deployed MCP endpoint in the submission portal. Resolve every schema, annotation, authentication, and domain validation result before submitting.
- Inspect results for secrets, debug payloads, unnecessary personal data, and undisclosed identifiers.

## Five positive cases

1. List accessible sites and identify the fixture site without mutation.
2. Inspect the fixture homepage and current media assets.
3. Create a future-scheduled announcement with a unique title after confirmation.
4. Read the scheduled announcement back, then publish it immediately after confirmation.
5. Open the returned public URL, verify the unique title, and remove the test record through the fixture-authenticated cleanup path.

## Three negative cases

1. An explicitly read-only planning request performs no mutation.
2. A write request with ambiguous site selection asks for clarification and performs no mutation.
3. An unsupported request to delete the site logo and underlying asset performs no mutation.

Record the selected tool, arguments, confirmation behavior, structured result, error, and sanitized telemetry for every case. The continuous `yarn test:mcp:chatgpt` workflow is the recordable acceptance pass.

References: [Connect your app to ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) and [Submit your app](https://developers.openai.com/apps-sdk/deploy/submission).
