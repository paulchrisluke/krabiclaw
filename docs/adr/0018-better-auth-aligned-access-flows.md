# ADR 0018: Better Auth-aligned access flows

Status: Accepted  
Date: 2026-07-19

## Context

Login, signup, OAuth-provider authorization, phone verification, invitations, and site transfers previously repeated authentication UI and mixed identity verification with route-specific completion behavior. That made callback state difficult to reason about and allowed similar access paths to drift.

## Decision

- Better Auth owns identity, sessions, provider OAuth state, email verification, and phone verification.
- Invitations and site transfers remain application-domain operations. Their routes perform acceptance after Better Auth proves the invited identity; invitation or transfer state is never placed in a Better Auth callback or OAuth-provider state.
- Ordinary app return targets must pass `validatedInternalPath` and route through `/api/post-login`. External, protocol-relative, and backslash paths are rejected.
- OAuth Provider login creates a session without a manually injected callback. The plugin resumes its signed `oauth_query`; explicit account selection uses `authClient.oauth2.continue`.
- Phone OTP verification accepts only `{ phoneNumber, code }`. The shared controller normalizes identity and reports success; callers decide whether to redirect, accept an invitation, or resume another domain action.
- WhatsApp OTP delivery is scheduled with the request-scoped `waitUntil`. When unavailable, delivery is detached with a caught, redacted failure log so provider latency cannot fail the send-OTP response.
- Access pages use the focused single-column `access` layout and shared Google, email, and phone components.
- Access pages read their initial session with `authClient.useSession(useFetch)`. In the pinned Better Auth Vue client, this overload is asynchronous and resolves `data` and `error` refs with `isPending: false`; it is intentionally awaited and `isPending` is intentionally not dereferenced as a ref.

## Consequences

- Authentication components do not accept invitations or transfers and do not infer domain destinations.
- Email and Google transfer authentication return to `/transfer/{token}`, where billing and acceptance remain explicit.
- Phone invitation verification can accept immediately, with a full-page reload fallback for deployed session-cookie propagation.
- No schema or migration changes are required.

## Local verification

Apply the canonical local fixtures and run the serial access suite with provider delivery disabled:

```bash
yarn schema:local
yarn seed:local
yarn seed:pottery-local
PORT=3000 EMAIL_DELIVERY_MODE=log_only WHATSAPP_DELIVERY_MODE=log_only yarn test:e2e:access-local
```

The suite covers phone invitation creation, OTP verification, session creation, automatic acceptance, scoped editor dashboard access with location restrictions, invitation retirement, OAuth authorization/discovery, and site-transfer return and completion behavior.
