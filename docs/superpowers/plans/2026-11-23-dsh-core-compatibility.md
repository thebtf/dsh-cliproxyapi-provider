# DSH core compatibility

Goal: ship one public npm package for DSH 0.2.2 from rc.3 and 0.2.3 from alpha.2, including the cores used by official Desktop, Desktop NEXT, and Desktop Beta. Do not change users' live installations or imply full Desktop verification from core tests.

1. Reproduce the removed credential assertion import on alpha.2 and cover trim, invalid-key rejection and redaction in discovery. Select the published normalization export by capability rather than parsing a version string.
2. Verify npm dependency ranges and the DSH admission range separately. Retain the baseline lockfile graph and allow the observed 0.2.3 prerelease peers. Update the multilingual compatibility documentation.
3. Verify strict installation and entrypoint loading of the same unmodified tarball across rc.3, rc.5 and alpha.2. Run the complete isolated core test matrix, with the original manifest tested separately.
4. Ship through the normal npm, release artifact, and Discover workflow after review. Report source and core coverage separately from actual packaged-host startup and GUI coverage.
