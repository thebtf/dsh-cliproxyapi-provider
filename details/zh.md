# CLIProxyAPI for DeepSeek Harness

此插件通过 OpenAI Responses API 连接 CLIProxyAPI，并自动加载和刷新可用模型列表。

## 设置

1. 返回 **插件** 页面，在 **内置插件设置** 中选择 **CLIProxyAPI**。此项与已安装插件的详情页是分开的。
2. 输入服务器的 **Base URL**（例如 `http://127.0.0.1:8317/v1`）和 API Key。如果服务器不需要密钥，请留空。
3. 点击 **保存并启用**，等待同步成功提示。之后即可在聊天中选择导入的模型。

安装或更新插件后，请完全重启 DeepSeek Harness。此版本面向 DSH `0.2.2-rc.1`。

插件使用内置的 `llm-pi-ai` 适配器，不会更改发送给模型的对话历史或工具列表。
