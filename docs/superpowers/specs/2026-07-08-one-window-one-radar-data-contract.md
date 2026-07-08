# Q.7-I/J One Window One Radar Data Contract

## Goal

ChancePing now treats one radar as one long-lived chat window. The next milestone is not a UI rewrite; it is a data and behavior closure so every radar window keeps its own context, survives refresh, and does not leak into another radar.

## Product Rules

1. One `RadarChatWindow` represents one radar workspace.
2. The built-in public radar, `全球 AI 赛事导航`, is always available to every visitor.
3. The built-in public radar is not counted against the user's three custom radar windows.
4. The built-in public radar cannot be renamed or deleted by the user.
5. A free visitor can keep at most three custom radar windows.
6. Deleting a custom radar window is a hard delete. It removes the window and messages and releases quota.
7. A custom radar window owns its own:
   - messages
   - pending input
   - memory summary
   - draft radar snapshot
   - confirmed radar version
   - latest run/report ids
   - latest result snapshot
8. Switching windows must restore that window only.
9. Refreshing the page must restore the active window when possible.
10. The public AI Events page is separate from the backend radar workspace. It reads stored event data and should not run live search on page load.

## Built-In AI Events Radar

The built-in radar id is:

```text
ai-event-sample-room
```

Display name:

```text
全球 AI 赛事导航
```

It behaves like a protected sample room:

- visible in the left sidebar
- visible from the backend entry points
- opens the AI events radar chat/demo flow
- not counted in custom window quota
- not deletable
- not a user-owned custom radar

## Custom Radar Windows

Custom windows are user owned. In the current anonymous MVP, `userId` is generated per browser/user context.

Required behavior:

- Creating a new custom radar creates a new `RadarChatWindow`.
- Creating the fourth custom radar returns `RADAR_CHAT_QUOTA_EXCEEDED`.
- Deleting any custom radar releases one quota slot.
- A deleted window must not appear in active or archived lists.
- Messages of deleted windows are removed.

## Context Contract

Every generate or revise request that includes `chatWindowId` must hydrate context from the matching window:

- current `memorySummary`
- recent messages
- current draft snapshot
- current confirmed radar version

The LLM may use that context to draft or revise the radar, but it must not directly write a confirmed radar or run search. The frontend still waits for user confirmation before running or replaying results.

## Scope Boundaries

This milestone does not include:

- changing the AI Events public page design
- adding login
- adding payments
- changing Q.6 opportunity gates
- live provider changes
- Alibaba Cloud deployment changes

