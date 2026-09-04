# Engineering Handoff Reports

`docs/handoff/` is the review boundary between Codex implementation and ChatGPT engineering/product/business review.

For every version, create `V{version}_HANDOFF_{YYYY-MM-DD}.md` after the implementation commit and before review. The report must record the exact branch, commit SHA, changed files, architecture and business impact, test evidence, deployment evidence, known issues, and the recommended next action. Reports are append-only evidence: do not rewrite metrics or remove failed runs to make a gate pass.

## Completion protocol

1. Implement on a non-`main` branch.
2. Run the required typecheck, build, verify, and regression commands.
3. Commit the implementation and push the branch to GitHub.
4. Deploy only with explicit release approval, then record the deployment ID and remote smoke result.
5. Create the handoff report from the immutable commit and runtime evidence.
6. ChatGPT reviews the latest commit, this handoff report, the diff, tests, and production status, then returns `APPROVE`, `HOLD`, or `BLOCKED`.

## Review status vocabulary

- `APPROVE`: engineering, product, and business gates are satisfied.
- `HOLD`: implementation is usable, but a stated review or business gate remains open.
- `BLOCKED`: progress is prevented by an external dependency or failed safety gate.

