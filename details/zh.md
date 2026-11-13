# DeepSeek Harness 的 CLIProxyAPI

打开 **插件**，然后选择 **CLIProxyAPI**。先选择网关提供的通信协议（OpenAI Responses、OpenAI Chat Completions、Anthropic Messages 或 Google Generative AI），再输入实际地址，并明确选择保留、替换密钥、凭据引用或不验证。HTTP 不加密。更换地址后，重用保存的凭据需要明确同意。

预览目录后搜索、选择或批量选择模型。保存同时提交连接、策略和模型草稿。允许零模型，但连接尚未就绪。详情展示元数据、来源和已声明的推理等级；刷新失败后，上次目录可能标为过期。保存和激活分别显示。

停用会保留设置和凭据；忘记密钥是独立操作。保存第一个连接时会自动接管旧配置并保留可回退的备份；仍可显式选择导入旧连接。重试前检查恢复错误。不要用旧备份覆盖较新设置。

Models 页底部可打开插件，然后选择 CLIProxyAPI；这不是完整的 Models 管理行。安装或更新后重启 DSH。需要 Node 24.9.0 及以上和 DSH 0.2.2-rc.2；`engines.dsh` 接受 0.2.x 的其余版本。
