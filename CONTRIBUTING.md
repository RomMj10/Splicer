# Contributing to Splicer

Thanks for helping improve Splicer! This guide explains how to report issues, propose changes, and get a pull request merged.

## Code of Conduct

Be respectful and constructive. Harassment, personal attacks, and discriminatory language are not tolerated. Maintainers may remove comments or contributions that break this rule.

## Ways to contribute

- Report bugs
- Suggest features or improvements
- Improve documentation or the wiki
- Submit code fixes and features

## Reporting bugs

Search [existing issues](https://github.com/RomMj10/Splicer/issues) first. If it's new, open an issue with:

- What you expected vs. what happened
- Steps to reproduce
- Browser (and OS if applicable)
- Image type and size (if relevant)
- Screenshots or a sample image, if possible

## Suggesting features

Open an issue describing the problem you want solved and your proposed solution. Wait for maintainer feedback before building something large, so your work isn't wasted.

## Project setup

Splicer has no build step and no dependencies.

1. Fork the repository and clone your fork.
2. Open `index.html` in a browser.
3. Edit files and refresh to test.

### Structure

- `index.html` page markup
- `css/style.css` editor styling
- `js/app.js` loading, slicing, list, zoom, export
- `js/zip.js` small ZIP writer (store method)
- `js/pack.js` handles stitching multiple images into one
- `assets/` sample images

## Making changes

1. Create a branch from `main`:
   ```
   git checkout -b feature/short-description
   ```
   Use prefixes like `feature/`, `fix/`, `docs/`.
2. Make focused changes. One pull request should do one thing.
3. Test manually (see checklist below).
4. Commit with clear messages, e.g. `Fix offset when padding is set`.
5. Push to your fork and open a pull request against `main`.

## Code style

- Vanilla HTML, CSS, and JavaScript only. Do not add frameworks, bundlers, or external dependencies without prior discussion.
- Match the existing style: 2-space indentation, `const`/`let`, semicolons, concise helpers.
- Use the existing CSS variables for colors so both themes (Blueprint and Dark) keep working.
- Keep the app usable offline and without a build step.

## Testing checklist

There is no automated test suite yet, so please verify by hand before submitting:

- [ ] Works in a current Chromium browser and Firefox
- [ ] Works in both themes (Blueprint and Dark)
- [ ] Grid by count, grid by size, and Custom modes still behave correctly
- [ ] Undo, selection (click, Shift, Ctrl), and batch rename/delete still work
- [ ] Export produces a valid ZIP at 1x and at another scale
- [ ] No errors in the browser console

## Pull request process

1. Fill out the pull request description: what changed, why, and how you tested it. Link related issues (e.g. `Closes #12`).
2. Include screenshots or a short recording for any UI change.
3. Keep the pull request small and focused. Unrelated changes will be asked to be split out.
4. Respond to review comments and push follow-up commits to the same branch.

### Approval required before merging

**No pull request is merged without approval.**

- Every pull request needs at least **one approving review from a maintainer** before it can be merged.
- Authors cannot approve or merge their own pull request, including maintainers.
- Pushing new commits after approval may dismiss the approval, and the pull request will need to be re-approved.
- All review conversations must be resolved before merging.
- Only maintainers merge pull requests, and only after approval.
- Direct pushes to `main` are not allowed. All changes go through a pull request.

Maintainers may request changes, ask questions, or close a pull request that doesn't fit the project's direction.

## License

By contributing, you agree that your contributions will be licensed under the same license as this project.
