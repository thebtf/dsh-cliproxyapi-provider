# CLIProxyAPI Provider for DeepSeek Harness

[English](./README_EN.md) | 简体中文

为 DeepSeek Harness 添加一个基于 OpenAI Responses API 的 `CLIProxyAPI` 模型供应商。

插件会自动从 CLIProxyAPI 获取模型列表，无需手动添加或维护模型。

## 使用方式

安装插件：

```powershell
npx @deepseek-ai/dsh plugin --profile web add 'github:thebtf/dsh-cliproxyapi-provider#v0.3.1'
```

启动或重启 DeepSeek Harness Web：

```powershell
npx @deepseek-ai/dsh web
```

打开 Harness 后：

1. 在侧边栏打开 **插件** 页面，并选择官方插件列表中的 **CLIProxyAPI**。
2. 填写 CLIProxyAPI 的 **Base URL**，例如
   `http://127.0.0.1:8317/v1`。
3. 填写 **API 密钥**；无鉴权服务可以留空。
4. 保存配置，模型列表会自动获取并定期刷新；如果模型目录的 `input_modalities` 声明了 `image`，图片输入能力会自动应用到对应型号。若 CLIProxyAPI 未提供此字段，能力按未知处理，不会臆测为支持图片。

### 选择模型

点击 **加载模型**，按名称或 ID 搜索；可先取消选择所有已加载模型，再启用需要的型号。批量操作始终作用于整个已加载目录，不受搜索筛选影响。点击 **保存并启用** 后才应用更改，且必须保留至少一个可用型号。暂时从 CPA 目录消失的型号仍保留选择，新型号默认启用。

每行显示实际上下文、输出上限、输入类型和推理等级。服务未提供而使用插件默认值时会标注“默认值”。**模型详情 → 所有 CPA 字段** 可查看该型号返回的全部字段，包括描述、默认推理等级、嵌套能力和指令。这些额外字段仅供查看，不会写入推理配置；支持的推理等级会传递到 DSH 模型配置。

滚动 GitHub 通道为 `github:thebtf/dsh-cliproxyapi-provider#latest`，版本标签保持不变。DSH 0.2.2-rc.1 的原生 Versions 只更新 registry 安装，GitHub 安装需使用支持 GitHub 的更新器。

卸载插件：

```powershell
npx @deepseek-ai/dsh plugin --profile web remove @router-for-me/dsh-cliproxyapi-provider
```

卸载后重启 DeepSeek Harness Web 即可。

## 兼容性

此版本面向 DeepSeek Harness `0.2.2-rc.1`。它通过 `plugins.item` 提供插件配置项，以 `configForms` 编辑 `llm-pi-ai` 实例配置，并通过 `ctx.remote` 管理凭据。完整目录通过仅限 owner 的 Connection Fetch 路由 `/api/cliproxyapi/catalog` 读取，Desktop 使用 shell transport。页面只在 Host 提供两个配置项时显示。通用模型发现仍使用 `llm-cliproxyapi` 命名空间，但 DSH 的通用 API 会省略扩展元数据。安装或升级后请完全重启 Web 进程或 Desktop 应用，以载入新插件包。

### 工具 Schema 兼容性

插件为 CPA 路由设置 `compat.supportsStrictMode: true`，表示支持发送 `strict` 字段。普通 DSH 工具因此会显式发送 **`strict: false`**，而不是省略字段并触发上游自动严格化。工具列表、描述和参数 Schema 均保持不变。此设置修复了在 Codex 模型和较大的混合 MCP 工具目录上复现的上游 `server_error`。已有配置会在启动或目录刷新时更新；升级后请完全重启 DSH。
