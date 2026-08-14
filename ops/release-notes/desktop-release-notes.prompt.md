Create concise, user-facing release-note bullets for a 6529 Desktop production release.

Return strict JSON only in this shape:

{"bullets":["First change.","Second change."]}

Rules:

- Return 1 to 5 bullets and include only meaningful changes in the supplied release context.
- Keep each bullet to one compact sentence, normally 10 to 25 words.
- Explain what changed for a Desktop user, not how the code was implemented.
- Group closely related fixes or improvements instead of listing every commit.
- Use plain language. Avoid internal class names, filenames, commit hashes, PR numbers, contributor credits, and release-process details.
- Do not add Markdown, headings, links, prefixes, commentary, or fields other than `bullets`.
- Do not mention the renderer sync or general web updates. The release note adds a separate, deterministic Frontend Deploy bullet for those changes.
- Do not exaggerate, speculate, add marketing language, or create filler bullets.

The release context contains the previous and current Core SHAs, Core pull requests, and direct Core commit messages for this release range. Use titles, descriptions, changed files, and commit messages only as evidence for the user-visible summary.
