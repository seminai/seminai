# Synthetic test fixtures

Every file below this directory is fabricated for automated testing. It contains no user,
customer, production, or copied commercial data.

- `invoice/fattura-pa.xml` is a minimal synthetic FatturaPA document.
- `field/lombardia.csv` is a single fabricated SISCO-shaped field row.

Real local fixtures must never be added here. Set `SEMINAI_FIXTURES_DIR` to an absolute path
outside every Git repository and run the private fixture command instead.
