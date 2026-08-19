# Self-Hosted Theme

This fork adds a self-hosted light and dark theme toggle to SubBoost.

- The first visit follows the browser's system preference.
- The header button stores an explicit choice in `localStorage` under `subboost-theme`.
- The original dark mode remains available.
- Theme-only changes are confined to the root layout, local header, shared header, and global UI stylesheet.

## Updating From Upstream

Keep `SubBoost/subboost` configured as an `upstream` remote. Merge or rebase upstream changes into `main`, resolve conflicts only if they touch the theme files, then let `.github/workflows/build-theme-image.yml` publish the updated image.

The public fork is the corresponding source for the network-deployed modified application, as required by AGPL-3.0.
