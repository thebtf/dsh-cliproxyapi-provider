# CLIProxyAPI Provider for DeepSeek Harness

[English](./README_EN.md) | 简体中文

将一个 CLIProxyAPI 网关连接到 DeepSeek Harness。可选择通信协议——OpenAI Responses（默认）、OpenAI Chat Completions、Anthropic Messages 或 Google Generative AI——插件会原生使用该协议。保留现有会话的 `CLIProxyAPI` 和模型 ID。

## 安装与配置

插件发布在自己的 DSH 插件市场索引中。先添加一次索引，之后即可在 **插件 → 发现** 中安装和更新：

```
https://raw.githubusercontent.com/thebtf/dsh-cliproxyapi-provider/main/market/index.json
```

需要 Node.js 24.9.0 或更新版本。基于 DeepSeek Harness 0.2.2-rc.3 构建；`engines.dsh` 允许 `>=0.2.2-rc.3 <1.0.0` 以避免不必要的版本限制，但未来核心 API 的兼容性仍需测试。通过 npm 安装与更新：

```powershell
npx @deepseek-ai/dsh plugin --profile web add '@thebtf/dsh-cliproxyapi-provider@0.5.4'
npx @deepseek-ai/dsh web
```

市场索引指向 npm 版本。历史 Git 引用仍保留，但新安装应使用 npm；现有安装切换来源需要执行下文的显式迁移流程。

安装或升级后重启 Web 或 Desktop。在侧边栏 **插件** 页面选择 **CLIProxyAPI**，先选择网关提供的通信协议，再填写服务器地址；不会自动假定本地地址。末尾的 `/v1` 可写可不写：插件统一从 `{root}/v1/models` 读取模型目录，并按各协议自动补上各自 SDK 需要的路径（无、`/v1` 或 `/v1beta`）。明确选择保留身份、替换密钥、使用凭据引用或不使用验证。HTTP 不加密，密钥和请求可能泄露；对新地址重用已有身份需要明确同意。

![DeepSeek Harness 中的 CLIProxyAPI 设置页](market/screenshot-settings.png)

预览目录后可搜索、选择模型；批量操作针对全部已加载模型。保存会一起提交地址、验证操作、策略和模型草稿。允许保存零个模型，但此时原生连接不可用。暂时缺失的模型选择会保留，新模型默认启用。模型详情显示元数据、能力来源和已声明的推理等级。刷新失败时保留上次可用目录并标记过期；保存成功不代表激活成功。

如果模型的令牌限制缺失或不正确，请在模型卡片的 **令牌限制** 区域填写上下文窗口或最大输出，再选择 **保存模型设置**。清空字段可恢复网关提供的值；如果网关未提供，则使用插件默认值。这些限制用于 DSH 客户端，不能提高上游模型的实际容量。

插件在配置文件之外还保留一份已保存连接的副本。如果配置文件被重建、设置条目被核心版本门禁停用或包被重装导致连接消失，页面会显示 **恢复已保存的连接**，无需重新输入地址和密钥。

**停用连接**保留地址、凭据和模型选择；**忘记密钥**是单独操作，可能导致连接不可用，不会自动切换为无验证模式。直接 CPA API 调用不受影响。

## 迁移与回退

旧的通用 CLIProxyAPI 配置在插件接管前拥有原有路由。保存第一个连接时会自动接管该配置：插件记录完整备份、移除旧条目，并在首次目录刷新成功后完成切换。也可在 CPA 页面显式选择 **导入旧连接**。所有权不明确、缺少地址或字段无法迁移时会给出提示，不会静默覆盖。切换时可能短暂中断。不要用旧备份覆盖较新设置；只有迁移恢复／回退的所有权与版本检查允许时才能回退，否则应向前修复。升级前保留备份，更换版本后重启。

### 将 Git 或本地文件安装切换到 npm

这是包来源迁移，与导入旧模型连接不同。切换前停止活动请求，备份配置档、凭据存储与插件的连接备份，并妥善保护备份。记录原安装来源与提供方/模型 ID。

对于包名已是 `@thebtf/dsh-cliproxyapi-provider` 的安装，在同一配置档中使用上面的 npm 安装命令，指定已验证的版本。不要先卸载或删除配置。重启 DSH 后检查仅有一份活动插件，核对来源、版本、地址、身份验证与模型选择，再测试已有会话。回退包版本不等于回退配置迁移，不要盲目覆盖较新的数据。

旧包名需要单独验证迁移，不能直接安装第二个提供方并假设所有权会转移。隔离的 Desktop CLI/pnpm 测试已验证：同名 file 与固定提交的本地 Git 依赖可在不先卸载的情况下替换为 npm，哨兵设置、配置补丁与配置档内容保持不变。该测试使用普通包，不是完整的 CLIProxyAPI bundle 迁移；激活、凭据、已有会话、远程 Git 与旧包名仍需单独验证。插件不会自动切换来源。

## Models 集成范围

Models 页底部显示 CPA 状态和 **打开插件**。点击后再选择 **CLIProxyAPI** 进入设置。这不是 Models 主列表中的完整自主管理行；其中原生编辑／删除操作不是 CPA 生命周期操作。

npm 是常规安装与更新来源。GitHub Releases 用于发布说明与手动恢复包，不提供独立更新器。Discover 索引仅展示已验证的 npm 版本。恢复包必须与 npm 包字节一致；依赖仍需可用。发布与恢复流程见 [RELEASING.md](RELEASING.md)。卸载命令：`npx @deepseek-ai/dsh plugin --profile web remove @thebtf/dsh-cliproxyapi-provider`，然后重启；卸载不承诺删除已保存配置。