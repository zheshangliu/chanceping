# Localhost Live DeepSeek Design

## Goal

When ChancePing is started through the normal local development command at
`http://localhost:3000`, customer requirement interpretation and radar revision
use the commercial DeepSeek profile by default.

This change does not enable live search by default and does not change the
existing radar, search, evidence, opportunity-card, or report architecture.

## Local Development Behavior

`npm run dev` will start the API with:

- `CHANCEPING_LOAD_API_ENV=true`
- `CHANCEPING_ENABLE_LOCAL_LIVE_LLM=true`
- `CHANCEPING_LLM_PROFILE=commercial`
- `LLM_MODE=live`
- search remains mock-safe unless the existing live-search switch is explicitly enabled

The commercial profile continues to resolve the existing DeepSeek-compatible
variables from local `api.env`. Secret values must never be printed.

## Product Flow

The initial requirement generation and every radar-chat revision use the live
LLM adapter when the local development server is running. The LLM produces a
structured radar draft; schema validation, radar diff generation, confirmation,
search execution, and persistence retain their existing responsibilities.

User confirmation remains mandatory before search. Enabling live DeepSeek does
not enable Serper or any other live search provider automatically.

## Safety Boundaries

- `api.env` remains git-ignored and local-only.
- Production continues to reject local `api.env` loading and local live-LLM enablement.
- `npm run start` is not changed into an implicit local live command.
- `verify:all` and existing automated product tests remain mock-safe.
- Live-LLM verification remains explicit and separate from `verify:all`.
- Startup logs may display profile, provider, and model, but never API keys.

## Failure Behavior

If the commercial DeepSeek configuration is missing or invalid, local
development must report a clear live-LLM configuration or provider error. It
must not silently claim that a mock response came from DeepSeek.

## Verification

Automated checks must prove:

1. The normal local development command enables local `api.env`, commercial
   profile, and live LLM mode.
2. It does not enable local live search.
3. Production remains protected.
4. `verify:all` remains mock-safe.
5. The browser flow can submit a customer requirement and receive a live LLM
   radar response without console errors or secret leakage.

