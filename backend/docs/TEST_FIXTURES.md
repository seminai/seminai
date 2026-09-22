# Test fixture policy

The default test suite uses only fabricated fixtures under `test-fixtures/synthetic` and
official open datasets with recorded provenance. User and customer datasets are prohibited
from Git, Docker build contexts, generated artifacts, logs, and reports.

## Optional local fixtures

Set `SEMINAI_FIXTURES_DIR` to an absolute directory outside this repository, then run:

```bash
npm run test:fixtures:private
```

The harness rejects repository-local paths and escaping symlinks. Its output exposes only the
test result: it does not print fixture paths, filenames, contents, or identifiers. The normal
unit and integration gates never require this directory.
