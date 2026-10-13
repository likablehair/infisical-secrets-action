# Infisical Secrets Action

Fetch secrets from [Infisical](https://infisical.com) (cloud or self-hosted) and use them in your workflows, either as environment variables or as `.env` files.

This repository is a fork of [Infisical/secrets-action](https://github.com/Infisical/secrets-action). On top of upstream, it adds:

- `file-output-dir`, which replaces upstream's `file-output-path`. You choose the output **directory**, and the file is always named `.env`.
- `export-subdirectories`, which writes one `.env` file per Infisical folder (see [Exporting subfolders as separate files](#exporting-subfolders-as-separate-files)).

## Quick start

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # only needed for OIDC auth
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: https://gitea.likablehair.it/Likablehair/infisical-secrets-action@master
        with:
          method: oidc
          identity-id: ${{ vars.INFISICAL_IDENTITY_ID }}
          domain: https://app.infisical.com
          project-slug: my-project
          env-slug: dev

      - run: ./deploy.sh # secrets are now available as environment variables
```

> If your runner resolves actions from this Gitea instance by default, you can use the short form `Likablehair/infisical-secrets-action@master`.

## Authentication

Both methods need a [Machine Identity](https://infisical.com/docs/documentation/platform/identities/machine-identities) with access to the project.

### Universal Auth (default)

1. Set the machine identity's auth method to **Universal Auth**.
2. Store its client ID and client secret as repository secrets.
3. Pass them to the action:

```yaml
- uses: https://gitea.likablehair.it/Likablehair/infisical-secrets-action@master
  with:
    method: universal
    client-id: ${{ secrets.INFISICAL_CLIENT_ID }}
    client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET }}
    project-slug: my-project
    env-slug: dev
```

### OIDC Auth

1. Set the machine identity's auth method to **OIDC Auth**, and configure the bound audience, subject and claims for your setup ([guide](https://infisical.com/docs/documentation/platform/identities/oidc-auth/github)).
2. Set `method: oidc` and `identity-id` to the machine identity's ID. You can override the token's `aud` claim with `oidc-audience`.
3. Grant the job permission to request an ID token:

```yaml
permissions:
  id-token: write
  contents: read
```

To debug claim mismatches, use [actions-oidc-debugger](https://github.com/github/actions-oidc-debugger) to inspect the token your workflow receives.

## Usage

### As environment variables (default)

Each secret is exported as an environment variable for all later steps in the job. Values are masked in the logs.

```yaml
- uses: https://gitea.likablehair.it/Likablehair/infisical-secrets-action@master
  with:
    client-id: ${{ secrets.INFISICAL_CLIENT_ID }}
    client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET }}
    project-slug: my-project
    env-slug: prod
    secret-path: /backend
```

### As a `.env` file

Set `export-type: file` to write the secrets to `<file-output-dir>/.env`. The path is relative to `GITHUB_WORKSPACE`, and missing directories are created for you. Run `actions/checkout` first, so the checkout doesn't wipe the file.

```yaml
- uses: actions/checkout@v4

- uses: https://gitea.likablehair.it/Likablehair/infisical-secrets-action@master
  with:
    client-id: ${{ secrets.INFISICAL_CLIENT_ID }}
    client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET }}
    project-slug: my-project
    env-slug: prod
    export-type: file
    file-output-dir: /src # writes $GITHUB_WORKSPACE/src/.env
```

### Exporting subfolders as separate files

With `export-type: file`, `recursive: true` and `export-subdirectories: true`, the action writes one file per Infisical folder instead of a single combined file.

```yaml
- uses: https://gitea.likablehair.it/Likablehair/infisical-secrets-action@master
  with:
    client-id: ${{ secrets.INFISICAL_CLIENT_ID }}
    client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET }}
    project-slug: my-project
    env-slug: prod
    secret-path: /apps
    recursive: true
    export-type: file
    export-subdirectories: true
    file-output-dir: /config
```

Given this Infisical layout, the action writes these files:

| Infisical folder  | Output file                            |
| ----------------- | -------------------------------------- |
| `/apps`           | `config/.env`                          |
| `/apps/api`       | `config/api.env`                       |
| `/apps/api/worker`| `config/api-worker.env`                |
| `/apps/web`       | `config/web.env`                       |

How files are named and filled:

- The folder in `secret-path` itself goes to `.env`.
- Subfolders are named by their path relative to `secret-path`, with `/` replaced by `-`.
- Folders with no secrets are skipped.
- Imported secrets go into the root `.env` file.

## Inputs

| Input                   | Required | Default                     | Description |
| ----------------------- | :------: | --------------------------- | ----------- |
| `project-slug`          | yes      |                             | Slug of the Infisical project. |
| `env-slug`              | yes      |                             | Slug of the environment, such as `dev` or `prod`. |
| `method`                | no       | `universal`                 | Auth method: `universal` or `oidc`. |
| `client-id`             | no       |                             | Machine identity client ID. Required for `universal`. |
| `client-secret`         | no       |                             | Machine identity client secret. Required for `universal`. |
| `identity-id`           | no       |                             | Machine identity ID. Required for `oidc`. |
| `oidc-audience`         | no       |                             | Custom `aud` claim for the OIDC ID token. |
| `domain`                | no       | `https://app.infisical.com` | Infisical instance URL. Set it for EU (`https://eu.infisical.com`), dedicated or self-hosted instances. Don't add a trailing slash. |
| `secret-path`           | no       | `/`                         | Infisical folder to read from, such as `/my-secret-path`. |
| `recursive`             | no       | `false`                     | Also fetch secrets from all subfolders of `secret-path`. |
| `include-imports`       | no       | `true`                      | Include secrets imported into the folder. |
| `export-type`           | no       | `env`                       | `env` exports environment variables. `file` writes `.env` file(s). |
| `file-output-dir`       | no       | `/`                         | With `export-type: file`, the output directory relative to `GITHUB_WORKSPACE`. |
| `export-subdirectories` | no       | `false`                     | With `export-type: file`, write one `.env` file per Infisical folder. Use it with `recursive: true`. |

## Behavior notes

- **Secret references** such as `${OTHER_SECRET}` are expanded by Infisical before export.
- **Duplicate keys:** when `recursive` is on and the same key exists in several folders, environment variables and the single `.env` file keep only one value, whichever folder Infisical returns last. Use `export-subdirectories` to keep them apart.
- **Imports never override:** an imported secret is skipped if the folder already defines a secret with the same key.
- **File format:** each line is written as `KEY=value`, with no quoting or escaping. Values that contain newlines (for example PEM keys) span several lines, and some `.env` parsers will misread them.

## Development

The action runs on Node 20 (`.nvmrc`). `node_modules` is committed, because the runner executes `index.js` directly with no build step. After you change dependencies, run `npm install` and commit the updated `node_modules`.

## License

See [LICENSE](LICENSE).
