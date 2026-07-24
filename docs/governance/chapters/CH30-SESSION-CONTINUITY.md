# Chapter 30 — Session Continuity

**Constitution version:** v2.1 Draft  
**Status:** Draft — Pending Ratification (BDR-010)  
**Scope:** Platform-wide (DX OSE Frontend session layer)  
**Operational defaults:** `OSE-backend/docs/governance/config/continuity-policy-defaults.json`  
**Supersedes:** None  
**Related chapters:** 7 (Draft & Recovery), 8 (Concurrency), 14 (Attachments), 17 (Keyboard)

---

## 30.1 Purpose

This chapter defines how the platform **maintains an authenticated user session** during long operational work without exposing token mechanics to end users, and how session end interacts with **Document State Protection** (Chapter 7.10).

Session continuity is a **platform policy**. Individual modules SHALL NOT implement independent token refresh or session-timeout logic.

Numeric timing values (refresh margin, idle threshold) are **operational configuration** governed by BDR-010 and the approved defaults file. They SHALL NOT be hard-coded as immutable Constitution text.

---

## 30.2 Separation of concerns

The frontend authentication stack SHALL comprise three distinct responsibilities:

### 30.2.1 AuthService

The AuthService SHALL be responsible only for:

- User login and logout
- Storage and retrieval of access and refresh tokens
- Execution of `refresh()` against the authentication API
- Decoding non-sensitive JWT claims required by other services (e.g. `exp`)

The AuthService SHALL NOT schedule proactive refresh, detect user idle state, or manage post-login navigation recovery.

### 30.2.2 SessionManager

The SessionManager SHALL be responsible for:

- Monitoring access-token expiry using JWT `exp`
- Scheduling **proactive refresh** before token expiry while the session is Active
- Tracking user activity and applying the **idle policy** (§30.4)
- Coordinating session-end handling with Document State Protection (§30.6)
- Capturing and restoring `returnUrl` after re-authentication
- Executing **full session recovery** per §30.6.2

The SessionManager SHALL NOT perform login UI flows or implement HTTP request retry logic.

### 30.2.3 HTTP Interceptor (fallback)

The HTTP Interceptor SHALL:

- Attach credentials to API requests
- On `401` responses where the error code is `TOKEN_EXPIRED` or `PERMISSIONS_STALE`, invoke a **single-flight** token refresh and retry the failed request **once**

The Interceptor SHALL NOT be the primary mechanism for keeping sessions alive during active use. Proactive refresh (§30.3) is the primary mechanism.

---

## 30.3 Proactive refresh

### 30.3.1 Scheduling

After every successful login or token refresh, the SessionManager SHALL read the access-token `exp` claim and schedule the next refresh **before** expiry using a **configurable safety margin**.

The safety margin SHALL be read from approved platform configuration (BDR-010 defaults file or deployment override). The Constitution does not fix the margin in minutes.

### 30.3.2 Active-session requirement

Proactive refresh SHALL execute only when the session state is **Active** (§30.4). Proactive refresh SHALL NOT run while the session is **Idle**.

### 30.3.3 Refresh failure

If proactive or reactive refresh fails, the platform SHALL treat the session as ended and apply §30.6. Silent infinite retry loops are prohibited.

---

## 30.4 Idle detection

### 30.4.1 Activity signals

The platform SHALL define which user actions reset the idle timer. At minimum, the approved configuration SHALL include:

- Mouse movement and clicks
- Keyboard input
- Touch input
- Scroll events
- In-application navigation (router transitions)

Background polling, websocket heartbeats, and translation file fetches SHALL NOT count as user activity.

### 30.4.2 Idle threshold

When no configured activity signal occurs for the **configured idle duration**, the session state SHALL become **Idle**.

The idle duration SHALL be read from approved platform configuration. The Constitution does not fix the duration in minutes.

While Idle:

- Proactive refresh SHALL be **suspended**
- The refresh token MAY remain valid until its own expiry

### 30.4.3 Resume from idle

On the first activity signal after becoming Idle:

- If the refresh token is still valid, the platform SHALL refresh the access token and return the session to **Active**
- If the refresh token is no longer valid, the platform SHALL end the session per §30.6

---

## 30.5 Session states

| State | Definition |
|-------|------------|
| **Active** | User activity within the configured idle threshold; proactive refresh enabled |
| **Idle** | No user activity for the configured idle duration; proactive refresh suspended |
| **Ended** | Access and refresh tokens can no longer be renewed; user must re-authenticate |

