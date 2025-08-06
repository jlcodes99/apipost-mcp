# Contributing

## 开发环境

```bash
git clone https://github.com/jlcodes99/apipost-mcp.git
cd apipost-mcp
npm install
npm run build
```

## 测试

```bash
export APIPOST_TOKEN="your_token"
node dist/index.js
```

## 提交规范

```
feat: 新功能
fix: 错误修复  
docs: 文档更新
refactor: 重构
```

## Pull Request

1. Fork 项目
2. 创建分支 `git checkout -b feature/name`
3. 提交更改 `git commit -m 'feat: add feature'`
4. 推送分支 `git push origin feature/name`
5. 创建 Pull Request