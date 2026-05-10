## Community Hub implementation update — shared GitHub auth path, setup controls, and discussion/help sync

This batch implements the first real cleanup pass on the Community Hub gap between help text and actual behavior.

### What was fixed in code

- Community Hub readiness is now treated as **token-based**, not blocked solely because GitHub CLI is missing.
- The hub now surfaces an **inline setup banner** with real diagnostics instead of only showing `Setup Required`.
- The banner can:
  - show whether Git and GitHub CLI are installed
  - show active GitHub account / saved account count
  - switch to a saved GitHub account
  - accept a GitHub PAT directly inside Community Hub
  - refresh hub status without leaving the panel
- Discussion feed sorting was expanded to include:
  - `Newest`
  - `Recently Updated`
  - `Top Voted`
  - `Trending`
- Discussion threads gained:
  - comment-level reaction controls
  - nested reply display
  - targeted reply-to-comment flow

### Why this matters

The original help/roadmap promised a one-point GitHub integration path. In practice the Community Hub was acting like a separate auth island. This change moves it back toward a shared GitHub access model.

### Documentation sync work tied to this batch

The help registry is being updated so the GitHub Integration section links to:

- this roadmap discussion
- the new follow-up design discussion spawned from user architecture feedback
- the exact feature areas that are now implemented in the Community Hub

### Related follow-up discussion

A separate architecture discussion is being created around assistant boundaries / change brokerage / memory provenance, based on external community feedback from Discussion #2. That thread will be linked back into both the help registry and the original discussion.

Fun Fact: the Community Hub panel was already closer to being real than it looked — the backend discussion routes, reply mutation, reaction mutation, and notification tables were already there. The missing piece was mostly the boundary between the existing auth system and the panel UX.
