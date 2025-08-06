# ApiPost MCP

基于 MCP 协议和 [ApiPost 官方 OpenAPI](https://docs.apipost.net/docs/detail/2a37986cbc64000?target_id=23796913b176e1) 实现的 API 管理工具。

## 功能

- API接口创建、查看、修改、删除
- 增量更新和字段删除
- 搜索和批量操作
- 支持完整的参数配置

## 安装

```bash
git clone https://github.com/jlcodes99/apipost-mcp.git
cd apipost-mcp
npm install && npm run build
```

## 配置

在 MCP 配置文件中添加：

```json
{
  "mcpServers": {
    "apipost": {
      "command": "node",
      "args": ["/absolute/path/to/apipost-mcp/dist/index.js"],
      "env": {
        "APIPOST_TOKEN": "your_access_token_here",
        "APIPOST_HOST": "https://open.apipost.net",
        "APIPOST_SECURITY_MODE": "limited",
        "APIPOST_DEFAULT_TEAM_NAME": "你的团队名称",
        "APIPOST_DEFAULT_PROJECT_NAME": "你的项目名称"
      }
    }
  }
}

```

### 环境变量

| 变量名 | 是否必需 | 说明 |
|--------|------|------|
| `APIPOST_TOKEN` | 是 | API访问令牌 |
| `APIPOST_SECURITY_MODE` | 否 | 安全模式：`readonly`, `limited`, `full` |
| `APIPOST_DEFAULT_TEAM_NAME` | 否 | 默认团队名称 |
| `APIPOST_DEFAULT_PROJECT_NAME` | 否 | 默认项目名称 |

### 安全模式说明

| 模式 | 权限 | 说明 |
|------|------|------|
| `readonly` | 只读 | 仅允许查看接口列表和详情，禁止创建、修改、删除 |
| `limited` | 读写 | 允许查看、创建、修改接口，禁止删除操作 |
| `full` | 完全访问 | 允许所有操作，包括查看、创建、修改、删除 |


## 可用工具

| 工具 | 功能 | 主要参数 |
|------|------|---------|
| `apipost_smart_create` | 创建接口 | `method`, `url`, `name` |
| `apipost_detail` | 查看详情 | `target_id` |
| `apipost_list` | 接口列表 | `search`, `limit` |
| `apipost_update` | 修改接口 | `target_id`, 其他可选 |
| `apipost_delete` | 删除接口 | `api_ids` |


## 获取 Token

1. [ApiPost OpenApi官方文档查看](https://docs.apipost.net/docs/detail/2a37986cbc64000?target_id=0)
2. 用户api_token。获取方式：Apipost客户端>工作台>项目设置>对外能力>open API

## 📝 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解版本更新信息。

---

💡 **提示**：这是一个专注于API接口管理的MCP工具，简化了接口创建和管理流程，提高团队协作效率。

## 联系方式

- 📧 邮箱: jlcodes@163.com
- 🐛 问题反馈: [GitHub Issues](https://github.com/jlcodes99/apipost-mcp/issues)
- 🌟 项目主页: [GitHub Repository](https://github.com/jlcodes99/apipost-mcp)

## 相关链接

- [ApiPost OpenAPI 文档](https://docs.apipost.net/docs/detail/2a37986cbc64000?target_id=23796913b176e1)
- [MCP 协议说明](https://github.com/modelcontextprotocol/specification)


⭐ 如果这个项目对你有帮助，请给我们一个星标！