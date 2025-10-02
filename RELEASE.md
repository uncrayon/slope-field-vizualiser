# Release Procedure

This document describes the steps to prepare, test and publish a release of this project to TestPyPI and PyPI.

Prerequisites
- Python 3.10+ recommended for build/test steps
- Local tools: pip, build, wheel, twine
- Repository has secrets configured for CI:
  - TEST_PYPI_API_TOKEN (TestPyPI API token)
  - PYPI_API_TOKEN (PyPI API token, optional — CI will skip PyPI if empty)

Single-source version handling
- The canonical version lives in `equation_phase_portrait_tool/_version.py` (set __version__ = "X.Y.Z").
- Ensure `pyproject.toml` [project].version matches the value in `_version.py` before tagging.

Release checklist
- [ ] Update `equation_phase_portrait_tool/_version.py` to the release version (e.g. "0.1.0")
- [ ] Update `pyproject.toml` version to match
- [ ] Update `CHANGELOG.md` (add release notes under the new version)
- [ ] Commit version and changelog updates
- [ ] Create annotated tag: `git tag -a vX.Y.Z -m "Release X.Y.Z"`
- [ ] Push branch and tags: `git push origin main && git push origin --tags`
- [ ] Build distributions: sdist and wheel
- [ ] Test-install from local dist and run smoke tests
- [ ] Publish to TestPyPI and verify install/runtime
- [ ] Publish to PyPI
- [ ] Create GitHub release from tag (attach changelog / notes)
- [ ] Update README / docs if necessary
- [ ] Close milestone and update project board

Local commands (run in repository root)
- Install/upgrade build tools:
  python -m pip install --upgrade pip
  python -m pip install build wheel twine
- Bump version in `_version.py` and `pyproject.toml`
- Commit:
  git add -A
  git commit -m "Bump version to X.Y.Z"
- Tag and push:
  git tag -a vX.Y.Z -m "Release X.Y.Z"
  git push origin main
  git push origin --tags
- Build distributions:
  python -m build --sdist --wheel
- Test-install locally:
  python -m pip install dist/*.whl
- Publish to TestPyPI:
  python -m twine upload --repository-url https://test.pypi.org/legacy/ dist/*
- Verify install from TestPyPI (optional step using a clean venv)
- Publish to PyPI (after verification):
  python -m twine upload dist/*

GitHub Actions / CI notes
- CI workflow `.github/workflows/release.yml` will:
  - Build and run tests on push to main
  - Publish to TestPyPI and PyPI when a tag matching `v*` is pushed
- Ensure repository secrets TEST_PYPI_API_TOKEN and PYPI_API_TOKEN are added in the repository settings

Excluding development artefacts
- The package excludes local dev files such as `backend/jobs.sqlite` and `backend/worker_runs.log`. See:
  - `MANIFEST.in` (excludes)
  - `pyproject.toml` [tool.setuptools.exclude-package-data]

Troubleshooting
- If twine upload fails with authentication, confirm the token secret is valid and has the correct scope.
- If package metadata is incorrect on install, verify `pyproject.toml` fields and that `_version.py` and pyproject version match.
- If static assets are missing after install, confirm that `MANIFEST.in` + package-data entries are correct and that `include-package-data = true` is set.

Post-release housekeeping
- Add release notes to `CHANGELOG.md` and the GitHub release body
- Close related issues and update the milestone
- Announce the release (optional)

Maintainer contact
- uliarp15@gmail.com