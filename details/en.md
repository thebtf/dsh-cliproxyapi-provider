# CLIProxyAPI for DeepSeek Harness

This plugin connects CLIProxyAPI through the OpenAI Responses API and automatically loads and refreshes the available model list.

## Setup

1. Return to **Plugins** and select **CLIProxyAPI** under **Built-in plugin settings**. This is a separate entry from the installed package's detail page.
2. Enter your server's **Base URL**, for example `http://127.0.0.1:8317/v1`, and API key. Leave the key empty if the server does not require one.
3. Select **Save & Enable** and wait for the synchronization confirmation. You can then select an imported model in chat.

Fully restart DeepSeek Harness after installing or updating the plugin. This version targets DSH `0.2.2-rc.1`.

The plugin uses the built-in `llm-pi-ai` adapter; it does not change the conversation history or tools sent to the model.
