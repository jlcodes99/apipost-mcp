#!/usr/bin/env node

/**
 * ApiPost MCP - API文档管理工具
 * 提供简洁高效的API文档创建、查看、修改和删除功能
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
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

// API客户端
const apiClient = axios.create({
  baseURL: APIPOST_HOST,
  headers: {
    'Api-Token': APIPOST_TOKEN,
    'Content-Type': 'application/json'
  }
});

// 安全模式检查
function checkSecurityPermission(operation: 'read' | 'write' | 'delete'): boolean {
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

// 生成ID
function generateId(): string {
  return (Date.now() + Math.floor(Math.random() * 10000)).toString(16);
}

// 简洁的日志输出
function logWithTime(message: string, startTime?: number): void {
  console.error(message);
}

// 构建项目路径映射
function buildPathMap(allItems: any[]): Map<string, string[]> {
  const pathMap = new Map<string, string[]>();
  const itemMap = new Map<string, any>();
  
  // 建立ID到项目的映射
  allItems.forEach(item => {
    itemMap.set(item.target_id, item);
  });
  
  // 递归构建路径（带循环检测）
  function buildPath(targetId: string, visited: Set<string> = new Set()): string[] {
    if (pathMap.has(targetId)) {
      return pathMap.get(targetId)!;
    }
    
    // 检测循环引用
    if (visited.has(targetId)) {
      console.warn(`检测到循环引用: ${targetId}`);
      return [];
    }
    
    const item = itemMap.get(targetId);
    if (!item) return [];
    
    visited.add(targetId);
    
    const path: string[] = [];
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
function getChildrenRecursively(items: any[], parentId: string, maxDepth?: number, currentDepth: number = 0): any[] {
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
function groupByFolder(items: any[], allItems: any[]): { [key: string]: any[] } {
  const groups: { [key: string]: any[] } = {};
  const folderMap = new Map<string, any>();
  
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
function buildListDisplay(
  items: any[], 
  totalCount: number, 
  filteredCount: number, 
  showStructure: boolean, 
  searchKeyword?: string, 
  parentId?: string, 
  targetType?: string, 
  isLimited?: boolean, 
  limit?: number,
  showPath?: boolean,
  recursive?: boolean,
  depth?: number,
  groupByFolderFlag?: boolean,
  allItems?: any[]
): string {
  let listText = '';
  
  // 标题信息
  if (recursive) {
    listText += `🌲 递归搜索视图`;
    if (depth !== undefined) listText += ` (深度限制: ${depth})`;
    listText += `\n`;
  } else if (parentId !== undefined) {
    listText += `📁 目录层级视图 (父目录ID: ${parentId})\n`;
  } else {
    listText += `📋 项目完整列表\n`;
  }
  
  listText += `总计: ${totalCount}项, 当前显示: ${items.length}项\n\n`;
  
  // 筛选信息
  const filterInfo = [];
  if (searchKeyword) filterInfo.push(`搜索: "${searchKeyword}"`);
  if (parentId !== undefined) filterInfo.push(`父目录: ${parentId === '0' ? '根目录' : parentId}`);
  if (targetType && targetType !== 'all') filterInfo.push(`类型: ${targetType}`);
  if (recursive) filterInfo.push(`递归搜索: 是`);
  if (depth !== undefined) filterInfo.push(`深度限制: ${depth}`);
  
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
  let pathMap: Map<string, string[]> | undefined;
  if (showPath && allItems) {
    pathMap = buildPathMap(allItems);
  }
  
  if (groupByFolderFlag && allItems) {
    // 按目录分组显示
    listText += buildGroupedList(items, allItems, pathMap);
  } else if (showStructure) {
    // 树形结构显示
    listText += buildTreeStructure(items, pathMap);
  } else {
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
function buildTreeStructure(items: any[], pathMap?: Map<string, string[]>): string {
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
        const path = pathMap.get(folder.target_id)!;
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
      if (api.method) result += ` [${api.method}]`;
      result += '\n';
      result += `    🌐 URL: ${api.url || '未设置'}\n`;
      result += `    📋 ID: ${api.target_id}\n`;
      
      // 显示完整路径
      if (pathMap && pathMap.has(api.target_id)) {
        const path = pathMap.get(api.target_id)!;
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
function buildFlatList(items: any[], pathMap?: Map<string, string[]>): string {
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
        const path = pathMap.get(item.target_id)!;
        result += `     路径: ${path.join(' / ')}\n`;
      }
      
      if (item.description) {
        result += `     描述: ${item.description}\n`;
      }
    } else {
      // 接口项
      result += `${num}. 🔗 ${item.name}`;
      if (item.method) result += ` [${item.method}]`;
      result += '\n';
      result += `     类型: 接口\n`;
      result += `     URL: ${item.url || '未设置'}\n`;
      result += `     ID: ${item.target_id}\n`;
      result += `     父目录: ${item.parent_id === '0' ? '根目录' : item.parent_id}\n`;
      
      // 显示完整路径
      if (pathMap && pathMap.has(item.target_id)) {
        const path = pathMap.get(item.target_id)!;
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
function buildGroupedList(items: any[], allItems: any[], pathMap?: Map<string, string[]>): string {
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
        } else {
          result += `       📋 ID: ${item.target_id}\n`;
        }
      } else {
        result += `${itemPrefix}🔗 ${item.name}`;
        if (item.method) result += ` [${item.method}]`;
        result += '\n';
        if (!isLastGroup || !isLastItem) {
          result += `${isLastGroup ? '       ' : '│      '}📋 ID: ${item.target_id}\n`;
          result += `${isLastGroup ? '       ' : '│      '}🌐 URL: ${item.url || '未设置'}\n`;
        } else {
          result += `       📋 ID: ${item.target_id}\n`;
          result += `       🌐 URL: ${item.url || '未设置'}\n`;
        }
      }
      
      // 显示完整路径
      if (pathMap && pathMap.has(item.target_id)) {
        const path = pathMap.get(item.target_id)!;
        if (!isLastGroup || !isLastItem) {
          result += `${isLastGroup ? '       ' : '│      '}📍 路径: ${path.join(' / ')}\n`;
        } else {
          result += `       📍 路径: ${path.join(' / ')}\n`;
        }
      }
    });
    
    result += '\n';
  });
  
  return result;
}

// 解析API配置
function parseApiConfig(configJson?: string): any {
  if (!configJson) return {};
  try {
    return JSON.parse(configJson);
  } catch (error) {
    console.error('解析API配置失败:', error);
    return {};
  }
}

// 解析单个配置参数
function parseConfigParam(paramJson?: string): any[] {
  if (!paramJson) return [];
  try {
    const parsed = JSON.parse(paramJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('解析配置参数失败:', error);
    return [];
  }
}

// 构建配置对象，同时记录哪些字段被明确提供了
function buildApiConfig(args: any): { config: any; providedFields: Set<string> } {
  const config: any = {};
  const providedFields = new Set<string>();
  
  if (args.description !== undefined) {
    config.description = args.description;
    providedFields.add('description');
  }
  if (args.headers !== undefined) {
    config.headers = parseConfigParam(args.headers);
    providedFields.add('headers');
  }
  if (args.query !== undefined) {
    config.query = parseConfigParam(args.query);
    providedFields.add('query');
  }
  if (args.body !== undefined) {
    config.body = parseConfigParam(args.body);
    providedFields.add('body');
  }
  if (args.cookies !== undefined) {
    config.cookies = parseConfigParam(args.cookies);
    providedFields.add('cookies');
  }
  if (args.auth !== undefined) {
    config.auth = parseApiConfig(args.auth);
    providedFields.add('auth');
  }
  if (args.responses !== undefined) {
    config.responses = parseConfigParam(args.responses);
    providedFields.add('responses');
  }

  return { config, providedFields };
}

// 生成API模板
function generateApiTemplate(method: string, url: string, name: string, config: any = {}): any {
  
  // 如果有复杂配置，显示解析进度（移除重复输出）
  // 此处不再输出，由调用方统一管理
  
  // 转换参数格式
  const convertParams = (paramsList: any[]) => {
    if (!paramsList || !Array.isArray(paramsList)) return [];
    return paramsList.map(param => ({
      param_id: generateId(),
      description: param.desc || param.description || '',
      field_type: param.type || 'string',
      is_checked: param.required ? 1 : 0,
      key: param.key,
      not_null: param.required ? 1 : 0,
      value: param.example || param.value || '',
      schema: { type: param.type || 'string' }
    }));
  };

  // 生成请求体
  const generateRequestBody = () => {
    const bodyParams = config.body || [];
    if (!Array.isArray(bodyParams) || bodyParams.length === 0) return {};
    
    const body: any = {};
    bodyParams.forEach(param => {
      try {
        if (param.type === 'integer') {
          body[param.key] = parseInt(param.example);
        } else if (param.type === 'number') {
          body[param.key] = parseFloat(param.example);
    } else {
          body[param.key] = param.example;
        }
      } catch {
        body[param.key] = param.example;
      }
    });
    return body;
  };

  // 生成响应数据
  const generateResponseData = (responseConfig: any) => {
    if (!responseConfig) return { code: 0, message: '操作成功', data: {} };
    if (typeof responseConfig === 'string') {
      try {
        return JSON.parse(responseConfig);
      } catch {
        return { code: 0, message: '操作成功', data: responseConfig };
      }
    }
    return responseConfig;
  };

  
  return {
    target_id: generateId(),
    target_type: 'api',
    parent_id: '0',
    name,
    method,
    url,
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
      body: {
        mode: config.body && config.body.length > 0 ? 'json' : 'none',
        parameter: [],
        raw: config.body && config.body.length > 0 ? JSON.stringify(generateRequestBody(), null, 4) : '',
        raw_parameter: convertParams(config.body || []),
        raw_schema: { type: 'object' },
        binary: null
      },
      cookie: {
        cookie_encode: 1,
        parameter: convertParams(config.cookies || [])
      },
      restful: {
        parameter: convertParams(config.restful || [])
      }
    },
    response: {
      example: (config.responses || [{ success: true }]).map((resp: any, index: number) => ({
        example_id: String(index + 1),
        raw: JSON.stringify(generateResponseData(resp.data), null, 4),
        raw_parameter: convertParams(resp.fields || []),
        headers: [],
        expect: {
          code: String(resp.status || 200),
          content_type: 'application/json',
          is_default: index === 0 ? 1 : -1,
          mock: JSON.stringify(generateResponseData(resp.data)),
          name: resp.name || (index === 0 ? '成功响应' : '错误响应'),
          schema: { type: 'object', properties: {} },
          verify_type: 'schema',
          sleep: 0
        }
      })),
      is_check_result: 1
    },
    attribute_info: config.attribute_info || {},
    tags: config.tags || []
  };
}

// 工作空间信息
let currentWorkspace: { teamId: string; projectId: string } | null = null;

// 初始化工作空间
async function initWorkspace(startTime: number) {
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
      const targetTeam = teamsResult.data.data.find((team: any) => 
        team.name === APIPOST_DEFAULT_TEAM_NAME
      );
      if (targetTeam) {
        selectedTeam = targetTeam;
        logWithTime(`🎯 使用指定团队: ${APIPOST_DEFAULT_TEAM_NAME}`, startTime);
      } else {
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
      const targetProject = projectsResult.data.data.find((project: any) => 
        project.name === APIPOST_DEFAULT_PROJECT_NAME
      );
      if (targetProject) {
        selectedProject = targetProject;
        logWithTime(`🎯 使用指定项目: ${APIPOST_DEFAULT_PROJECT_NAME}`, startTime);
      } else {
        logWithTime(`⚠️ 未找到指定项目 "${APIPOST_DEFAULT_PROJECT_NAME}"，使用默认项目`, startTime);
      }
    }
    
    logWithTime(`
✅ 选中项目
项目名称: ${selectedProject.name}
项目ID: ${selectedProject.project_id}`, startTime);
    
    currentWorkspace = {
      teamId: selectedTeam.team_id,
      projectId: selectedProject.project_id
    };
    
    logWithTime(`✨ 工作空间初始化完成 (安全模式: ${APIPOST_SECURITY_MODE})`, startTime);
  } catch (error) {
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
      name: 'apipost_smart_create',
      description: 'API接口文档生成器。支持通过分离参数创建完整的API文档，包括请求参数、响应格式、认证方式等。',
      inputSchema: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP方法' },
          url: { type: 'string', description: '接口URL路径' },
          name: { type: 'string', description: '接口名称' },
          description: { type: 'string', description: '接口详细描述（可选）' },
          headers: { type: 'string', description: 'Headers参数JSON数组字符串（可选）。格式：[{"key":"Content-Type","desc":"内容类型","type":"string","required":true,"example":"application/json"}]' },
          query: { type: 'string', description: 'Query参数JSON数组字符串（可选）。格式：[{"key":"page","desc":"页码","type":"integer","required":false,"example":"1"}]' },
          body: { type: 'string', description: 'Body参数JSON数组字符串（可选）。格式：[{"key":"name","desc":"用户名","type":"string","required":true,"example":"张三"}]' },
          cookies: { type: 'string', description: 'Cookies参数JSON数组字符串（可选）。格式：[{"key":"session_id","desc":"会话ID","type":"string","required":false,"example":"abc123"}]' },
          auth: { type: 'string', description: '认证配置JSON字符串（可选）。格式：{"type":"bearer","bearer":{"key":"your_token"}}' },
          responses: { type: 'string', description: '响应示例JSON数组字符串（可选）。格式：[{"name":"成功响应","status":200,"data":{"code":0},"fields":[{"key":"code","desc":"状态码","type":"integer","example":"0"}]}]' }
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
      description: '修改API接口文档，支持增量更新和字段删除。更新规则：不提供的字段保持不变，提供空值的字段会被删除，提供新值的字段会被替换。',
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
    logWithTime(`🚀 开始执行工具: ${name}`);
    
    if (!currentWorkspace) {
      logWithTime('🔄 初始化工作空间...', startTime);
      await initWorkspace(startTime);
    }
    
    switch (name) {
      case 'apipost_smart_create':
        if (!checkSecurityPermission('write')) {
          throw new Error(`🔒 安全模式 "${APIPOST_SECURITY_MODE}" 不允许创建操作。需要 "limited" 或 "full" 模式。`);
        }
        // 构建配置对象
          const { config } = buildApiConfig(args);
          
          const template = generateApiTemplate(
            args.method as string,
            args.url as string,
            args.name as string,
            config
          );
          template.project_id = currentWorkspace!.projectId;
          const headerCount = config.headers?.length || 0;
          const queryCount = config.query?.length || 0;
          const bodyCount = config.body?.length || 0;
          const responseCount = config.responses?.length || 0;
          
          const createResult = await apiClient.post('/open/apis/create', template);
          
          if (createResult.data.code !== 0) {
            throw new Error(`创建失败: ${createResult.data.msg}`);
          }
          
          logWithTime(`
✅ API创建成功!
目标ID: ${createResult.data.data.target_id}
接口名称: ${args.name}
请求方法: ${args.method}
接口地址: ${args.url}
字段统计: Headers(${headerCount}) Query(${queryCount}) Body(${bodyCount}) 响应(${responseCount})`);
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
        
        const searchKeyword = args.search as string;
        const parentId = args.parent_id as string;
        const targetType = (args.target_type as string) || 'all';
        const showStructure = args.show_structure as boolean;
        const showPath = args.show_path as boolean;
        const recursive = args.recursive as boolean;
        const depth = args.depth as number;
        const groupByFolderFlag = args.group_by_folder as boolean;
        const limit = Math.min((args.limit as number) || 50, 200);
        const showAll = args.show_all as boolean;
        
        const listResult = await apiClient.get('/open/apis/list', {
          params: { project_id: currentWorkspace!.projectId }
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
        } else if (parentId !== undefined) {
          // 仅搜索当前层级
          items = items.filter((item: any) => item.parent_id === parentId);
        }
        
        // 按类型过滤
        if (targetType !== 'all') {
          items = items.filter((item: any) => item.target_type === targetType);
        }
        
        // 搜索过滤
        if (searchKeyword) {
          const keyword = searchKeyword.toLowerCase();
          items = items.filter((item: any) => 
            item.name?.toLowerCase().includes(keyword) ||
            item.url?.toLowerCase().includes(keyword) ||
            item.method?.toLowerCase().includes(keyword) ||
            item.target_id?.toLowerCase().includes(keyword) ||
            item.description?.toLowerCase().includes(keyword)
          );
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
        const listResult_display = buildListDisplay(
          displayItems, 
          totalCount, 
          filteredCount, 
          showStructure, 
          searchKeyword, 
          parentId, 
          targetType, 
          isLimited, 
          limit,
          showPath,
          recursive,
          depth,
          groupByFolderFlag,
          allItems
        );
        
        // 构建日志信息
        const filterInfo = [];
        if (parentId !== undefined) filterInfo.push(`父目录: ${parentId}`);
        if (targetType !== 'all') filterInfo.push(`类型: ${targetType}`);
        if (searchKeyword) filterInfo.push(`搜索: "${searchKeyword}"`);
        if (recursive) filterInfo.push('递归搜索');
        if (depth !== undefined) filterInfo.push(`深度限制: ${depth}`);
        
        const logInfo = filterInfo.length > 0 ? `\n筛选条件: ${filterInfo.join(', ')}` : '';
        const limitInfo = isLimited ? `\n显示限制: 前${limit}条` : '';
        
        logWithTime(`✅ 接口列表获取成功!
总数: ${totalCount}个, 筛选后: ${filteredCount}个${logInfo}${limitInfo}`);
        
        return {
          content: [{ type: 'text', text: listResult_display }]
        };

      case 'apipost_update':
        if (!checkSecurityPermission('write')) {
          throw new Error(`🔒 安全模式 "${APIPOST_SECURITY_MODE}" 不允许修改操作。需要 "limited" 或 "full" 模式。`);
        }
        const targetId = args.target_id as string;
        const newName = args.name as string;
        const newMethod = args.method as string;
        const newUrl = args.url as string;
        
        if (!targetId) {
          throw new Error('请提供要修改的API接口ID');
        }

        // 获取原接口信息
        const getResult = await apiClient.post('/open/apis/details', {
          project_id: currentWorkspace!.projectId,
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
        
        // 从原接口提取现有配置（如果存在的话）
        const originalConfig = {
          description: originalApi.description || '',
          headers: originalApi.request?.header?.parameter || [],
          query: originalApi.request?.query?.parameter || [],
          body: originalApi.request?.body?.raw_parameter || [],
          cookies: originalApi.request?.cookie?.parameter || [],
          auth: originalApi.request?.auth || { type: 'inherit' },
          responses: originalApi.response?.example || []
        };
        
        // 合并配置：明确提供的字段使用新值（包括空值），未提供的字段保持原值
        const mergedConfig = {
          description: providedFields.has('description') ? newConfig.description : originalConfig.description,
          headers: providedFields.has('headers') ? newConfig.headers : originalConfig.headers,
          query: providedFields.has('query') ? newConfig.query : originalConfig.query,
          body: providedFields.has('body') ? newConfig.body : originalConfig.body,
          cookies: providedFields.has('cookies') ? newConfig.cookies : originalConfig.cookies,
          auth: providedFields.has('auth') ? newConfig.auth : originalConfig.auth,
          responses: providedFields.has('responses') ? newConfig.responses : originalConfig.responses
        };
        
        // 生成更新模板
        const updateTemplate = generateApiTemplate(
          newMethod || originalApi.method,
          newUrl || originalApi.url,
          newName || originalApi.name,
          mergedConfig
        );
        
        // 保持原有属性
        updateTemplate.target_id = targetId;
        updateTemplate.project_id = currentWorkspace!.projectId;
        updateTemplate.parent_id = originalApi.parent_id || '0';
        updateTemplate.version = (originalApi.version || 0) + 1;
        
        // 执行修改
        const updateResult = await apiClient.post('/open/apis/update', updateTemplate);
        
        if (updateResult.data.code !== 0) {
          throw new Error(`修改失败: ${updateResult.data.msg}`);
        }

        // 统计修改的字段
        const changedFields = [];
        if (newName && newName !== originalApi.name) changedFields.push('名称');
        if (newMethod && newMethod !== originalApi.method) changedFields.push('方法');
        if (newUrl && newUrl !== originalApi.url) changedFields.push('URL');
        
        // 检查是否有配置相关的更新
        if (providedFields.size > 0) changedFields.push('配置');
        
        const changedFieldsText = changedFields.length > 0 ? `\n修改字段: ${changedFields.join(', ')}` : '\n仅更新版本';
        logWithTime(`
✅ 接口修改成功!
目标ID: ${targetId}
接口名称: ${newName || originalApi.name}
请求方法: ${newMethod || originalApi.method}
接口地址: ${newUrl || originalApi.url}
版本: v${updateTemplate.version}${changedFieldsText}`);
        
        let updateText = `接口修改成功!\n接口ID: ${targetId}\n`;
        if (newName) updateText += `新名称: ${newName}\n`;
        if (newMethod) updateText += `新方法: ${newMethod}\n`;
        if (newUrl) updateText += `新URL: ${newUrl}\n`;
        updateText += `版本: v${updateTemplate.version}\n修改字段: ${changedFields.join(', ') || '仅更新版本'}`;

        return {
          content: [{ type: 'text', text: updateText }]
        };

      case 'apipost_detail':
        if (!checkSecurityPermission('read')) {
          throw new Error(`🔒 安全模式 "${APIPOST_SECURITY_MODE}" 不允许读取操作。`);
        }
        const detailTargetId = args.target_id as string;
        
        if (!detailTargetId) {
          throw new Error('请提供要查看的API接口ID');
        }

        // 获取接口详情
        const detailResult = await apiClient.post('/open/apis/details', {
          project_id: currentWorkspace!.projectId,
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
          headers.forEach((header: any, index: number) => {
            detailText += `   ${index + 1}. ${header.key}: ${header.description || '无描述'}\n`;
            detailText += `      类型: ${header.field_type || 'string'}, 必需: ${header.not_null ? '是' : '否'}\n`;
            if (header.value) detailText += `      示例: ${header.value}\n`;
          });
        } else {
          detailText += `   (无Headers参数)\n`;
        }
        detailText += `\n`;

        // Query参数
        const queryParams = apiDetail.request?.query?.parameter || [];
        detailText += `🔍 Query参数 (${queryParams.length}个)\n`;
        if (queryParams.length > 0) {
          queryParams.forEach((param: any, index: number) => {
            detailText += `   ${index + 1}. ${param.key}: ${param.description || '无描述'}\n`;
            detailText += `      类型: ${param.field_type || 'string'}, 必需: ${param.not_null ? '是' : '否'}\n`;
            if (param.value) detailText += `      示例: ${param.value}\n`;
          });
        } else {
          detailText += `   (无Query参数)\n`;
        }
        detailText += `\n`;

        // Body参数
        const bodyParams = apiDetail.request?.body?.raw_parameter || [];
        detailText += `📝 Body参数 (${bodyParams.length}个)\n`;
        if (bodyParams.length > 0) {
          bodyParams.forEach((param: any, index: number) => {
            detailText += `   ${index + 1}. ${param.key}: ${param.description || '无描述'}\n`;
            detailText += `      类型: ${param.field_type || 'string'}, 必需: ${param.not_null ? '是' : '否'}\n`;
            if (param.value) detailText += `      示例: ${param.value}\n`;
          });
        } else {
          detailText += `   (无Body参数)\n`;
        }
        detailText += `\n`;

        // Cookies参数
        const cookies = apiDetail.request?.cookie?.parameter || [];
        detailText += `🍪 Cookies参数 (${cookies.length}个)\n`;
        if (cookies.length > 0) {
          cookies.forEach((cookie: any, index: number) => {
            detailText += `   ${index + 1}. ${cookie.key}: ${cookie.description || '无描述'}\n`;
            detailText += `      类型: ${cookie.field_type || 'string'}, 必需: ${cookie.not_null ? '是' : '否'}\n`;
            if (cookie.value) detailText += `      示例: ${cookie.value}\n`;
          });
        } else {
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
        } else {
          detailText += `   (继承父级认证或无认证)\n`;
        }
        detailText += `\n`;

        // 响应示例
        const responses = apiDetail.response?.example || [];
        detailText += `📤 响应示例 (${responses.length}个)\n`;
        if (responses.length > 0) {
          responses.forEach((resp: any, index: number) => {
            detailText += `   ${index + 1}. ${resp.expect?.name || '响应' + (index + 1)}\n`;
            detailText += `      状态码: ${resp.expect?.code || 200}\n`;
            if (resp.raw) {
              const rawData = resp.raw.length > 200 ? resp.raw.substring(0, 200) + '...' : resp.raw;
              detailText += `      数据: ${rawData}\n`;
            }
          });
        } else {
          detailText += `   (无响应示例)\n`;
        }

        logWithTime(`✅ 接口详情获取成功! 接口ID: ${detailTargetId}`);
        
        return {
          content: [{ type: 'text', text: detailText }]
        };

      case 'apipost_delete':
        if (!checkSecurityPermission('delete')) {
          throw new Error(`🔒 安全模式 "${APIPOST_SECURITY_MODE}" 不允许删除操作。需要 "full" 模式。`);
        }
        const apiIds = args.api_ids as string[];
        
        if (!apiIds || !Array.isArray(apiIds) || apiIds.length === 0) {
          throw new Error('请提供要删除的API接口ID数组');
        }

                const deleteData = {
          project_id: currentWorkspace!.projectId,
          target_ids: apiIds
        };

        const deleteResult = await apiClient.post('/open/apis/delete', deleteData);
        
        if (deleteResult.data.code !== 0) {
          throw new Error(`删除失败: ${deleteResult.data.msg}`);
        }

        logWithTime(`
✅ 批量删除完成!
删除数量: ${apiIds.length}个接口
删除的接口ID:
${apiIds.map((id, index) => `${index + 1}. ${id}`).join('\n')}`);
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
  } catch (error) {
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
    } else {
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
    } catch (error) {
      console.error('⚠️ 工作空间预初始化失败，将在首次调用时重试:', error instanceof Error ? error.message : String(error));
      // 不阻止服务器启动，在工具调用时再尝试初始化
    }
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
    
    console.error('✅ ApiPost MCP 启动成功!');
    console.error('📊 可用工具: apipost_smart_create, apipost_list, apipost_update, apipost_delete');
    
    console.error('📈 等待工具调用...');
    console.error('='.repeat(50));
  } catch (error) {
    console.error('❌ 启动失败:', error);
  process.exit(1);
  }
}

main();