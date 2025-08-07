# ApiPost MCP

基于 MCP 协议和 [ApiPost 官方 OpenAPI](https://docs.apipost.net/docs/detail/2a37986cbc64000?target_id=23796913b176e1) 实现的 API 管理工具。

## 功能

- **连接测试** - 一键验证MCP服务器状态和配置
- **工作空间管理** - 查看、切换团队和项目工作空间
- **API接口管理** - 创建、查看、修改、删除接口文档
- **增量更新** - 支持字段级别的精确更新和删除
- **层级搜索** - 强化的目录层级搜索和父子关系定位
- **递归浏览** - 递归搜索子目录，支持深度限制
- **多维筛选** - 多维度搜索和批量操作
- **结构化显示** - 树形结构和分组显示
- **路径导航** - 完整路径显示，快速定位
- **权限管理** - 多种安全模式，灵活的操作权限控制

## 安装

### 环境要求

在开始安装之前，请确保您的系统已安装以下环境：

| 环境 | 版本要求 | 说明 |
|------|---------|------|
| **Node.js** | >= 18.0.0 | JavaScript 运行环境（MCP SDK 官方最低要求） |
| **npm** | >= 8.0.0 | Node.js 包管理器（通常随 Node.js 一起安装） |

#### 环境安装指南

**Node.js 安装：**
- 访问 [Node.js 官网](https://nodejs.org/) 下载 LTS 版本
- 或使用包管理器：
  ```bash
  # macOS (使用 Homebrew)
  brew install node
  
  # Ubuntu/Debian
  sudo apt update && sudo apt install nodejs npm
  
  # CentOS/RHEL
  sudo yum install nodejs npm
  ```

**验证安装：**
```bash
node --version   # 应显示 v18.0.0 或更高版本
npm --version    # 应显示 8.0.0 或更高版本
```

### 开始安装

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
| `apipost_test_connection` | 连接测试 | `random_string` |
| `apipost_workspace` | 工作空间管理 | `action` (必需) |
| `apipost_smart_create` | 创建接口 | `method`, `url`, `name` |
| `apipost_list` | 强化列表搜索 | `search`, `parent_id`, `target_type`, `show_structure`, `recursive`, `group_by_folder` |
| `apipost_detail` | 查看详情 | `target_id` |
| `apipost_update` | 修改接口 | `target_id`, 其他可选 |
| `apipost_delete` | 删除接口 | `api_ids` |

### apipost_test_connection 说明

**快速诊断工具**，适合首次使用或故障排查：
- ✅ 验证MCP服务器连接状态
- 🔧 检查环境变量配置
- 🏢 显示当前工作空间信息  
- 🛠️ 检查操作权限和安全模式
- 📊 提供系统环境详情

### apipost_workspace 说明

**统一的工作空间管理工具**，支持以下操作：

| Action | 功能 | 主要参数 | 说明 |
|--------|------|---------|------|
| `current` | 查看当前工作空间 | `show_all` | 显示当前团队、项目信息，可选显示所有可用选项 |
| `list_teams` | 列出团队 | `show_details` | 显示所有可用团队，标识当前团队 |
| `list_projects` | 列出项目 | `team_id`, `show_details` | 显示指定团队的项目列表 |
| `switch` | 切换工作空间 | `team_id`, `project_id` 或 `team_name`, `project_name` | 切换到指定的团队和项目 |

**使用示例：**
```
# 查看当前工作空间
apipost_workspace action: "current"

# 列出所有团队
apipost_workspace action: "list_teams" show_details: true

# 列出项目
apipost_workspace action: "list_projects" team_id: "your_team_id"

# 切换工作空间（支持按名称或ID）
apipost_workspace action: "switch" team_name: "团队名" project_name: "项目名"
```

### apipost_list 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `search` | string | 搜索关键词（接口名称、URL、方法、ID、描述） |
| `parent_id` | string | 父目录ID，精确查找子项目。"0"为根目录 |
| `target_type` | string | 类型筛选：`api`(仅接口)、`folder`(仅目录)、`all`(全部) |
| `show_structure` | boolean | 显示树形结构，默认false为列表模式 |
| `show_path` | boolean | 显示完整路径，默认false |
| `recursive` | boolean | 递归搜索子目录，默认false |
| `depth` | number | 深度限制（配合recursive），默认无限制 |
| `group_by_folder` | boolean | 按目录分组显示，默认false |
| `limit` | number | 显示数量限制（默认50，最大200） |
| `show_all` | boolean | 显示全部（忽略limit限制） |


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