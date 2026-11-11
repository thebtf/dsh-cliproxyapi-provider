# CLIProxyAPI Provider for DeepSeek Harness

English | [简体中文](./README.md)

The plugin connects one CLIProxyAPI gateway to DeepSeek Harness using the OpenAI Responses API. Existing sessions retain their `CLIProxyAPI` provider and model IDs.

## Install and configure

Requires Node.js 24.9.0 or newer and DeepSeek Harness 0.2.2-rc.1. Install the version tag or use the moving GitHub channel:

```powershell
npx @deepseek-ai/dsh plugin --profile web add 'github:thebtf/dsh-cliproxyapi-provider#v0.4.0'
# Moving channel: github:thebtf/dsh-cliproxyapi-provider#latest
npx @deepseek-ai/dsh web
```

Restart the Web process or Desktop after installation or upgrade. On the sidebar **Plugins** page, choose **CLIProxyAPI**. Enter the actual Base URL; no local address is assumed. Choose whether to keep the existing credential, replace it, use a reference, or explicitly use no authentication. HTTP is unencrypted: keys and request contents can be exposed. Reusing an existing identity with a changed endpoint requires explicit consent.

Preview the catalog, search, and select models; bulk controls affect the whole loaded catalog. Save commits the address, authentication action, policy, and model draft together. Saving zero models is allowed but leaves the native route unavailable. Absent model choices are retained and newly discovered models default to enabled. Metadata, capability sources and reported reasoning efforts are available in model details. A failed refresh preserves the last good catalog as stale. A saved configuration is not proof of successful activation.

**Disable connection** retains the address, credential and model selection. **Forget key** is a separate action and can make the connection unavailable; it does not enable keyless authentication. Direct CPA API calls are unaffected.

## Migration and rollback

An existing generic CLIProxyAPI profile continues to own its route until an explicit legacy import. Use **Import legacy connection** in the CPA page and inspect any migration or recovery error; ambiguous ownership, missing addresses, and unsupported fields need repair rather than silent replacement. A brief interruption during cutover is possible. Do not restore an old backup over newer settings: use the migration recovery/rollback path only when its ownership and revision checks permit it, or repair forward. Keep a backup before upgrading and restart after changing versions.

## Models integration

The Models footer shows CPA status and **Open Plugins**. Open Plugins, then select **CLIProxyAPI** to reach its settings. This is not a complete owner-controlled row in the main Models provider list; native Edit/Delete there are not CPA lifecycle actions.

The `latest` channel requires a GitHub-aware updater; the DSH 0.2.2-rc.1 native Versions UI updates registry installations only. No npm publication is implied. Uninstall with `npx @deepseek-ai/dsh plugin --profile web remove @router-for-me/dsh-cliproxyapi-provider` and restart; uninstall does not promise deletion of saved configuration.