Only one session state machine SHALL exist at platform level.

---

## 30.6 Session end and recovery

### 30.6.1 Session end

When the session becomes **Ended**:

1. The platform SHALL invoke registered **flush handlers** (Chapter 7.10) to persist unsaved draft data on a best-effort basis without blocking redirect indefinitely.
2. The platform SHALL display a clear, translated message that the session has expired.
3. The platform SHALL persist `returnUrl` representing the current workspace location.
4. The platform SHALL redirect the user to the login screen.
5. Leave-page protection (Chapter 7.10) SHALL NOT block redirect caused by session expiry.

### 30.6.2 Full session recovery (REQ-SESSION-RECOVERY-001)

After successful re-authentication caused by session expiry, the platform SHALL:

1. Restore the user's workspace context by navigating to the persisted `returnUrl` when safe to do so.
2. Restore an available draft (server or local) for that workspace without requiring the user to re-enter data that was already persisted.
3. Apply Chapter 7.8 validation and Continue/Discard rules before applying recovered draft content to the screen.
4. Present a clear notice when recovery is partial (e.g. a temporary attachment was cleaned up per Chapter 14.10).

The user SHALL NOT be required to manually navigate back to the interrupted screen or re-type fields that the platform had already flushed or saved.

---

## 30.7 Tenant switch and subscription errors

Session continuity logic SHALL NOT terminate an active session during an in-flight **tenant switch** request.

Subscription-expired and permission-stale errors SHALL follow existing platform error handling and SHALL NOT be conflated with session expiry unless the authentication token is invalid.

---

## 30.8 Security constraints

- Refresh tokens SHALL remain HTTP-only cookies where currently implemented; client code SHALL NOT persist refresh tokens in `localStorage`.
- SessionManager scheduling SHALL use timers that are cleared on logout.
- Session continuity features SHALL NOT bypass multi-tenant isolation or permission checks.

---

## 30.10 Observability and telemetry

### 30.10.1 Purpose

Session continuity behavior SHALL be **observable** in production without ad-hoc instrumentation added per screen. This section defines a **platform event contract**. It does not mandate a specific telemetry provider (Application Insights, OpenTelemetry, console diagnostics, or other sinks are implementation choices).

### 30.10.2 SessionManager events

SessionManager SHALL emit the following named events (or semantic equivalents registered in the platform telemetry catalog):

| Event | When emitted | Minimum payload |
|-------|--------------|-----------------|
| `session.proactive_refresh.started` | Proactive refresh timer fires | `tenantId`, `userId`, `scheduledAt`, `expiresAt` |
| `session.proactive_refresh.succeeded` | Access token renewed proactively | `tenantId`, `userId`, `newExpiresAt` |
| `session.proactive_refresh.failed` | Proactive refresh fails | `tenantId`, `userId`, `errorCode`, `willEndSession` |
| `session.idle.entered` | Session becomes Idle | `tenantId`, `userId`, `idleSince` |
| `session.idle.resumed` | Activity resumes from Idle | `tenantId`, `userId`, `refreshAttempted` |
| `session.expired` | Session becomes Ended | `tenantId`, `userId`, `reason`, `returnUrlCaptured` |
| `session.recovery.started` | Post-login recovery begins | `tenantId`, `userId`, `returnUrl` |
| `session.recovery.succeeded` | returnUrl restored | `tenantId`, `userId` |
| `session.recovery.failed` | Recovery cannot complete | `tenantId`, `userId`, `failureReason` |

### 30.10.3 Emission rules

- Events SHALL be emitted at the service boundary (SessionManager), not duplicated by every screen.
- Events SHALL NOT include access tokens, refresh tokens, passwords, or full draft payloads.
- Correlation identifiers (`tenantId`, `userId`, `screenKey` where applicable) are permitted.
- Failed events SHALL include a stable `errorCode` or categorized `failureReason` suitable for alerting.

### 30.10.4 Draft continuity events

DraftManager observability events are defined in **Chapter 7 §7.12.8**. Session and draft events SHALL use consistent naming and correlation fields so operators can trace a session-expiry recovery through to draft restore.

---

## 30.11 Compliance and rollout

Implementation SHALL follow the phased rollout defined in **BDR-010**. No operational module SHALL ship bespoke session refresh logic after Chapter 30 is ratified.

New and revised capabilities touching authentication or long-form entry SHALL declare Chapter 30 in the Chapter 29 applicability register.
