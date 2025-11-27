# Changelog

## [1.2.0] - 2025-11-27

### 🔄 重构与优化
- 字段列表全面驱动：headers/query/body/cookies/responses 统一用字段列表自动生成 ApiPost 所需结构，调用更简洁、传输体积更小、节省 token
- responses 仅接受 fields 自动生成 data，不再使用 data 入参；所有字段（含父级）必须提供 desc，保证文档可读性
- 父级节点可显式描述，未提供时自动补位且不展示大块 JSON；可选 `APIPOST_INLINE_COMMENTS=true` 按 desc 生成 raw 行内注释（mock 始终为纯 JSON）

## [1.1.0] - 2025-08-14

### 🆕 新增功能
- `apipost_create_folder` - 创建API文档目录，支持在指定父目录下创建新的文件夹
- `apipost_smart_create` - 新增parent_id参数支持，允许在指定目录下创建API接口

#### 核心特性
- **目录管理**：支持创建API文档目录，构建层级结构
- **位置控制**：API接口创建时可指定父目录ID，提升文档管理效率
- **层级组织**：支持在指定目录下创建子目录和接口，无需手动移动

#### 参数说明
- `apipost_create_folder` 参数：
  - `name` (必需): 目录名称
  - `parent_id` (可选): 父目录ID，默认"0"表示根目录
  - `description` (可选): 目录描述
- `apipost_smart_create` 新增参数：
  - `parent_id` (可选): 父目录ID，默认"0"表示根目录

## [1.0.0] - 2025-08-06

### 🎉 首次发布

#### 新增功能
- `apipost_smart_create` - 创建API接口文档
- `apipost_detail` - 查看接口详细配置  
- `apipost_list` - 接口列表查看和搜索
- `apipost_update` - 接口增量更新和字段删除
- `apipost_delete` - 批量删除接口

#### 核心特性
- 基于 ApiPost 官方 OpenAPI 实现
- 支持完整的HTTP参数配置（headers、query、body等）
- 增量更新：只修改指定字段，保持其他配置不变
- 字段删除：提供空值可删除对应配置项
- 三种安全模式：
  - `readonly`: 只读模式，仅查看
  - `limited`: 读写模式，禁止删除
  - `full`: 完全访问，所有操作

#### 可用工具
- `apipost_smart_create` - 创建API接口
- `apipost_detail` - 查看接口详情
- `apipost_list` - 接口列表查看
- `apipost_update` - 接口修改
- `apipost_delete` - 批量删除
