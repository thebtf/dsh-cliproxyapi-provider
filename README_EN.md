# CLIProxyAPI Provider for DeepSeek Harness

English | [简体中文](./README.md)

Adds a `CLIProxyAPI` model provider based on the OpenAI Responses API to DeepSeek Harness.

The plugin automatically retrieves the model list from CLIProxyAPI, so models do not need to be added or maintained manually.

## Usage

Install the plugin:

```powershell
npx @deepseek-ai/dsh plugin --profile web add 'github:thebtf/dsh-cliproxyapi-provider#v0.3.1'
```

Start or restart DeepSeek Harness Web:

```powershell
npx @deepseek-ai/dsh web
```

After opening Harness:

1. Open the sidebar **Plugins** page and select **CLIProxyAPI** from the Official plugins list.
2. Enter the CLIProxyAPI **Base URL**, for example
   `http://127.0.0.1:8317/v1`.
3. Enter the **API key**. Leave it empty if the service does not require authentication.
4. Save the configuration. The model list will be retrieved automatically and refreshed periodically. Models whose catalog `input_modalities` includes `image` automatically receive image-input support. If CLIProxyAPI omits this field, image support is treated as unknown rather than guessed.

### Choosing models

Select **Load models**, search by name or ID, and use **Deselect all loaded models** to start with an empty draft before enabling the models you want. Bulk actions affect the entire loaded catalog, even while a search is active. Changes apply only after **Save & Enable**; at least one available model must remain enabled. Choices for models temporarily absent from CPA are retained. New model IDs are enabled by default.

Each row shows effective context/output limits, input types and advertised reasoning efforts. Values supplied by plugin defaults are marked **default** rather than presented as CPA metadata. **Model details → All CPA fields** exposes every field returned for that model, including descriptions, default effort, nested capabilities and instructions. These extra fields are read-only and are not copied into the inference configuration. Supported reasoning efforts are also passed to DSH's model configuration.

The moving GitHub channel is `github:thebtf/dsh-cliproxyapi-provider#latest`; version tags remain immutable. A GitHub-aware updater is required on DSH 0.2.2-rc.1, whose native Versions section only updates registry installations.

Uninstall the plugin:

```powershell
npx @deepseek-ai/dsh plugin --profile web remove @router-for-me/dsh-cliproxyapi-provider
```

Restart DeepSeek Harness Web after uninstalling the plugin.

## Compatibility

This release targets DeepSeek Harness `0.2.2-rc.1`. It contributes a plugin configuration page through `plugins.item`, edits the `llm-pi-ai` entry with `configForms`, and uses `ctx.remote` for credentials. Full catalog reads use an owner-authenticated Connection Fetch route at `/api/cliproxyapi/catalog`, with the shell transport for Desktop. The page appears only while the Host serves both configuration entries. Generic discovery remains available under `llm-cliproxyapi`; DSH's generic discovery API omits extended metadata. Restart the Web process or Desktop application after installing or upgrading so DSH loads the current client bundle.

### Tool schema compatibility

The managed CPA route sets `compat.supportsStrictMode: true`. This advertises support for the `strict` field: ordinary DSH tools then send **`strict: false` explicitly**, rather than omitting the field and allowing upstream automatic strict-schema normalization. The tool list, descriptions and parameter schemas remain intact. This fixes a reproduced upstream `server_error` with a large mixed MCP tool catalog on Codex-backed models. Existing managed profiles receive the setting on startup or catalog refresh; fully restart DSH after updating.
