<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application rules
- Use TanStack file routes for home, subjects, notebooks, and settings so navigation remains shareable and supports browser history.
- Keep a per-account browser cache for offline use and synchronize it through revision-checked Supabase account documents; preserve legacy data and concurrent notebook edits, and report failed local or cloud writes instead of claiming success.
- Put study data operations in a browser-safe model and shared React provider so notebook and course creation use explicit IDs rather than mutable global selection.
- Pre-optimize interactive dependencies together and reject outdated optimizer requests so stale preview tabs cannot mix React instances after dependency discovery.
- All study AI tries native Gemini with server-only BOARD_AI_* configuration first, then native Grok/xAI with GROK_API_KEY on technical failures (XAI_API_KEY and a grok_/xai- key in the legacy GROQ_API_KEY field are also accepted). Groq remains a compatibility option only when Grok is not configured. Do not switch merely because a Gemini generation takes 25 seconds; preserve the healthy primary request and load the alternative provider SDK only after a primary failure. Keep separate alternative text/vision models and preserve structured-output validation, session accounting, safe error logs and server-only keys. PDF fallback uses extracted text only and must never claim to read diagrams or scanned pages.
