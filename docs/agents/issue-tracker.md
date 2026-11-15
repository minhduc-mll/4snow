# Issue tracker: Local Markdown

Issues live under `.scratch/<feature-slug>/`.

- Store each implementation ticket in `issues/<NN>-<slug>.md`, numbered from 01 in dependency order.
- Record Status and Blocked by near the top of each ticket.
- List blocking ticket numbers and titles. A ticket can start only when its blockers are resolved.
- Append discussion under Comments; retain acceptance criteria.
- Mark completed tickets resolved.

Specs default to `.scratch/<feature-slug>/spec.md`. When a feature already has an authoritative specification, link to it rather than duplicating it. Vua tiếng Việt uses its existing specification under docs/features.

“Publish tickets” means create individual local ticket files. “Fetch a ticket” means read its file, including comments.

For wayfinding, use `.scratch/<feature-slug>/map.md` with child tickets. Record ticket Type, mark work claimed before starting, and record the answer and resolved status when finished.
