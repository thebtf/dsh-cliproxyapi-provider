# CLIProxyAPI for DeepSeek Harness

Open **Plugins**, then select **CLIProxyAPI**. Choose the wire protocol your gateway exposes — OpenAI Responses, OpenAI Chat Completions, Anthropic Messages or Google Generative AI — then enter your actual endpoint and explicitly choose keep, replace, reference, or no authentication. HTTP is unencrypted. A changed endpoint cannot reuse saved credentials without consent.

Preview models, search or select all/deselect all, then save the connection, policy and model draft together. Zero selected models is valid but not ready. Details show metadata, source labels and advertised reasoning efforts. A stale catalog can remain available after a refresh failure. Save and activation are reported separately.

Disable retains the configuration and credential; forget-key is separate. Saving the first connection adopts an existing legacy profile automatically, with a reversible backup; **Import legacy connection** is still available for an explicit import. Inspect recovery errors before retrying. Do not overwrite newer settings with an old rollback backup.

The Models footer opens Plugins; select CLIProxyAPI there. It does not provide a full managed Models row. Restart DSH after installing or updating. Requires Node 24.9.0 or newer and DSH 0.2.2-rc.2; `engines.dsh` accepts the rest of the 0.2.x line.
