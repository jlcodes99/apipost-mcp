# Changelog

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