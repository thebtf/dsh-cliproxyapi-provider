# CLIProxyAPI Provider for DeepSeek Harness

English | [简体中文](./README.md)

The plugin connects one CLIProxyAPI gateway to DeepSeek Harness. You choose the wire protocol — OpenAI Responses (default), OpenAI Chat Completions, Anthropic Messages or Google Generative AI — and the plugin speaks it natively. Existing sessions retain their `CLIProxyAPI` provider and model IDs.

## Install and configure

The plugin is listed in its own DSH plugin market index. Add the index once, then install and update from **Plugins → Discover**:

```
https://raw.githubusercontent.com/thebtf/dsh-cliproxyapi-provider/main/market/index.json
```

Requires Node.js 24.9.0 or newer and DeepSeek Harness 0.2.2-rc.3 (`engines.dsh` accepts the 0.2.x line, so a minor core update does not disable the plugin). Install the version tag or use the moving GitHub channel:

```powershell
npx @deepseek-ai/dsh plugin --profile web add 'github:thebtf/dsh-cliproxyapi-provider#v0.4.3'
# Moving channel: github:thebtf/dsh-cliproxyapi-provider#latest
npx @deepseek-ai/dsh web
```

Restart the Web process or Desktop after installation or upgrade. On the sidebar **Plugins** page, choose **CLIProxyAPI**. Pick the wire protocol your gateway exposes, then enter the actual Base URL; no local address is assumed. The model catalog is read from the same `/models` endpoint for every protocol. Choose whether to keep the existing credential, replace it, use a reference, or explicitly use no authentication. HTTP is unencrypted: keys and request contents can be exposed. Reusing an existing identity with a changed endpoint requires explicit consent.

Preview the catalog, search, and select models; bulk controls affect the whole loaded catalog. Save commits the address, authentication action, policy, and model draft together. Saving zero models is allowed but leaves the native route unavailable. Absent model choices are retained and newly discovered models default to enabled. Metadata, capability sources and reported reasoning efforts are available in model details. A failed refresh preserves the last good catalog as stale. A saved configuration is not proof of successful activation.

The plugin also keeps a copy of the last saved connection outside the profile. If a profile rebuild, a core compatibility gate, or a reinstall removes the settings entry, the page offers **Restore saved connection**, so the address and credential do not have to be entered again.

**Disable connection** retains the address, credential and model selection. **Forget key** is a separate action and can make the connection unavailable; it does not enable keyless authentication. Direct CPA API calls are unaffected.

## Migration and rollback

An existing generic CLIProxyAPI profile owns its route until the plugin takes it over. Saving the first connection adopts that profile automatically: the plugin records a full backup, removes the legacy entry and finishes the cutover on the first successful catalog refresh. **Import legacy connection** remains available for an explicit import. Ambiguous ownership, missing addresses, and unsupported fields are reported instead of silently replaced. A brief interruption during cutover is possible. Do not restore an old backup over newer settings: use the migration recovery/rollback path only when its ownership and revision checks permit it, or repair forward. Keep a backup before upgrading and restart after changing versions.

## Models integration

The Models footer shows CPA status and **Open Plugins**. Open Plugins, then select **CLIProxyAPI** to reach its settings. This is not a complete owner-controlled row in the main Models provider list; native Edit/Delete there are not CPA lifecycle actions.

The `latest` channel requires a GitHub-aware updater. The market index pins an exact commit per version, so installing through the index gives the market a stable origin it can compare and update. Publishing to npm is wired to GitHub Releases (see `.github/workflows/publish.yml`); the native Versions UI updates registry installations only, and npm publication authenticates with npm trusted publishing (OIDC), so no token is stored in the repository — see [RELEASING.md](RELEASING.md) for the one-time setup. Uninstall with `npx @deepseek-ai/dsh plugin --profile web remove @router-for-me/dsh-cliproxyapi-provider` and restart; uninstall does not promise deletion of saved configuration.
