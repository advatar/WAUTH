Build/update the public WAUTH landing page so it matches the current specification at **v0.5.1**. Keep the same HAPP-style structure and section IDs already in use.

## Critical content updates

1. Update all visible version references from **0.5.0** to **0.5.1**.
2. Explain clearly that the **core protocol did not change** in structure; v0.5.1 adds **optional operational-safety profiles**.
3. Add a concise callout explaining the new core clarification:
   - privileged or side-effecting actions MUST NOT rely on display names, tone, urgency, or other conversational cues alone
4. Add a new “Operational Safety Profiles (v0.5.1)” subsection under **Model Overview** and/or **Core Components** describing:
   - WAUTH-REQUESTER-CONTINUITY
   - WAUTH-INSTRUCTION-SOURCE-INTEGRITY
   - WAUTH-EXEC-BUDGETS
   - WAUTH-POSTCONDITION
   - WAUTH-MULTI-AGENT-TRUST
5. Expand the **Policy Management** subsection to show that policy context can now include:
   - requester context
   - instruction source descriptors
   - execution budgets
   - expected postconditions
   - multi-agent links
6. Expand **Security** and **FAQ** to address:
   - requester spoofing / channel continuity
   - mutable memory and externally editable sources
   - persistent side effects and background jobs
   - multi-agent amplification and circular corroboration
7. Keep the exact section headings/TOC structure already used by the site.

## Tone

Standards-like, precise, readable, not overly marketing-heavy.

## One sentence positioning

WAUTH v0.5.1 keeps the core mandate/capability protocol intact while adding optional profiles that make requester authority, instruction integrity, execution budgets, verified outcomes, and multi-agent trust first-class security boundaries.
