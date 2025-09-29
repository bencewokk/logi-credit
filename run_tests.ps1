# Simple helper to run tests for all packages
$ENV:PYTHONPATH = "$PWD\zsombi\src;$PWD\david\src;$PWD\pali\src;$PWD\kristof\src"
pytest -q
