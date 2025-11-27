#!/usr/bin/env node
/**
 * ApiPost MCP - API文档管理工具
 * 提供简洁高效的API文档创建、查看、修改和删除功能
 */
// @ts-nocheck
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
// 环境变量验证
const APIPOST_TOKEN = process.env.APIPOST_TOKEN;
if (!APIPOST_TOKEN) {
    console.error('错误: 请设置 APIPOST_TOKEN 环境变量');
    process.exit(1);
}
const APIPOST_HOST = process.env.APIPOST_HOST || 'https://open.apipost.net';
const APIPOST_SECURITY_MODE = process.env.APIPOST_SECURITY_MODE || 'limited'; // readonly, limited, full
const APIPOST_DEFAULT_TEAM_NAME = process.env.APIPOST_DEFAULT_TEAM_NAME;
const APIPOST_DEFAULT_PROJECT_NAME = process.env.APIPOST_DEFAULT_PROJECT_NAME;
const APIPOST_INLINE_COMMENTS = (process.env.APIPOST_INLINE_COMMENTS || 'false').toLowerCase() === 'true';
const APIPOST_URL_PREFIX = process.env.APIPOST_URL_PREFIX || ''; // URL前缀，如 {{host}}
// API客户端
const apiClient = axios.create({
    baseURL: APIPOST_HOST,
    headers: {
        'Api-Token': APIPOST_TOKEN,
        'Content-Type': 'application/json'
    }
});
// 安全模式检查
function checkSecurityPermission(operation) {
    switch (APIPOST_SECURITY_MODE.toLowerCase()) {
        case 'readonly':
            return operation === 'read';
        case 'limited':
            return operation === 'read' || operation === 'write';
        case 'full':
            return true;
        default:
            logWithTime(`⚠️ 未知的安全模式: ${APIPOST_SECURITY_MODE}, 默认为只读模式`);
            return operation === 'read';
    }
}
// URL前缀处理
function applyUrlPrefix(url) {
    if (!url || !APIPOST_URL_PREFIX) return url;
    // 如果url已经包含了前缀，则不重复添加
    if (url.startsWith(APIPOST_URL_PREFIX)) return url;
    // 确保拼接时斜杠正确处理
    const prefix = APIPOST_URL_PREFIX.endsWith('/') ? APIPOST_URL_PREFIX.slice(0, -1) : APIPOST_URL_PREFIX;
    const path = url.startsWith('/') ? url : '/' + url;
    return prefix + path;
}
// 生成ID
function generateId() {
    return (Date.now() + Math.floor(Math.random() * 10000)).toString(16);
}
// 简洁的日志输出
function logWithTime(message, startTime) {
    console.error(message);
}
// 统一转换参数格式
function convertParams(paramsList) {
    if (!paramsList || !Array.isArray(paramsList))
        return [];
    return paramsList.map(param => ({
        param_id: generateId(),
        description: param.desc || param.description || '',
        field_type: param.type || param.field_type || 'string',
        is_checked: param.autoParent ? 0 : (param.required ? 1 : (param.is_checked ?? 0)),
        key: param.key,
        not_null: param.autoParent ? 0 : (param.required ? 1 : (param.not_null ?? 0)),
        value: param.autoParent ? '' : (param.example ?? param.value ?? ''),
        schema: param.schema || { type: param.type || 'string' }
    }));
}
// 为字段列表补充父级（object/array）字段，方便在参数表中展示完整路径
function expandFieldListWithParents(fields) {
    if (!Array.isArray(fields))
        return [];
    const userKeys = new Set(fields.filter(f => f && f.key).map(f => String(f.key)));
    const result = [];
    const seenKeys = new Set();
    const ensureParent = (keyPath) => {
        const segments = keyPath.split('.');
        let currentPath = '';
        segments.forEach((seg, index) => {
            const isArray = seg.endsWith('[]');
            const cleanSeg = isArray ? seg.slice(0, -2) : seg;
            currentPath = currentPath ? `${currentPath}.${cleanSeg}` : cleanSeg;
            // 如果用户已显式提供该父级，则不创建自动父级
            if (userKeys.has(currentPath))
                return;
            if (!seenKeys.has(currentPath)) {
                seenKeys.add(currentPath);
                if (index < segments.length - 1) {
                    result.push({
                        key: currentPath,
                        type: isArray ? 'array' : 'object',
                        required: false,
                        desc: '',
                        autoParent: true
                    });
                }
            }
        });
    };
    fields.forEach(field => {
        if (!field || !field.key)
            return;
        ensureParent(String(field.key));
        // 保留原字段（可能覆盖父级）
        if (!seenKeys.has(field.key)) {
            seenKeys.add(field.key);
            result.push(field);
        }
        else {
            // 如果父级已占位，再追加原字段
            result.push(field);
        }
    });
    return result;
}
// 构建描述映射，便于生成带注释的原始字符串
function buildDescMap(fields) {
    const map = new Map();
    if (!Array.isArray(fields))
        return map;
    fields.forEach(field => {
        if (!field || !field.key)
            return;
        const path = String(field.key).replace(/\[\]/g, '[0]');
        if (field.desc || field.description) {
            map.set(path, field.desc || field.description);
        }
    });
    return map;
}
// 将对象转为带行内注释的字符串（非严格 JSON，用于 raw 展示）
function stringifyWithComments(value, descMap, path = '', indent = 4, level = 0) {
    const pad = (lvl) => ' '.repeat(lvl * indent);
    if (Array.isArray(value)) {
        if (value.length === 0)
            return '[]';
        const items = value.map((item, index) => {
            const childPath = `${path}[${index}]`;
            const childStr = stringifyWithComments(item, descMap, childPath, indent, level + 1);
            const comment = descMap.get(childPath) ? ` // ${descMap.get(childPath)}` : '';
            return `${pad(level + 1)}${childStr}${comment}`;
        });
        return `[\n${items.join(',\n')}\n${pad(level)}]`;
    }
    if (value !== null && typeof value === 'object') {
        const entries = Object.keys(value).map(key => {
            const childPath = path ? `${path}.${key}` : key;
            const childStr = stringifyWithComments(value[key], descMap, childPath, indent, level + 1);
            const comment = descMap.get(childPath) ? ` // ${descMap.get(childPath)}` : '';
            return `${pad(level + 1)}"${key}": ${childStr}${comment}`;
        });
        return `{\n${entries.join(',\n')}\n${pad(level)}}`;
    }
    // 基本类型
    return JSON.stringify(value);
}
// 按类型提供默认示例值
function defaultValueByType(type) {
    switch ((type || '').toLowerCase()) {
        case 'integer':
        case 'number':
            return 0;
        case 'boolean':
            return false;
        case 'array':
            return [];
        case 'object':
            return {};
        case 'null':
            return null;
        default:
            return '';
    }
}
// 将扁平字段列表（key 带 . 或 []）构造成 JSON 对象
function buildJsonFromFieldList(fields) {
    const root = {};
    if (!Array.isArray(fields))
        return root;
    fields.forEach(field => {
        // 自动补充的父级节点仅用于展示，不参与值生成
        if (field && field.autoParent)
            return;
        if (!field || !field.key)
            return;
        const path = String(field.key);
        const segments = path.split('.').map(seg => {
            if (seg.endsWith('[]')) {
                return { key: seg.slice(0, -2), isArray: true };
            }
            return { key: seg, isArray: false };
        });
        let current = root;
        segments.forEach((seg, index) => {
            const isLeaf = index === segments.length - 1;
            if (seg.isArray) {
                if (!Array.isArray(current[seg.key])) {
                    current[seg.key] = [];
                }
                if (current[seg.key].length === 0) {
                    current[seg.key].push({});
                }
                if (isLeaf) {
                    const val = field.example ?? field.value ?? defaultValueByType(field.type);
                    current[seg.key][0] = val;
                }
                else {
                    if (typeof current[seg.key][0] !== 'object' || current[seg.key][0] === null) {
                        current[seg.key][0] = {};
                    }
                    current = current[seg.key][0];
                }
            }
            else {
                if (isLeaf) {
                    const val = field.example ?? field.value ?? defaultValueByType(field.type);
                    current[seg.key] = val;
                }
                else {
                    if (typeof current[seg.key] !== 'object' || current[seg.key] === null) {
                        current[seg.key] = {};
                    }
                    current = current[seg.key];
                }
            }
        });
    });
    return root;
}
// 根据 Body 参数构造示例 JSON
function generateRequestBodyFromParams(bodyParams) {
    if (!Array.isArray(bodyParams) || bodyParams.length === 0)
        return {};
    return buildJsonFromFieldList(bodyParams);
}
// 构造 Body 区块（用于 create/update）
function buildBodySection(bodyParams) {
    const hasBody = Array.isArray(bodyParams) && bodyParams.length > 0;
    const expandedFields = expandFieldListWithParents(bodyParams || []);
    const rawBody = generateRequestBodyFromParams(expandedFields);
    const descMap = buildDescMap(expandedFields);
    const rawString = hasBody
        ? (APIPOST_INLINE_COMMENTS
            ? stringifyWithComments(rawBody, descMap)
            : JSON.stringify(rawBody, null, 4))
        : '';
    return {
        mode: hasBody ? 'json' : 'none',
        parameter: [],
        raw: rawString,
        raw_parameter: convertParams(expandedFields),
        raw_schema: { type: 'object' },
        binary: null
    };
}
// 统一响应数据转换
function generateResponseData(responseConfig) {
    if (!responseConfig)
        return { code: 0, message: '操作成功', data: {} };
    if (typeof responseConfig === 'string') {
        try {
            return JSON.parse(responseConfig);
        }
        catch {
            return { code: 0, message: '操作成功', data: responseConfig };
        }
    }
    return responseConfig;
}
function isApiPostResponseExample(resp) {
    return !!resp && (resp.example_id !== undefined || resp.expect !== undefined || resp.raw !== undefined);
}
function normalizeResponses(responses, options = {}) {
    const { fallbackExamples = [], useDefaultWhenMissing = true, keepEmpty = true, isCheckResult = 1 } = options;
    const hasInput = Array.isArray(responses);
    const inputLength = hasInput ? responses.length : 0;
    // 用户显式提供了空数组并且允许保留空响应
    if (hasInput && inputLength === 0) {
        return { example: keepEmpty ? [] : fallbackExamples, is_check_result: isCheckResult };
    }
    // 未提供响应，使用回退或默认
    if (!hasInput) {
        if (fallbackExamples.length > 0) {
            return { example: fallbackExamples, is_check_result: isCheckResult };
        }
        if (!useDefaultWhenMissing) {
            return { example: [], is_check_result: isCheckResult };
        }
        const defaultData = generateResponseData(undefined);
        return {
            example: [{
                    example_id: '1',
                    raw: JSON.stringify(defaultData, null, 4),
                    raw_parameter: [],
                    headers: [],
                    expect: {
                        code: '200',
                        content_type: 'application/json',
                        is_default: 1,
                        mock: JSON.stringify(defaultData),
                        name: '成功响应',
                        schema: { type: 'object', properties: {} },
                        verify_type: 'schema',
                        sleep: 0
                    }
                }],
            is_check_result: isCheckResult
        };
    }
    // 已经是 ApiPost 的响应结构，直接透传
    if (responses.some(isApiPostResponseExample)) {
        return { example: responses, is_check_result: isCheckResult };
    }
    // 简化格式 -> ApiPost 兼容格式
    const converted = responses.map((resp, index) => ({
        example_id: String(index + 1),
        raw: (() => {
            const fields = Array.isArray(resp.fields) ? resp.fields : [];
            if (fields.length === 0) {
                throw new Error('responses.fields 必填且不能为空，data 字段已禁用，请提供字段列表');
            }
            const expandedFields = expandFieldListWithParents(fields);
            const descMap = buildDescMap(expandedFields);
            const rawData = buildJsonFromFieldList(expandedFields);
            return APIPOST_INLINE_COMMENTS && expandedFields.length > 0
                ? stringifyWithComments(rawData, descMap)
                : JSON.stringify(rawData, null, 4);
        })(),
        raw_parameter: convertParams(expandFieldListWithParents(resp.fields || [])),
        headers: [],
        expect: {
            code: String(resp.status ?? 200),
            content_type: 'application/json',
            is_default: index === 0 ? 1 : -1,
            mock: JSON.stringify(buildJsonFromFieldList(expandFieldListWithParents(resp.fields || []))),
            name: resp.name || (index === 0 ? '成功响应' : `响应${index + 1}`),
            schema: resp.schema || { type: 'object', properties: {} },
            verify_type: 'schema',
            sleep: 0
        }
    }));
    return { example: converted, is_check_result: isCheckResult };
}
// 构建项目路径映射
function buildPathMap(allItems) {
    const pathMap = new Map();
    const itemMap = new Map();
    // 建立ID到项目的映射
    allItems.forEach(item => {
        itemMap.set(item.target_id, item);
    });
    // 递归构建路径（带循环检测）
    function buildPath(targetId, visited = new Set()) {
        if (pathMap.has(targetId)) {
            return pathMap.get(targetId);
        }
        // 检测循环引用
        if (visited.has(targetId)) {
            console.warn(`检测到循环引用: ${targetId}`);
            return [];
        }
        const item = itemMap.get(targetId);
        if (!item)
            return [];
        visited.add(targetId);
        const path = [];
        if (item.parent_id && item.parent_id !== '0') {
            const parentPath = buildPath(item.parent_id, visited);
            path.push(...parentPath);
        }
        path.push(item.name);
        pathMap.set(targetId, path);
        visited.delete(targetId);
        return path;
    }
    // 为所有项目构建路径
    allItems.forEach(item => {
        buildPath(item.target_id);
    });
    return pathMap;
}
// 递归获取子项目
function getChildrenRecursively(items, parentId, maxDepth, currentDepth = 0) {
    if (maxDepth !== undefined && currentDepth >= maxDepth) {
        return [];
    }
    const children = items.filter(item => item.parent_id === parentId);
    const result = [...children];
    children.forEach(child => {
        if (child.target_type === 'folder') {
            result.push(...getChildrenRecursively(items, child.target_id, maxDepth, currentDepth + 1));
        }
    });
    return result;
}
// 按目录分组项目
function groupByFolder(items, allItems) {
    const groups = {};
    const folderMap = new Map();
    // 建立目录映射
    allItems.filter(item => item.target_type === 'folder').forEach(folder => {
        folderMap.set(folder.target_id, folder);
    });
    items.forEach(item => {
        const parentId = item.parent_id || '0';
        const parentName = parentId === '0' ? '根目录' : (folderMap.get(parentId)?.name || `未知目录(${parentId})`);
        if (!groups[parentName]) {
            groups[parentName] = [];
        }
        groups[parentName].push(item);
    });
    return groups;
}
// 构建层级结构显示
function buildListDisplay(items, totalCount, filteredCount, showStructure, searchKeyword, parentId, targetType, isLimited, limit, showPath, recursive, depth, groupByFolderFlag, allItems) {
    let listText = '';
    // 标题信息
    if (recursive) {
        listText += `🌲 递归搜索视图`;
        if (depth !== undefined)
            listText += ` (深度限制: ${depth})`;
        listText += `\n`;
    }
    else if (parentId !== undefined) {
        listText += `📁 目录层级视图 (父目录ID: ${parentId})\n`;
    }
    else {
        listText += `📋 项目完整列表\n`;
    }
    listText += `总计: ${totalCount}项, 当前显示: ${items.length}项\n\n`;
    // 筛选信息
    const filterInfo = [];
    if (searchKeyword)
        filterInfo.push(`搜索: "${searchKeyword}"`);
    if (parentId !== undefined)
        filterInfo.push(`父目录: ${parentId === '0' ? '根目录' : parentId}`);
    if (targetType && targetType !== 'all')
        filterInfo.push(`类型: ${targetType}`);
    if (recursive)
        filterInfo.push(`递归搜索: 是`);
    if (depth !== undefined)
        filterInfo.push(`深度限制: ${depth}`);
    if (filterInfo.length > 0) {
        listText += `🔍 筛选条件: ${filterInfo.join(' | ')}\n`;
        listText += `筛选结果: ${filteredCount}项\n\n`;
    }
    if (isLimited) {
        listText += `⚠️ 显示限制: 仅显示前${limit}项，如需查看更多请使用搜索过滤\n\n`;
    }
    if (items.length === 0) {
        listText += '📭 未找到匹配的项目\n\n';
        listText += '💡 提示:\n';
        listText += '• 尝试调整搜索关键词\n';
        listText += '• 检查父目录ID是否正确\n';
        listText += '• 使用不同的类型筛选\n';
        listText += '• 尝试使用 recursive=true 递归搜索子目录\n';
        return listText;
    }
    // 构建路径映射（如果需要显示路径）
    let pathMap;
    if (showPath && allItems) {
        pathMap = buildPathMap(allItems);
    }
    if (groupByFolderFlag && allItems) {
        // 按目录分组显示
        listText += buildGroupedList(items, allItems, pathMap);
    }
    else if (showStructure) {
        // 树形结构显示
        listText += buildTreeStructure(items, pathMap);
    }
    else {
        // 列表模式显示
        listText += buildFlatList(items, pathMap);
    }
    // 操作提示
    listText += '\n💡 使用提示:\n';
    listText += '• 使用 parent_id 参数查看特定目录下的内容\n';
    listText += '• 使用 target_type="folder" 仅查看目录\n';
    listText += '• 使用 target_type="api" 仅查看接口\n';
    listText += '• 使用 show_structure=true 查看树形结构\n';
    listText += '• 使用 show_path=true 显示完整路径\n';
    listText += '• 使用 recursive=true 递归搜索子目录\n';
    listText += '• 使用 group_by_folder=true 按目录分组显示\n';
    return listText;
}
// 构建树形结构
function buildTreeStructure(items, pathMap) {
    let result = '🌳 树形结构:\n\n';
    // 按类型分组，目录在前，接口在后
    const folders = items.filter(item => item.target_type === 'folder');
    const apis = items.filter(item => item.target_type === 'api');
    // 显示目录
    if (folders.length > 0) {
        result += '📁 目录:\n';
        folders.forEach((folder, index) => {
            const isLast = index === folders.length - 1 && apis.length === 0;
            const prefix = isLast ? '└── ' : '├── ';
            result += `${prefix}${folder.name}\n`;
            result += `    📋 ID: ${folder.target_id}\n`;
            // 显示完整路径
            if (pathMap && pathMap.has(folder.target_id)) {
                const path = pathMap.get(folder.target_id);
                result += `    📍 路径: ${path.join(' / ')}\n`;
            }
            if (folder.description) {
                result += `    📝 描述: ${folder.description}\n`;
            }
            result += '\n';
        });
    }
    // 显示接口
    if (apis.length > 0) {
        result += '🔗 接口:\n';
        apis.forEach((api, index) => {
            const isLast = index === apis.length - 1;
            const prefix = isLast ? '└── ' : '├── ';
            result += `${prefix}${api.name}`;
            if (api.method)
                result += ` [${api.method}]`;
            result += '\n';
            result += `    🌐 URL: ${api.url || '未设置'}\n`;
            result += `    📋 ID: ${api.target_id}\n`;
            // 显示完整路径
            if (pathMap && pathMap.has(api.target_id)) {
                const path = pathMap.get(api.target_id);
                result += `    📍 路径: ${path.join(' / ')}\n`;
            }
            if (api.description) {
                result += `    📝 描述: ${api.description}\n`;
            }
            result += '\n';
        });
    }
    return result;
}
// 构建平铺列表
function buildFlatList(items, pathMap) {
    let result = '📋 项目列表:\n\n';
    items.forEach((item, index) => {
        const num = (index + 1).toString().padStart(2, ' ');
        if (item.target_type === 'folder') {
            // 目录项
            result += `${num}. 📁 ${item.name}\n`;
            result += `     类型: 目录\n`;
            result += `     ID: ${item.target_id}\n`;
            result += `     父目录: ${item.parent_id === '0' ? '根目录' : item.parent_id}\n`;
            // 显示完整路径
            if (pathMap && pathMap.has(item.target_id)) {
                const path = pathMap.get(item.target_id);
                result += `     路径: ${path.join(' / ')}\n`;
            }
            if (item.description) {
                result += `     描述: ${item.description}\n`;
            }
        }
        else {
            // 接口项
            result += `${num}. 🔗 ${item.name}`;
            if (item.method)
                result += ` [${item.method}]`;
            result += '\n';
            result += `     类型: 接口\n`;
            result += `     URL: ${item.url || '未设置'}\n`;
            result += `     ID: ${item.target_id}\n`;
            result += `     父目录: ${item.parent_id === '0' ? '根目录' : item.parent_id}\n`;
            // 显示完整路径
            if (pathMap && pathMap.has(item.target_id)) {
                const path = pathMap.get(item.target_id);
                result += `     路径: ${path.join(' / ')}\n`;
            }
            if (item.description) {
                result += `     描述: ${item.description}\n`;
            }
        }
        result += '\n';
    });
    return result;
}
// 构建分组列表
function buildGroupedList(items, allItems, pathMap) {
    let result = '📂 按目录分组显示:\n\n';
    const groups = groupByFolder(items, allItems);
    const groupNames = Object.keys(groups).sort();
    groupNames.forEach((groupName, groupIndex) => {
        const groupItems = groups[groupName];
        const isLastGroup = groupIndex === groupNames.length - 1;
        result += `📁 ${groupName} (${groupItems.length}项)\n`;
        result += `${isLastGroup ? '   ' : '│  '}\n`;
        groupItems.forEach((item, index) => {
            const isLastItem = index === groupItems.length - 1;
            const itemPrefix = isLastGroup ?
                (isLastItem ? '   └── ' : '   ├── ') :
                (isLastItem ? '│  └── ' : '│  ├── ');
            if (item.target_type === 'folder') {
                result += `${itemPrefix}📁 ${item.name}\n`;
                if (!isLastGroup || !isLastItem) {
                    result += `${isLastGroup ? '       ' : '│      '}📋 ID: ${item.target_id}\n`;
                }
                else {
                    result += `       📋 ID: ${item.target_id}\n`;
                }
            }
            else {
                result += `${itemPrefix}🔗 ${item.name}`;
                if (item.method)
                    result += ` [${item.method}]`;
                result += '\n';
                if (!isLastGroup || !isLastItem) {
                    result += `${isLastGroup ? '       ' : '│      '}📋 ID: ${item.target_id}\n`;
                    result += `${isLastGroup ? '       ' : '│      '}🌐 URL: ${item.url || '未设置'}\n`;
                }
                else {
                    result += `       📋 ID: ${item.target_id}\n`;
                    result += `       🌐 URL: ${item.url || '未设置'}\n`;
                }
            }
            // 显示完整路径
            if (pathMap && pathMap.has(item.target_id)) {
                const path = pathMap.get(item.target_id);
                if (!isLastGroup || !isLastItem) {
                    result += `${isLastGroup ? '       ' : '│      '}📍 路径: ${path.join(' / ')}\n`;
                }
                else {
                    result += `       📍 路径: ${path.join(' / ')}\n`;
                }
            }
        });
        result += '\n';
    });
    return result;
}
// 解析API配置
function parseApiConfig(configJson) {
    if (!configJson)
        return {};
    try {
        return JSON.parse(configJson);
    }
    catch (error) {
        console.error('解析API配置失败:', error);
        return {};
    }
}
// 解析单个配置参数
function parseConfigParam(paramJson) {
    if (!paramJson)
        return [];
    try {
        const parsed = JSON.parse(paramJson);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (error) {
        console.error('解析配置参数失败:', error);
        return [];
    }
}
function ensureFieldsHaveDesc(list, context) {
    if (!Array.isArray(list))
        return;
    const missing = list.filter(item => item && !item.desc && !item.description);
    if (missing.length > 0) {
        throw new Error(`${context} 缺少 desc，请为每个字段填写 desc`);
    }
}
function ensureResponsesFieldsHaveDesc(responses) {
    if (!Array.isArray(responses))
        return;
    responses.forEach((resp, index) => {
        if (resp && Array.isArray(resp.fields)) {
            ensureFieldsHaveDesc(resp.fields, `responses[${index}].fields`);
        }
        else {
            throw new Error(`responses[${index}] 未提供 fields 或格式不正确`);
        }
    });
}
// 构建配置对象，同时记录哪些字段被明确提供了
function buildApiConfig(args) {
    const config = {};
    const providedFields = new Set();
    if (args.description !== undefined) {
        config.description = args.description;
        providedFields.add('description');
    }
    if (args.headers !== undefined) {
        config.headers = parseConfigParam(args.headers);
        ensureFieldsHaveDesc(config.headers, 'headers');
        providedFields.add('headers');
    }
    if (args.query !== undefined) {
        config.query = parseConfigParam(args.query);
        ensureFieldsHaveDesc(config.query, 'query');
        providedFields.add('query');
    }
    if (args.body !== undefined) {
        config.body = parseConfigParam(args.body);
        ensureFieldsHaveDesc(config.body, 'body');
        providedFields.add('body');
    }
    if (args.cookies !== undefined) {
        config.cookies = parseConfigParam(args.cookies);
        ensureFieldsHaveDesc(config.cookies, 'cookies');
        providedFields.add('cookies');
    }
    if (args.auth !== undefined) {
        config.auth = parseApiConfig(args.auth);
        providedFields.add('auth');
    }
    if (args.responses !== undefined) {
        config.responses = parseConfigParam(args.responses);
        ensureResponsesFieldsHaveDesc(config.responses);
        providedFields.add('responses');
    }
    return { config, providedFields };
}
// 生成API模板
function generateApiTemplate(method, url, name, config = {}) {
    return {
        target_id: generateId(),
        target_type: 'api',
        parent_id: '0',
        name,
        method,
        url: applyUrlPrefix(url),
        protocol: 'http/1.1',
        description: config.description || `${name} - ${method} ${url}`,
        version: 3,
        mark_id: 1,
        is_force: -1,
        request: {
            auth: config.auth || { type: 'inherit' },
            pre_tasks: config.pre_tasks || [],
            post_tasks: config.post_tasks || [],
            header: {
                parameter: convertParams(config.headers || [])
            },
            query: {
                query_add_equal: 1,
                parameter: convertParams(config.query || [])
            },
            body: buildBodySection(config.body || []),
            cookie: {
                cookie_encode: 1,
                parameter: convertParams(config.cookies || [])
            },
            restful: {
                parameter: convertParams(config.restful || [])
            }
        },
        response: normalizeResponses(config.responses, { useDefaultWhenMissing: true, keepEmpty: true, isCheckResult: 1 }),
        attribute_info: config.attribute_info || {},
        tags: config.tags || []
    };
}
// 工作空间信息
let currentWorkspace = null;
// 初始化工作空间
async function initWorkspace(startTime) {
    try {
        logWithTime('📈 获取团队列表...', startTime);
        const teamsResult = await apiClient.get('/open/team/list');
        if (!teamsResult.data.data || teamsResult.data.data.length === 0) {
            console.error('📋 获取团队列表原始数据:', JSON.stringify(teamsResult.data, null, 2));
            throw new Error('未找到可用团队');
        }
        // 选择团队：优先使用指定的团队名称，否则使用第一个
        let selectedTeam = teamsResult.data.data[0];
        if (APIPOST_DEFAULT_TEAM_NAME) {
            const targetTeam = teamsResult.data.data.find((team) => team.name === APIPOST_DEFAULT_TEAM_NAME);
            if (targetTeam) {
                selectedTeam = targetTeam;
                logWithTime(`🎯 使用指定团队: ${APIPOST_DEFAULT_TEAM_NAME}`, startTime);
            }
            else {
                logWithTime(`⚠️ 未找到指定团队 "${APIPOST_DEFAULT_TEAM_NAME}"，使用默认团队`, startTime);
            }
        }
        logWithTime(`✅ 选中团队
团队名称: ${selectedTeam.name}
团队ID: ${selectedTeam.team_id}`, startTime);
        logWithTime('📁 获取项目列表...', startTime);
        const projectsResult = await apiClient.get('/open/project/list', {
            params: { team_id: selectedTeam.team_id, action: 0 }
        });
        if (!projectsResult.data.data || projectsResult.data.data.length === 0) {
            throw new Error('未找到可用项目');
        }
        // 选择项目：优先使用指定的项目名称，否则使用第一个
        let selectedProject = projectsResult.data.data[0];
        if (APIPOST_DEFAULT_PROJECT_NAME) {
            const targetProject = projectsResult.data.data.find((project) => project.name === APIPOST_DEFAULT_PROJECT_NAME);
            if (targetProject) {
                selectedProject = targetProject;
                logWithTime(`🎯 使用指定项目: ${APIPOST_DEFAULT_PROJECT_NAME}`, startTime);
            }
            else {
                logWithTime(`⚠️ 未找到指定项目 "${APIPOST_DEFAULT_PROJECT_NAME}"，使用默认项目`, startTime);
            }
        }
        logWithTime(`
✅ 选中项目
项目名称: ${selectedProject.name}
项目ID: ${selectedProject.project_id}`, startTime);
        currentWorkspace = {
            teamId: selectedTeam.team_id,
            teamName: selectedTeam.name,
            projectId: selectedProject.project_id,
            projectName: selectedProject.name
        };
        logWithTime(`✨ 工作空间初始化完成 (安全模式: ${APIPOST_SECURITY_MODE})`, startTime);
    }
    catch (error) {
        logWithTime('❌ 工作空间初始化失败: ' + error, startTime);
        throw error;
    }
}
// 创建MCP服务器
const server = new Server({
    name: 'apipost-mcp',
    version: '1.0.0',
    capabilities: { tools: {} }
});
// 工具定义
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'apipost_test_connection',
            description: '测试ApiPost MCP连接状态和配置信息，验证服务可用性',
            inputSchema: {
                type: 'object',
                properties: {
                    random_string: { type: 'string', description: 'Dummy parameter for no-parameter tools' }
                },
                required: ['random_string']
            }
        },
        {
            name: 'apipost_workspace',
            description: '工作空间管理：查看当前工作空间、列出团队和项目、切换工作空间',
            inputSchema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['current', 'list_teams', 'list_projects', 'switch'],
                        description: '操作类型：current(查看当前)、list_teams(列出团队)、list_projects(列出项目)、switch(切换工作空间)'
                    },
                    team_id: { type: 'string', description: '团队ID（用于list_projects或switch）' },
                    project_id: { type: 'string', description: '项目ID（用于switch）' },
                    team_name: { type: 'string', description: '团队名称（用于按名称切换）' },
                    project_name: { type: 'string', description: '项目名称（用于按名称切换）' },
                    show_details: { type: 'boolean', description: '是否显示详细信息，默认false' },
                    show_all: { type: 'boolean', description: '是否显示所有可用的团队和项目，默认false' }
                },
                required: ['action']
            }
        },
        {
            name: 'apipost_create_folder',
            description: '创建API文档目录，支持在指定父目录下创建新的文件夹',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: '目录名称' },
                    parent_id: { type: 'string', description: '父目录ID，使用"0"表示根目录，默认为"0"' },
                    description: { type: 'string', description: '目录描述（可选）' }
                },
                required: ['name'],
                additionalProperties: false
            }
        },
        {
            name: 'apipost_smart_create',
            description: 'API接口文档生成器（字段列表驱动）。规则：responses 只传 fields，不传 data；headers/query/body/cookies 统一用字段列表，嵌套用 .，数组用 []；example 填真实值（不要 JSON 字符串）；所有字段含父级都必须写 desc，父级需显式声明。例如：{"key":"data","desc":"返回体","type":"object"},{"key":"data.user","desc":"用户","type":"object"},{"key":"data.user.id","desc":"用户ID","type":"integer","example":1}',
            inputSchema: {
                type: 'object',
                properties: {
                    method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP方法' },
                    url: { type: 'string', description: '接口URL路径' },
                    name: { type: 'string', description: '接口名称' },
                    parent_id: { type: 'string', description: '父目录ID，使用"0"表示根目录，默认为"0"' },
                    description: { type: 'string', description: '接口详细描述（可选）' },
                    headers: { type: 'string', description: 'Headers字段列表字符串，格式：[{"key":"X-Request-ID","type":"string","required":false,"example":"req-1","desc":"说明"}]' },
                    query: { type: 'string', description: 'Query字段列表字符串，格式同上。嵌套用 .，数组用 []（如 meta.flags.debug 或 items[].id）。' },
                    body: { type: 'string', description: 'Body字段列表字符串，仅用字段列表生成 raw/参数描述，example 用真实值，不要放 JSON 字符串。' },
                    cookies: { type: 'string', description: 'Cookies字段列表字符串，格式同上。' },
                    auth: { type: 'string', description: '认证配置JSON字符串（可选）。格式：{"type":"bearer","bearer":{"key":"your_token"}}' },
                    responses: { type: 'string', description: '响应字段列表字符串（必填 fields），格式：[{"name":"成功","status":200,"fields":[{"key":"code","type":"integer","example":0,"desc":"状态码"},{"key":"data.items[].id","type":"string","example":"1"}]}]' }
                },
                required: ['method', 'url', 'name'],
                additionalProperties: false
            }
        },
        {
            name: 'apipost_list',
            description: '查看项目API列表，支持强化的目录层级搜索和父子关系定位',
            inputSchema: {
                type: 'object',
                properties: {
                    search: { type: 'string', description: '搜索关键词（接口名称、URL、方法、ID、描述）' },
                    parent_id: { type: 'string', description: '父目录ID，精确查找某个目录下的子项目。使用"0"查看根目录，使用具体ID查看子目录' },
                    target_type: { type: 'string', enum: ['api', 'folder', 'all'], description: '项目类型筛选：api(仅接口)、folder(仅目录)、all(全部)，默认all' },
                    show_structure: { type: 'boolean', description: '是否显示层级结构（树形展示），默认false为列表模式' },
                    show_path: { type: 'boolean', description: '是否显示完整路径（从根目录到当前项目的完整路径），默认false' },
                    recursive: { type: 'boolean', description: '是否递归搜索子目录（搜索指定目录及其所有子目录），默认false仅搜索当前层级' },
                    depth: { type: 'number', description: '层级深度限制（配合recursive使用，限制搜索深度），默认无限制' },
                    group_by_folder: { type: 'boolean', description: '是否按目录分组显示结果，默认false' },
                    limit: { type: 'number', description: '显示数量限制（默认50，最大200）' },
                    show_all: { type: 'boolean', description: '显示全部项目（忽略limit限制）' }
                }
            }
        },
        {
            name: 'apipost_update',
            description: '修改API接口文档。规则同创建：responses 只用 fields（必填），不要传 data；headers/query/body/cookies 统一用字段列表，嵌套用 .，数组用 []，example 填真实值；所有字段含父级必须写 desc，父级需显式声明。例如：{"key":"data","desc":"返回体","type":"object"},{"key":"data.user","desc":"用户","type":"object"},{"key":"data.user.id","desc":"用户ID","type":"integer","example":1}',
            inputSchema: {
                type: 'object',
                properties: {
                    target_id: { type: 'string', description: '要修改的接口ID' },
                    name: { type: 'string', description: '新的接口名称（可选）' },
                    method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: '新的HTTP方法（可选）' },
                    url: { type: 'string', description: '新的接口URL（可选）' },
                    description: { type: 'string', description: '接口详细描述（可选）。提供空字符串""可清空描述' },
                    headers: { type: 'string', description: 'Headers参数JSON数组字符串（可选）。提供"[]"可删除所有headers。格式：[{"key":"Content-Type","desc":"内容类型","type":"string","required":true,"example":"application/json"}]' },
                    query: { type: 'string', description: 'Query参数JSON数组字符串（可选）。提供"[]"可删除所有query参数。格式：[{"key":"page","desc":"页码","type":"integer","required":false,"example":"1"}]' },
                    body: { type: 'string', description: 'Body参数JSON数组字符串（可选）。提供"[]"可删除所有body参数。格式：[{"key":"name","desc":"用户名","type":"string","required":true,"example":"张三"}]' },
                    cookies: { type: 'string', description: 'Cookies参数JSON数组字符串（可选）。提供"[]"可删除所有cookies。格式：[{"key":"session_id","desc":"会话ID","type":"string","required":false,"example":"abc123"}]' },
                    auth: { type: 'string', description: '认证配置JSON字符串（可选）。提供"{}"可删除认证配置。格式：{"type":"bearer","bearer":{"key":"your_token"}}' },
                    responses: { type: 'string', description: '响应示例JSON数组字符串（可选）。提供"[]"可删除所有响应示例。格式：[{"name":"成功响应","status":200,"data":{"code":0},"fields":[{"key":"code","desc":"状态码","type":"integer","example":"0"}]}]' }
                },
                required: ['target_id'],
                additionalProperties: false
            }
        },
        {
            name: 'apipost_detail',
            description: '查看API接口的详细配置信息，包括完整的请求参数、响应格式、认证设置等。',
            inputSchema: {
                type: 'object',
                properties: {
                    target_id: { type: 'string', description: '要查看的接口ID' }
                },
                required: ['target_id'],
                additionalProperties: false
            }
        },
        {
            name: 'apipost_delete',
            description: '批量删除API接口文档，支持单个或多个接口删除。删除前先用apipost_list查看接口列表获取ID',
            inputSchema: {
                type: 'object',
                properties: {
                    api_ids: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'API接口ID数组（可从列表中获取target_id）- 支持单个["id1"]或多个["id1","id2","id3"]'
                    }
                },
                required: ['api_ids']
            }
        }
    ]
}));
// 工具处理
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (!args) {
        throw new Error('缺少参数');
    }
    const startTime = Date.now();
    try {
        if (!currentWorkspace) {
            await initWorkspace(startTime);
        }
        switch (name) {
            case 'apipost_test_connection':
                const connectionInfo = {
                    status: '✅ 连接正常',
                    mcp_version: '1.0.0',
                    api_host: APIPOST_HOST,
                    security_mode: APIPOST_SECURITY_MODE,
                    workspace: currentWorkspace ? {
                        team_name: currentWorkspace.teamName,
                        project_name: currentWorkspace.projectName,
                        project_id: currentWorkspace.projectId
                    } : null,
                    environment: {
                        token_configured: !!APIPOST_TOKEN,
                        host_configured: !!APIPOST_HOST,
                        node_version: process.version,
                        platform: process.platform,
                        url_prefix: APIPOST_URL_PREFIX
                    },
                    available_operations: {
                        create_api: checkSecurityPermission('write'),
                        update_api: checkSecurityPermission('write'),
                        delete_api: checkSecurityPermission('write'),
                        read_api: checkSecurityPermission('read')
                    },
                    test_time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                };
                return {
                    content: [
                        {
                            type: 'text',
                            text: `🎉 ApiPost MCP 连接测试成功！

📊 连接状态: ${connectionInfo.status}
🔗 MCP版本: ${connectionInfo.mcp_version}
🌐 API地址: ${connectionInfo.api_host}
🔒 安全模式: ${connectionInfo.security_mode}

🏢 当前工作空间:
${connectionInfo.workspace ? `• 团队: ${connectionInfo.workspace.team_name}
• 项目: ${connectionInfo.workspace.project_name}
• 项目ID: ${connectionInfo.workspace.project_id}` : '• 工作空间未初始化'}

🔧 环境配置:
• Token配置: ${connectionInfo.environment.token_configured ? '✅ 已配置' : '❌ 未配置'}
• Host配置: ${connectionInfo.environment.host_configured ? '✅ 已配置' : '❌ 未配置'}
• URL前缀: ${connectionInfo.environment.url_prefix || '（未配置）'}
• Node版本: ${connectionInfo.environment.node_version}
• 系统平台: ${connectionInfo.environment.platform}

🛠️ 可用操作:
• 创建接口: ${connectionInfo.available_operations.create_api ? '✅ 允许' : '❌ 禁止'}
• 更新接口: ${connectionInfo.available_operations.update_api ? '✅ 允许' : '❌ 禁止'}
• 删除接口: ${connectionInfo.available_operations.delete_api ? '✅ 允许' : '❌ 禁止'}
• 读取接口: ${connectionInfo.available_operations.read_api ? '✅ 允许' : '❌ 禁止'}

⏰ 测试时间: ${connectionInfo.test_time}

🎯 MCP服务器运行正常，可以开始使用其他工具！`
                        }
                    ]
                };
            case 'apipost_workspace':
                const action = args.action;
                switch (action) {
                    case 'current':
                        // 查看当前工作空间
                        const showAll = args.show_all;
                        let workspaceText = '🏢 当前工作空间信息:\n\n';
                        if (currentWorkspace) {
                            workspaceText += `📋 团队: ${currentWorkspace.teamName}\n`;
                            workspaceText += `   🆔 ID: ${currentWorkspace.teamId}\n\n`;
                            workspaceText += `📁 项目: ${currentWorkspace.projectName}\n`;
                            workspaceText += `   🆔 ID: ${currentWorkspace.projectId}\n\n`;
                            workspaceText += `🔒 安全模式: ${APIPOST_SECURITY_MODE}\n`;
                        }
                        else {
                            workspaceText += '❌ 工作空间未初始化\n';
                            workspaceText += '💡 请使用 apipost_workspace action:switch 切换到可用的工作空间\n\n';
                        }
                        if (showAll) {
                            try {
                                workspaceText += '\n📋 可用团队和项目:\n\n';
                                const allTeamsRes = await apiClient.get('/open/team/list');
                                const allTeams = allTeamsRes.data.data || [];
                                for (const team of allTeams) {
                                    workspaceText += `📋 团队: ${team.name} (${team.team_id})\n`;
                                    try {
                                        const teamProjectsRes = await apiClient.get('/open/project/list', {
                                            params: { team_id: team.team_id, action: 0 }
                                        });
                                        const teamProjects = teamProjectsRes.data.data || [];
                                        if (teamProjects.length > 0) {
                                            teamProjects.forEach((project) => {
                                                workspaceText += `   📁 ${project.name} (${project.project_id})\n`;
                                            });
                                        }
                                        else {
                                            workspaceText += `   📭 无可用项目\n`;
                                        }
                                    }
                                    catch (error) {
                                        workspaceText += `   ❌ 获取项目列表失败\n`;
                                    }
                                    workspaceText += '\n';
                                }
                            }
                            catch (error) {
                                workspaceText += `\n❌ 获取可用团队列表失败: ${error}\n`;
                            }
                        }
                        return {
                            content: [{ type: 'text', text: workspaceText }]
                        };
                    case 'list_teams':
                        // 列出团队

                        const teamsResult = await apiClient.get('/open/team/list');
                        if (teamsResult.data.code !== 0) {
                            throw new Error(`获取团队列表失败: ${teamsResult.data.msg}`);
                        }
                        const teams = teamsResult.data.data || [];
                        const showDetails = args.show_details;
                        let teamsText = `📋 可用团队列表 (共 ${teams.length} 个):\n\n`;
                        if (teams.length === 0) {
                            teamsText += '📭 未找到可用团队\n';
                        }
                        else {
                            teams.forEach((team, index) => {
                                const num = (index + 1).toString().padStart(2, ' ');
                                const isCurrent = currentWorkspace?.teamId === team.team_id ? ' ⭐ 当前' : '';
                                teamsText += `${num}. ${team.name}${isCurrent}\n`;
                                teamsText += `     🆔 ID: ${team.team_id}\n`;
                                if (showDetails) {
                                    teamsText += `     📅 创建时间: ${team.created_at || '未知'}\n`;
                                    teamsText += `     👤 创建者: ${team.creator_name || '未知'}\n`;
                                    if (team.description) {
                                        teamsText += `     📝 描述: ${team.description}\n`;
                                    }
                                }
                                teamsText += '\n';
                            });
                        }
                        if (currentWorkspace) {
                            teamsText += `💡 当前团队: ${currentWorkspace.teamName} (${currentWorkspace.teamId})\n`;
                        }
                        teamsText += '\n💡 使用 apipost_workspace action:switch 切换团队和项目';
                        return {
                            content: [{ type: 'text', text: teamsText }]
                        };
                    case 'list_projects':
                        // 列出项目
                        const targetTeamId = args.team_id || currentWorkspace?.teamId;
                        if (!targetTeamId) {
                            throw new Error('请指定团队ID或确保已初始化工作空间');
                        }

                        const projectsResult = await apiClient.get('/open/project/list', {
                            params: { team_id: targetTeamId, action: 0 }
                        });
                        if (projectsResult.data.code !== 0) {
                            throw new Error(`获取项目列表失败: ${projectsResult.data.msg}`);
                        }
                        const projects = projectsResult.data.data || [];
                        const showProjectDetails = args.show_details;
                        // 获取团队信息
                        const teamsRes = await apiClient.get('/open/team/list');
                        const currentTeam = teamsRes.data.data?.find((t) => t.team_id === targetTeamId);
                        const teamName = currentTeam?.name || targetTeamId;
                        let projectsText = `📁 团队 "${teamName}" 的项目列表 (共 ${projects.length} 个):\n\n`;
                        if (projects.length === 0) {
                            projectsText += '📭 该团队下未找到项目\n';
                        }
                        else {
                            projects.forEach((project, index) => {
                                const num = (index + 1).toString().padStart(2, ' ');
                                const isCurrent = currentWorkspace?.projectId === project.project_id ? ' ⭐ 当前' : '';
                                projectsText += `${num}. ${project.name}${isCurrent}\n`;
                                projectsText += `     🆔 ID: ${project.project_id}\n`;
                                if (showProjectDetails) {
                                    projectsText += `     📅 创建时间: ${project.created_at || '未知'}\n`;
                                    projectsText += `     👤 创建者: ${project.creator_name || '未知'}\n`;
                                    if (project.description) {
                                        projectsText += `     📝 描述: ${project.description}\n`;
                                    }
                                    projectsText += `     🔒 可见性: ${project.is_public ? '公开' : '私有'}\n`;
                                }
                                projectsText += '\n';
                            });
                        }
                        if (currentWorkspace && currentWorkspace.teamId === targetTeamId) {
                            projectsText += `💡 当前项目: ${currentWorkspace.projectName} (${currentWorkspace.projectId})\n`;
                        }
                        projectsText += '\n💡 使用 apipost_workspace action:switch 切换到指定项目';
                        return {
                            content: [{ type: 'text', text: projectsText }]
                        };
                    case 'switch':
                        // 切换工作空间
                        const newTeamId = args.team_id;
                        const newProjectId = args.project_id;
                        const teamNameToSwitch = args.team_name;
                        const projectNameToSwitch = args.project_name;

                        // 如果提供了名称，先查找对应的ID
                        let finalTeamId = newTeamId;
                        let finalProjectId = newProjectId;
                        if (teamNameToSwitch && !newTeamId) {
                            const teamsRes = await apiClient.get('/open/team/list');
                            const team = teamsRes.data.data?.find((t) => t.name === teamNameToSwitch);
                            if (!team) {
                                throw new Error(`未找到名称为 "${teamNameToSwitch}" 的团队`);
                            }
                            finalTeamId = team.team_id;
                        }
                        if (projectNameToSwitch && !newProjectId) {
                            if (!finalTeamId) {
                                throw new Error('切换到指定项目需要先指定团队');
                            }
                            const projectsRes = await apiClient.get('/open/project/list', {
                                params: { team_id: finalTeamId, action: 0 }
                            });
                            const project = projectsRes.data.data?.find((p) => p.name === projectNameToSwitch);
                            if (!project) {
                                throw new Error(`在团队中未找到名称为 "${projectNameToSwitch}" 的项目`);
                            }
                            finalProjectId = project.project_id;
                        }
                        if (!finalTeamId || !finalProjectId) {
                            throw new Error('请提供团队ID和项目ID，或者提供团队名称和项目名称');
                        }
                        // 验证团队和项目是否存在且可访问
                        const teamCheckRes = await apiClient.get('/open/team/list');
                        const targetTeam = teamCheckRes.data.data?.find((t) => t.team_id === finalTeamId);
                        if (!targetTeam) {
                            throw new Error(`团队ID "${finalTeamId}" 不存在或无权限访问`);
                        }
                        const projectCheckRes = await apiClient.get('/open/project/list', {
                            params: { team_id: finalTeamId, action: 0 }
                        });
                        const targetProject = projectCheckRes.data.data?.find((p) => p.project_id === finalProjectId);
                        if (!targetProject) {
                            throw new Error(`项目ID "${finalProjectId}" 在指定团队中不存在或无权限访问`);
                        }
                        // 更新工作空间
                        const oldWorkspace = currentWorkspace;
                        currentWorkspace = {
                            teamId: finalTeamId,
                            teamName: targetTeam.name,
                            projectId: finalProjectId,
                            projectName: targetProject.name
                        };

                        let switchText = '🔄 工作空间切换成功！\n\n';
                        if (oldWorkspace) {
                            switchText += `📤 原工作空间:\n`;
                            switchText += `   团队: ${oldWorkspace.teamName} (${oldWorkspace.teamId})\n`;
                            switchText += `   项目: ${oldWorkspace.projectName} (${oldWorkspace.projectId})\n\n`;
                        }
                        switchText += `📥 新工作空间:\n`;
                        switchText += `   团队: ${currentWorkspace.teamName} (${currentWorkspace.teamId})\n`;
                        switchText += `   项目: ${currentWorkspace.projectName} (${currentWorkspace.projectId})\n\n`;
                        switchText += `✨ 现在可以在新的工作空间中进行 API 操作了！`;
                        return {
                            content: [{ type: 'text', text: switchText }]
                        };
                    default:
                        throw new Error(`未知的操作类型: ${action}. 可用操作: current, list_teams, list_projects, switch`);
                }
            case 'apipost_create_folder':
                if (!checkSecurityPermission('write')) {
                    throw new Error(`🔒 安全模式 "${APIPOST_SECURITY_MODE}" 不允许创建操作。需要 "limited" 或 "full" 模式。`);
                }
                const folderName = args.name;
                const folderParentId = args.parent_id || '0';
                const folderDescription = args.description || '';
                if (!folderName) {
                    throw new Error('请提供目录名称');
                }
                // 生成目录模板
                const folderTemplate = {
                    project_id: currentWorkspace.projectId,
                    target_id: generateId(),
                    parent_id: folderParentId,
                    target_type: 'folder',
                    name: folderName,
                    sort: 0,
                    version: 0,
                    server_id: '0',
                    status: 1,
                    is_changed: 1,
                    is_create: 1,
                    description: folderDescription,
                    request: {
                        header: { parameter: [] },
                        query: { parameter: [] },
                        body: { parameter: [] },
                        cookie: { parameter: [] },
                        auth: {
                            type: 'inherit',
                            kv: { key: '', value: '', in: 'header' },
                            bearer: { key: '' },
                            basic: { username: '', password: '' },
                            digest: {
                                username: '',
                                password: '',
                                realm: '',
                                nonce: '',
                                algorithm: 'MD5',
                                qop: '',
                                nc: '',
                                cnonce: '',
                                opaque: '',
                                disableRetryRequest: false
                            },
                            oauth1: {
                                consumerKey: '',
                                consumerSecret: '',
                                signatureMethod: 'HMAC-SHA1',
                                addEmptyParamsToSign: true,
                                includeBodyHash: true,
                                addParamsToHeader: false,
                                realm: '',
                                version: '1.0',
                                nonce: '',
                                timestamp: '',
                                verifier: '',
                                callback: '',
                                tokenSecret: '',
                                token: '',
                                disableHeaderEncoding: false
                            },
                            hawk: {
                                authId: '',
                                authKey: '',
                                algorithm: '',
                                user: '',
                                nonce: '',
                                extraData: '',
                                app: '',
                                delegation: '',
                                timestamp: '',
                                includePayloadHash: false
                            },
                            awsv4: {
                                accessKey: '',
                                secretKey: '',
                                region: '',
                                service: '',
                                sessionToken: '',
                                addAuthDataToQuery: false
                            },
                            ntlm: {
                                username: '',
                                password: '',
                                domain: '',
                                workstation: '',
                                disableRetryRequest: false
                            },
                            edgegrid: {
                                accessToken: '',
                                clientToken: '',
                                clientSecret: '',
                                nonce: '',
                                timestamp: '',
                                baseURi: '',
                                headersToSign: ''
                            },
                            noauth: {},
                            jwt: {
                                addTokenTo: 'header',
                                algorithm: 'HS256',
                                secret: '',
                                isSecretBase64Encoded: false,
                                payload: '',
                                headerPrefix: 'Bearer',
                                queryParamKey: 'token',
                                header: ''
                            },
                            asap: {
                                alg: 'HS256',
                                iss: '',
                                aud: '',
                                kid: '',
                                privateKey: '',
                                sub: '',
                                claims: '',
                                exp: ''
                            }
                        },
                        pre_tasks: [],
                        post_tasks: []
                    },
                    is_force: -1,
                    is_deleted: -1,
                    is_conflicted: -1,
                    mark_id: '1'
                };
                // 创建目录
                const createFolderResult = await apiClient.post('/open/apis/create', folderTemplate);
                if (createFolderResult.data.code !== 0) {
                    throw new Error(`创建目录失败: ${createFolderResult.data.msg}`);
                }

                return {
                    content: [{
                            type: 'text',
                            text: `目录创建成功!\n名称: ${folderName}\n目录ID: ${folderTemplate.target_id}\n父目录ID: ${folderParentId}${folderDescription ? '\n描述: ' + folderDescription : ''}`
                        }]
                };
            case 'apipost_smart_create':
                if (!checkSecurityPermission('write')) {
                    throw new Error(`🔒 安全模式 "${APIPOST_SECURITY_MODE}" 不允许创建操作。需要 "limited" 或 "full" 模式。`);
                }
                // 构建配置对象
                const { config } = buildApiConfig(args);
                const template = generateApiTemplate(args.method, args.url, args.name, config);
                template.project_id = currentWorkspace.projectId;
                // 设置父目录ID
                template.parent_id = args.parent_id || '0';
                const headerCount = config.headers?.length || 0;
                const queryCount = config.query?.length || 0;
                const bodyCount = config.body?.length || 0;
                const responseCount = config.responses?.length || 0;
                const createResult = await apiClient.post('/open/apis/create', template);
                if (createResult.data.code !== 0) {
                    throw new Error(`创建失败: ${createResult.data.msg}`);
                }

                return {
                    content: [{
                            type: 'text',
                            text: `API创建成功!\n名称: ${args.name}\n方法: ${args.method}\nURL: ${args.url}\nID: ${createResult.data.data.target_id}\n\n字段统计:\n• Headers: ${headerCount}个\n• Query参数: ${queryCount}个\n• Body参数: ${bodyCount}个\n• 响应示例: ${responseCount}个`
                        }]
                };
            case 'apipost_list':
                if (!checkSecurityPermission('read')) {
                    throw new Error(`🔒 安全模式 "${APIPOST_SECURITY_MODE}" 不允许读取操作。`);
                }
                const searchKeyword = args.search;
                const parentId = args.parent_id;
                const targetType = args.target_type || 'all';
                const showStructure = args.show_structure;
                const showPath = args.show_path;
                const recursive = args.recursive;
                const depth = args.depth;
                const groupByFolderFlag = args.group_by_folder;
                const limit = Math.min(args.limit || 50, 200);
                const showAll = args.show_all;
                const listResult = await apiClient.get('/open/apis/list', {
                    params: { project_id: currentWorkspace.projectId }
                });
                if (listResult.data.code !== 0) {
                    throw new Error(`获取列表失败: ${listResult.data.msg}`);
                }
                let items = listResult.data.data.list;
                const totalCount = items.length;
                const allItems = [...items]; // 保存完整列表用于路径构建和分组
                // 递归搜索或按目录过滤
                if (recursive && parentId !== undefined) {
                    // 递归搜索指定目录及其子目录
                    items = getChildrenRecursively(items, parentId, depth);
                }
                else if (parentId !== undefined) {
                    // 仅搜索当前层级
                    items = items.filter((item) => item.parent_id === parentId);
                }
                // 按类型过滤
                if (targetType !== 'all') {
                    items = items.filter((item) => item.target_type === targetType);
                }
                // 搜索过滤
                if (searchKeyword) {
                    const keyword = searchKeyword.toLowerCase();
                    items = items.filter((item) => item.name?.toLowerCase().includes(keyword) ||
                        item.url?.toLowerCase().includes(keyword) ||
                        item.method?.toLowerCase().includes(keyword) ||
                        item.target_id?.toLowerCase().includes(keyword) ||
                        item.description?.toLowerCase().includes(keyword));
                }
                // 分页处理
                const filteredCount = items.length;
                let displayItems = items;
                let isLimited = false;
                if (!showAll && filteredCount > limit) {
                    displayItems = items.slice(0, limit);
                    isLimited = true;
                }
                // 构建显示文本
                const listResult_display = buildListDisplay(displayItems, totalCount, filteredCount, showStructure, searchKeyword, parentId, targetType, isLimited, limit, showPath, recursive, depth, groupByFolderFlag, allItems);
                // 构建日志信息
                const filterInfo = [];
                if (parentId !== undefined)
                    filterInfo.push(`父目录: ${parentId}`);
                if (targetType !== 'all')
                    filterInfo.push(`类型: ${targetType}`);
                if (searchKeyword)
                    filterInfo.push(`搜索: "${searchKeyword}"`);
                if (recursive)
                    filterInfo.push('递归搜索');
                if (depth !== undefined)
                    filterInfo.push(`深度限制: ${depth}`);
                const logInfo = filterInfo.length > 0 ? `\n筛选条件: ${filterInfo.join(', ')}` : '';
                const limitInfo = isLimited ? `\n显示限制: 前${limit}条` : '';

                return {
                    content: [{ type: 'text', text: listResult_display }]
                };
            case 'apipost_update':
                if (!checkSecurityPermission('write')) {
                    throw new Error(`🔒 安全模式 "${APIPOST_SECURITY_MODE}" 不允许修改操作。需要 "limited" 或 "full" 模式。`);
                }
                const targetId = args.target_id;
                const newName = args.name;
                const newMethod = args.method;
                const newUrl = args.url ? applyUrlPrefix(args.url) : undefined;
                if (!targetId) {
                    throw new Error('请提供要修改的API接口ID');
                }
                // 获取原接口信息
                const getResult = await apiClient.post('/open/apis/details', {
                    project_id: currentWorkspace.projectId,
                    target_ids: [targetId]
                });
                if (getResult.data.code !== 0) {
                    throw new Error(`获取接口详情失败: ${getResult.data.msg}`);
                }
                const originalApi = getResult.data.data.list[0]; // 获取数组中的第一个接口
                if (!originalApi) {
                    throw new Error(`未找到接口详情 (ID: ${targetId})。可能原因：1) 接口不存在 2) 无权限访问 3) 接口已被删除。请检查接口ID是否正确。`);
                }
                // 构建增量更新配置对象
                const { config: newConfig, providedFields } = buildApiConfig(args);
                const mergedDescription = providedFields.has('description')
                    ? newConfig.description
                    : (originalApi.description || '');
                const mergedRequest = {
                    auth: providedFields.has('auth') ? (newConfig.auth || { type: 'inherit' }) : (originalApi.request?.auth || { type: 'inherit' }),
                    pre_tasks: originalApi.request?.pre_tasks || [],
                    post_tasks: originalApi.request?.post_tasks || [],
                    header: {
                        parameter: providedFields.has('headers')
                            ? convertParams(newConfig.headers || [])
                            : (originalApi.request?.header?.parameter || [])
                    },
                    query: {
                        query_add_equal: originalApi.request?.query?.query_add_equal ?? 1,
                        parameter: providedFields.has('query')
                            ? convertParams(newConfig.query || [])
                            : (originalApi.request?.query?.parameter || [])
                    },
                    body: providedFields.has('body')
                        ? buildBodySection(newConfig.body || [])
                        : (originalApi.request?.body || buildBodySection([])),
                    cookie: {
                        cookie_encode: originalApi.request?.cookie?.cookie_encode ?? 1,
                        parameter: providedFields.has('cookies')
                            ? convertParams(newConfig.cookies || [])
                            : (originalApi.request?.cookie?.parameter || [])
                    },
                    restful: originalApi.request?.restful || { parameter: [] }
                };
                const responseSection = providedFields.has('responses')
                    ? normalizeResponses(newConfig.responses, {
                        fallbackExamples: [],
                        useDefaultWhenMissing: false,
                        keepEmpty: true,
                        isCheckResult: originalApi.response?.is_check_result ?? 1
                    })
                    : {
                        example: originalApi.response?.example || [],
                        is_check_result: originalApi.response?.is_check_result ?? 1
                    };
                const updateTemplate = {
                    project_id: currentWorkspace.projectId,
                    target_id: targetId,
                    parent_id: originalApi.parent_id || '0',
                    target_type: originalApi.target_type || 'api',
                    name: newName || originalApi.name,
                    method: newMethod || originalApi.method,
                    url: newUrl || originalApi.url,
                    protocol: originalApi.protocol || 'http/1.1',
                    description: mergedDescription,
                    version: (originalApi.version || 0) + 1,
                    mark_id: originalApi.mark_id || '1',
                    is_force: originalApi.is_force ?? -1,
                    sort: originalApi.sort ?? 0,
                    status: originalApi.status ?? 1,
                    is_deleted: originalApi.is_deleted ?? -1,
                    is_conflicted: originalApi.is_conflicted ?? -1,
                    request: mergedRequest,
                    response: responseSection,
                    attribute_info: originalApi.attribute_info || {},
                    tags: originalApi.tags || []
                };
                // 执行修改
                const updateResult = await apiClient.post('/open/apis/update', updateTemplate);
                if (updateResult.data.code !== 0) {
                    throw new Error(`修改失败: ${updateResult.data.msg}`);
                }
                // 统计修改的字段
                const changedFields = [];
                if (newName && newName !== originalApi.name)
                    changedFields.push('名称');
                if (newMethod && newMethod !== originalApi.method)
                    changedFields.push('方法');
                if (newUrl && newUrl !== originalApi.url)
                    changedFields.push('URL');
                // 检查是否有配置相关的更新
                if (providedFields.size > 0)
                    changedFields.push('配置');
                const changedFieldsText = changedFields.length > 0 ? `\n修改字段: ${changedFields.join(', ')}` : '\n仅更新版本';

                let updateText = `接口修改成功!\n接口ID: ${targetId}\n`;
                if (newName)
                    updateText += `新名称: ${newName}\n`;
                if (newMethod)
                    updateText += `新方法: ${newMethod}\n`;
                if (newUrl)
                    updateText += `新URL: ${newUrl}\n`;
                updateText += `版本: v${updateTemplate.version}\n修改字段: ${changedFields.join(', ') || '仅更新版本'}`;
                return {
                    content: [{ type: 'text', text: updateText }]
                };
            case 'apipost_detail':
                if (!checkSecurityPermission('read')) {
                    throw new Error(`🔒 安全模式 "${APIPOST_SECURITY_MODE}" 不允许读取操作。`);
                }
                const detailTargetId = args.target_id;
                if (!detailTargetId) {
                    throw new Error('请提供要查看的API接口ID');
                }
                // 获取接口详情
                const detailResult = await apiClient.post('/open/apis/details', {
                    project_id: currentWorkspace.projectId,
                    target_ids: [detailTargetId]
                });
                if (detailResult.data.code !== 0) {
                    throw new Error(`获取接口详情失败: ${detailResult.data.msg}`);
                }
                const apiDetail = detailResult.data.data.list[0];
                if (!apiDetail) {
                    throw new Error(`未找到接口详情 (ID: ${detailTargetId})。可能原因：1) 接口不存在 2) 无权限访问 3) 接口已被删除。请检查接口ID是否正确。`);
                }
                // 格式化接口详情
                let detailText = `📋 接口详情\n\n`;
                detailText += `🏷️  基本信息\n`;
                detailText += `   接口名称: ${apiDetail.name}\n`;
                detailText += `   请求方法: ${apiDetail.method}\n`;
                detailText += `   请求URL: ${apiDetail.url}\n`;
                detailText += `   接口ID: ${detailTargetId}\n`;
                detailText += `   版本: v${apiDetail.version || 1}\n`;
                if (apiDetail.description) {
                    detailText += `   描述: ${apiDetail.description}\n`;
                }
                detailText += `\n`;
                // Headers参数
                const headers = apiDetail.request?.header?.parameter || [];
                detailText += `📨 Headers参数 (${headers.length}个)\n`;
                if (headers.length > 0) {
                    headers.forEach((header, index) => {
                        detailText += `   ${index + 1}. ${header.key}: ${header.description || '无描述'}\n`;
                        detailText += `      类型: ${header.field_type || 'string'}, 必需: ${header.not_null ? '是' : '否'}\n`;
                        if (header.value)
                            detailText += `      示例: ${header.value}\n`;
                    });
                }
                else {
                    detailText += `   (无Headers参数)\n`;
                }
                detailText += `\n`;
                // Query参数
                const queryParams = apiDetail.request?.query?.parameter || [];
                detailText += `🔍 Query参数 (${queryParams.length}个)\n`;
                if (queryParams.length > 0) {
                    queryParams.forEach((param, index) => {
                        detailText += `   ${index + 1}. ${param.key}: ${param.description || '无描述'}\n`;
                        detailText += `      类型: ${param.field_type || 'string'}, 必需: ${param.not_null ? '是' : '否'}\n`;
                        if (param.value)
                            detailText += `      示例: ${param.value}\n`;
                    });
                }
                else {
                    detailText += `   (无Query参数)\n`;
                }
                detailText += `\n`;
                // Body参数
                const bodyParams = apiDetail.request?.body?.raw_parameter || [];
                detailText += `📝 Body参数 (${bodyParams.length}个)\n`;
                if (bodyParams.length > 0) {
                    bodyParams.forEach((param, index) => {
                        detailText += `   ${index + 1}. ${param.key}: ${param.description || '无描述'}\n`;
                        detailText += `      类型: ${param.field_type || 'string'}, 必需: ${param.not_null ? '是' : '否'}\n`;
                        if (param.value)
                            detailText += `      示例: ${param.value}\n`;
                    });
                }
                else {
                    detailText += `   (无Body参数)\n`;
                }
                detailText += `\n`;
                // Cookies参数
                const cookies = apiDetail.request?.cookie?.parameter || [];
                detailText += `🍪 Cookies参数 (${cookies.length}个)\n`;
                if (cookies.length > 0) {
                    cookies.forEach((cookie, index) => {
                        detailText += `   ${index + 1}. ${cookie.key}: ${cookie.description || '无描述'}\n`;
                        detailText += `      类型: ${cookie.field_type || 'string'}, 必需: ${cookie.not_null ? '是' : '否'}\n`;
                        if (cookie.value)
                            detailText += `      示例: ${cookie.value}\n`;
                    });
                }
                else {
                    detailText += `   (无Cookies参数)\n`;
                }
                detailText += `\n`;
                // 认证配置
                const auth = apiDetail.request?.auth || {};
                detailText += `🔐 认证配置\n`;
                if (auth.type && auth.type !== 'inherit') {
                    detailText += `   类型: ${auth.type}\n`;
                    if (auth.bearer?.key) {
                        detailText += `   Token: ${auth.bearer.key.substring(0, 20)}...\n`;
                    }
                }
                else {
                    detailText += `   (继承父级认证或无认证)\n`;
                }
                detailText += `\n`;
                // 响应示例
                const responses = apiDetail.response?.example || [];
                detailText += `📤 响应示例 (${responses.length}个)\n`;
                if (responses.length > 0) {
                    responses.forEach((resp, index) => {
                        detailText += `   ${index + 1}. ${resp.expect?.name || '响应' + (index + 1)}\n`;
                        detailText += `      状态码: ${resp.expect?.code || 200}\n`;
                        if (resp.raw) {
                            const rawData = resp.raw.length > 200 ? resp.raw.substring(0, 200) + '...' : resp.raw;
                            detailText += `      数据: ${rawData}\n`;
                        }
                    });
                }
                else {
                    detailText += `   (无响应示例)\n`;
                }

                return {
                    content: [{ type: 'text', text: detailText }]
                };
            case 'apipost_delete':
                if (!checkSecurityPermission('delete')) {
                    throw new Error(`🔒 安全模式 "${APIPOST_SECURITY_MODE}" 不允许删除操作。需要 "full" 模式。`);
                }
                const apiIds = args.api_ids;
                if (!apiIds || !Array.isArray(apiIds) || apiIds.length === 0) {
                    throw new Error('请提供要删除的API接口ID数组');
                }
                const deleteData = {
                    project_id: currentWorkspace.projectId,
                    target_ids: apiIds
                };
                const deleteResult = await apiClient.post('/open/apis/delete', deleteData);
                if (deleteResult.data.code !== 0) {
                    throw new Error(`删除失败: ${deleteResult.data.msg}`);
                }

                let deleteText = `批量删除完成!\n删除数量: ${apiIds.length} 个接口\n删除的ID:\n`;
                apiIds.forEach((id, index) => {
                    deleteText += `${index + 1}. ${id}\n`;
                });
                return {
                    content: [{ type: 'text', text: deleteText }]
                };
            default:
                throw new Error(`未知工具: ${name}`);
        }
    }
    catch (error) {
        // 增强错误信息，包含文件位置和堆栈信息
        let detailedError = '';
        if (error instanceof Error) {
            detailedError = `${error.message}`;
            // 提取堆栈信息中的关键位置
            if (error.stack) {
                const stackLines = error.stack.split('\n');
                const relevantLines = stackLines
                    .filter(line => line.includes('index.ts') || line.includes('apipost-mcp'))
                    .slice(0, 3);
                if (relevantLines.length > 0) {
                    detailedError += `\n\n📍 错误位置:\n${relevantLines.join('\n')}`;
                }
            }
        }
        else {
            detailedError = String(error);
        }
        const errorMsg = `工具 '${name}' 执行失败:\n${detailedError}`;
        logWithTime(`❌ 工具 '${name}' 执行失败: ${error instanceof Error ? error.message : String(error)}`, startTime);
        return {
            content: [{
                    type: 'text',
                    text: `❌ ${errorMsg}\n\n💡 调试提示:\n• 检查传入的参数是否正确\n• 确认接口ID是否存在\n• 验证网络连接和API权限`
                }],
            isError: true
        };
    }
});
// 启动服务器
async function main() {
    try {
        const mainStartTime = Date.now();
        console.error('='.repeat(50));
        console.error('🚀 ApiPost MCP 启动中...');
        console.error(`🔗 连接到: ${APIPOST_HOST}`);
        console.error(`🔐 Token: ${APIPOST_TOKEN?.substring(0, 8)}...`);
        // 预初始化工作空间以提高首次调用速度（在MCP连接前完成，避免日志重复）
        try {
            console.error('🔄 预初始化工作空间...');
            await initWorkspace(mainStartTime);
            console.error('✨ 工作空间预初始化完成');
        }
        catch (error) {
            console.error('⚠️ 工作空间预初始化失败，将在首次调用时重试:', error instanceof Error ? error.message : String(error));
            // 不阻止服务器启动，在工具调用时再尝试初始化
        }
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error('✅ ApiPost MCP 启动成功!');
        console.error('📊 可用工具: apipost_create_folder, apipost_smart_create, apipost_list, apipost_update, apipost_delete');
        console.error('📈 等待工具调用...');
        console.error('='.repeat(50));
    }
    catch (error) {
        console.error('❌ 启动失败:', error);
        process.exit(1);
    }
}
main();
