---
name: init-python
description: Initialize a new Python uv project with standard structure and dependencies
---

Initialize a new Python uv project in the current working directory.

## Arguments

Required: project name in `PascalCase` (e.g., `/init-python CommodityForecast`). If omitted, ask for it before proceeding.

Derive the other forms from the PascalCase input:
- **directory name**: `kebab-case` — insert a hyphen before each uppercase letter after the first, lowercase all (`CommodityForecast` → `commodity-forecast`)
- **Python package name**: `snake_case` — same split, underscores (`CommodityForecast` → `commodity_forecast`)

## Steps

### Step 1: Confirm target directory

- Show the user: PascalCase input, derived directory name, and derived package name.
- If a directory already exists with the derived directory name, ask before overwriting.

### Step 2: Initialize with uv

```bash
uv init <directory-name> --python ">=3.11"
cd <directory-name>
```

### Step 3: Set up src layout

Delete the default `hello.py` that `uv init` creates. Create:

```
src/
└── <package_name>/       # snake_case derived from PascalCase input
    ├── __init__.py
    ├── loader/
    │   └── __init__.py
    └── predictor/
        └── __init__.py
```

Update `pyproject.toml` to use `hatchling` as the build backend and point at `src/`:

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/<package_name>"]
```

Also update the `[project]` block: set `requires-python = ">=3.11"` and remove any default `dependencies = []` placeholder.

### Step 4: Create _data/ directory

```bash
mkdir _data
echo "_data/" >> .gitignore
```

### Step 5: Add dependencies

```bash
uv add azure-identity azure-keyvault-secrets python-dotenv pandas seaborn
uv add --dev ipykernel
```

### Step 6: Create .env template

Create a `.env` file at the project root (do NOT commit it — add to `.gitignore`):

```
# Azure Key Vault
AZURE_KEYVAULT_URL=

# Add project-specific secrets below
```

Add `.env` to `.gitignore`.

### Step 7: Confirm

Show the final directory tree (excluding `.venv/`, `_data/`, `__pycache__/`). Suggest:

- "Run `uv sync` to install dependencies."
- "Run `/scaffold` if you want structured AI-assisted development docs (spec, plan, decisions)."
