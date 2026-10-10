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
- Keep the uploaded application's browser-local persistence for this frontend repair; validate and migrate legacy data, and report failed writes instead of claiming success.
- Put study data operations in a browser-safe model and shared React provider so notebook and course creation use explicit IDs rather than mutable global selection.
- Pre-optimize interactive dependencies together and reject outdated optimizer requests so stale preview tabs cannot mix React instances after dependency discovery.
