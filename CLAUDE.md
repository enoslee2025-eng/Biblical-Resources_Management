# bible dictionary 开发规范

本文档是 Claude 开发此项目时必须遵循的规范。

---

## 🚨 最重要的规则（Claude 必读）

**⚠️ 用户可能完全不懂代码，Claude 必须用简单易懂的方式交流！**

### 1. 绝对不能展示技术细节

| ❌ 禁止展示 | ✅ 应该展示 |
|------------|-----------|
| 数据库表结构 | 页面长什么样 |
| API 接口列表 | 用户能做什么操作 |
| 路由配置 | 点击按钮后会发生什么 |
| 代码文件路径 | 操作流程（第1步→第2步→...） |

**示例**：
- ❌ 错误：「创建 todo 表，字段有 id, title, completed...」
- ✅ 正确：「你会看到一个待办列表，可以添加、完成、删除待办事项」

### 2. 功能开发两步走

```
第一步：用户视角描述功能 → 🛑 停止等用户确认
第二步：生成代码 → 告诉用户如何启动看效果 → 🛑 停止等用户反馈
```

**绝对不能跳过确认直接写代码！**

### 3. 代码生成后必须告诉用户如何看效果

```
✅ 代码已生成！查看效果请：
1. 点击「🐳 启动基础服务」
2. 点击「🚀 启动 API」
3. 点击「📱 启动 APP」

🛑 启动后告诉我效果如何。
```

### 4. 每次回复后立即保存对话记录（极重要！）

**⚠️ 必须使用 Write 工具实际保存文件，不能只说"已保存"！**

- 保存到 `docs/ai-chat/` 目录
- 格式：`{YYYY-MM-DD HH:mm}-{x} 对话.md`
- 每次回复后都要用 Write 工具更新这个文件

---

## 项目类型

**当前项目类型: `web`**

| 项目类型 | 前端目录 | 前端技术栈 |
|---------|---------|-----------|
| `app` | `application/` | Flutter + Material 3 + GetX |
| `web` | `website/` | Vue 3 + Vant 4 + Vue Router + Pinia |

> ⚠️ Claude 必须根据上面的项目类型使用对应的技术栈，不要询问用户。

---

## 项目概述

- **项目名称**: bible dictionary (开发一个网页平台，供主内圣经应用用户：制作资源、编辑资源导出资源、扫码授导入)
- **后端技术栈**: Quarkus 3.x + MySQL 8.0 + Caffeine 缓存
- **前端技术栈**: 见上方「项目类型」表格
- **后台管理技术栈**:
  - Server: Quarkus 3.x + MySQL 8.0
  - Client: Vue 3 + Vite + Tailwind CSS + Element Plus + Vue Router + Pinia + Axios
- **开发环境**: Docker Compose (MySQL) + 本地 Quarkus
- **生产环境**: K3s (Quarkus) + 独立 MySQL

---

## 开发流程

### 🚨 功能开发强制流程（Claude 必须严格遵守）

**⚠️ 重要：收到功能需求后，Claude 必须严格按以下流程执行，不得跳过任何步骤！**

**⚠️ 记住：用户可能不懂代码，所有说明必须用用户视角描述！**

---

#### 第一步：用用户视角描述功能（🛑 输出后必须停止，等待确认）

先描述用户将看到什么、能做什么，**绝对不能写任何代码**，**不要展示数据库表、API 接口等技术细节**：

```markdown
## 功能说明：{功能名称}

### 📱 APP/网页 上你会看到

**页面 1：{页面名称}**
- 页面样子：{简单描述页面长什么样}
- 你可以做：
  - {操作 1}
  - {操作 2}
  - ...

**页面 2：{页面名称}**
- 页面样子：...
- 你可以做：...

### 🔄 操作流程
1. {第一步做什么} → {看到什么结果}
2. {第二步做什么} → {看到什么结果}
3. ...

### 🖥️ 后台管理（管理员使用）
- {管理员可以做什么}

---
🛑 **这样的功能设计可以吗？确认后我开始生成代码。**
```

**🚨 Claude 必须在这里停止，等待用户回复！不能自动继续！**

---

#### 第二步：等待用户确认（🛑 必须等待，不能自动继续）

用户可以：
- 直接确认 → 开始生成代码
- 修改设计 → 调整后再确认
- 只要部分 → 指定只生成某些部分

#### 第三步：生成代码并告诉用户如何看效果

用户确认后，Claude 生成所有必要的代码，然后**告诉用户如何启动查看效果**：

```markdown
✅ 代码已生成完毕！

### 📱 查看 APP/网页效果
1. 点击 VSCode 左侧「运行和调试」面板
2. 点击「🐳 启动基础服务」等待完成（会自动创建数据库和表）
3. 点击「🚀 启动 API」等待看到 "Listening on: http://0.0.0.0:8080"
4. 点击「📱 启动 APP」（或「🌐 启动网页」）

### 🖥️ 查看后台管理效果
1. 点击「🔧 启动后台 API」
2. 点击「🖥️ 启动后台管理」
3. 打开浏览器访问 http://localhost:5173

---
🛑 **启动后看看效果，告诉我哪里需要修改。**
```

**🚨 生成代码后必须停止，等待用户反馈效果！**

---

#### 示例对话

```
用户: 帮我做一个待办事项功能

Claude: 好的，我先说明这个功能你会看到什么：

## 功能说明：待办事项

### 📱 APP 上你会看到

**待办列表页面**
- 页面样子：一个列表显示所有待办事项，每条显示标题和完成状态
- 你可以做：
  - 点击右下角「+」按钮添加新待办
  - 点击待办条目标记为已完成/未完成
  - 左滑或长按删除待办

### 🔄 操作流程
1. 打开 APP → 看到待办列表（开始是空的）
2. 点击「+」→ 弹出输入框 → 输入标题 → 点确定 → 列表出现新待办
3. 点击待办 → 变成已完成状态（显示划线）
4. 左滑待办 → 出现删除按钮 → 点击删除

### 🖥️ 后台管理（管理员使用）
- 查看所有用户的待办事项
- 删除不当内容

---
🛑 **这样的功能设计可以吗？确认后我开始生成代码。**

[Claude 使用 Write 工具保存到 docs/ai-chat/2024-01-15 09:30-1 对话.md]

用户: 确认

Claude: 好的，我开始生成代码...

（生成所有代码后）

Claude:
✅ 代码已生成完毕！

### 📱 查看 APP 效果
1. 点击 VSCode 左侧「运行和调试」面板
2. 点击「🐳 启动基础服务」等待完成
3. 点击「🚀 启动 API」等待看到 "Listening on: http://0.0.0.0:8080"
4. 点击「📱 启动 APP」

---
🛑 **启动后看看效果，告诉我哪里需要修改。**

[Claude 使用 Write 工具追加内容到 docs/ai-chat/2024-01-15 09:30-1 对话.md]

用户: 页面太丑了，能好看点吗

Claude: 好的，我来美化页面...

[Claude 使用 Write 工具追加内容到 docs/ai-chat/2024-01-15 09:30-1 对话.md]
```

---

## 目录结构

### APP 项目目录结构

```
bible dictionary-workspace/
├── server/                     # Quarkus 后端
│   ├── src/main/java/org/wxs/bible dictionary/
│   │   ├── common/            # 公共模块
│   │   │   ├── auth/          # 认证（Token + Caffeine）
│   │   │   ├── exception/     # 异常处理
│   │   │   └── response/      # 统一响应
│   │   └── {module}/          # 业务模块
│   │       ├── entity/        # 实体类
│   │       ├── dto/           # 数据传输对象
│   │       ├── service/       # 业务逻辑
│   │       └── resource/      # REST 接口
│   ├── src/main/resources/
│   │   └── application.properties  # 默认配置（打包进 jar）
│   └── config/                # 外部配置（运行时覆盖，不打包）
│       └── application.properties
│
├── application/                # Flutter 前端（移动端/桌面端）
│   └── lib/
│       ├── app/               # 应用配置、路由
│       ├── core/              # 核心模块
│       │   ├── api/           # API 客户端
│       │   ├── config/        # 配置文件（API 地址等）
│       │   └── storage/       # 本地存储
│       ├── widgets/           # 通用组件
│       └── modules/           # 业务模块
│           └── {module}/
│               ├── bindings/  # 依赖绑定
│               ├── controllers/ # 控制器
│               └── views/     # 视图
│
├── console/                    # 后台管理系统
│   ├── server/                # 后台管理后端
│   │   ├── src/main/java/org/wxs/bible dictionary/console/
│   │   │   ├── common/        # 公共模块
│   │   │   └── {module}/      # 业务模块
│   │   ├── src/main/resources/
│   │   │   └── application.properties  # 默认配置
│   │   └── config/            # 外部配置（运行时覆盖）
│   │       └── application.properties
│   │
│   └── client/                # 后台管理前端（Vue）
│       ├── src/
│       │   ├── api/           # API 接口封装
│       │   ├── assets/        # 静态资源
│       │   ├── components/    # 通用组件
│       │   ├── layouts/       # 布局组件
│       │   ├── router/        # 路由配置
│       │   ├── stores/        # Pinia 状态管理
│       │   ├── styles/        # 全局样式
│       │   ├── utils/         # 工具函数
│       │   └── views/         # 页面视图
│       │       └── {module}/  # 业务模块页面
│       ├── index.html
│       ├── vite.config.js
│       ├── tailwind.config.js
│       └── package.json
│
├── database/                   # 数据库脚本
│   ├── init-db.sql            # 初始化脚本（首次部署）
│   └── migrations/            # 增量更新脚本
│       ├── V001__create_user_table.sql
│       └── ...
│
├── docker/                     # Docker 配置（仅开发环境）
│   └── docker-compose.yml     # MySQL 容器配置
│
├── deploy/                     # 部署配置（生产环境）
│   └── k3s/                   # K3s 部署文件
│
├── docs/
│   ├── api/                   # API 文档（每个接口一个 JSON）
│   └── ai-chat/               # AI 对话摘要记录
│
├── scripts/                    # 启动/停止脚本
│
└── .vscode/                    # VSCode 配置
    └── launch.json            # 运行与调试配置
```

### 网页项目目录结构

网页项目将 `application/` 替换为 `website/`：

```
bible dictionary-workspace/
├── server/                     # Quarkus 后端（同上）
│
├── website/                    # Vue + Vant 前端（移动端网页）
│   ├── src/
│   │   ├── api/               # API 接口封装
│   │   ├── assets/            # 静态资源
│   │   ├── components/        # 通用组件
│   │   ├── router/            # 路由配置
│   │   ├── stores/            # Pinia 状态管理
│   │   ├── styles/            # 全局样式
│   │   ├── utils/             # 工具函数
│   │   └── views/             # 页面视图
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── console/                    # 后台管理系统（同上）
├── database/                   # 数据库脚本（同上）
├── docker/                     # Docker 配置（同上）
└── ...
```

---

## 运行与调试（VSCode）

### 前置条件

1. 安装 JDK 21+
2. 安装 Docker Desktop
3. 安装 Flutter SDK（APP 项目需要）
4. 安装 Node.js 20+
5. VSCode 安装以下扩展：
   - Extension Pack for Java
   - Flutter（APP 项目需要）
   - Docker
   - Vue - Official

### 使用 VSCode 运行和调试面板

打开 VSCode 的「运行和调试」面板（侧边栏图标或 `Cmd+Shift+D`），可看到以下配置：

| 配置名称 | 说明 |
|---------|------|
| 🐳 启动基础服务 | 启动 MySQL 容器并配置权限 |
| ⏹️ 关闭基础服务 | 停止 MySQL 容器 |
| 🚀 启动 API | 运行单元测试后启动主后端 Quarkus (server) |
| 📱 启动 APP | 启动 Flutter 前端应用（APP 项目） |
| 🌐 启动网页 | 启动 Vue + Vant 前端（网页项目） |
| 🔧 启动后台 API | 启动后台管理后端 (console/server) |
| 🖥️ 启动后台管理 | 启动后台管理前端 Vue (console/client) |
| 📦 交付 API | 打包 API 到 dist/server/ |
| 📦 交付网页 | 打包网页到 dist/website/（网页项目） |
| 📦 交付后台管理 | 打包后台 API 和前端到 dist/console/ |

**推荐启动顺序**：
1. 点击「🐳 启动基础服务」启动 MySQL
2. 点击「🚀 启动 API」等待后端启动完成（看到 "Listening on: http://0.0.0.0:8080"）
3. 根据需要启动前端：
   - APP 项目：点击「📱 启动 APP」
   - 网页项目：点击「🌐 启动网页」
   - 后台管理：点击「🔧 启动后台 API」+「🖥️ 启动后台管理」

---

## 代码注释规范

### ⚠️ 必须使用中文注释

所有代码必须添加中文注释，包括：

1. **类注释**: 说明类的用途
2. **方法注释**: 说明方法的功能、参数、返回值
3. **关键逻辑注释**: 复杂业务逻辑需要注释说明
4. **字段注释**: 实体类和 DTO 的字段需要注释

### 后端 Java 注释示例

```java
/**
 * 用户服务类
 * 处理用户注册、登录、信息管理等业务逻辑
 */
@ApplicationScoped
public class UserService {

    /**
     * 用户注册
     * @param request 注册请求，包含用户名和密码
     * @return 注册成功的用户信息
     * @throws BusinessException 用户名已存在时抛出异常
     */
    @Transactional
    public UserDTO register(RegisterRequest request) {
        // 检查用户名是否已存在
        if (User.findByUsername(request.getUsername()) != null) {
            throw new BusinessException(400, "用户名已存在");
        }

        // 创建新用户
        User user = new User();
        user.setUsername(request.getUsername());
        // 密码加密存储
        user.setPassword(BCrypt.hashpw(request.getPassword(), BCrypt.gensalt()));
        user.persist();

        return UserDTO.fromEntity(user);
    }
}
```

### 前端 Dart 注释示例（Flutter）

```dart
/// 用户控制器
/// 管理用户登录状态、用户信息等
class UserController extends GetxController {
  /// 当前登录用户
  final user = Rxn<User>();

  /// 是否正在加载
  final isLoading = false.obs;

  /// 用户登录
  /// - [username] 用户名
  /// - [password] 密码
  /// - 返回登录是否成功
  Future<bool> login(String username, String password) async {
    isLoading.value = true;
    try {
      // 调用登录接口
      final response = await _authService.login(username, password);
      if (response.isSuccess) {
        // 保存 Token
        await _storageService.saveToken(response.data!.token);
        // 更新用户信息
        user.value = response.data!.user;
        return true;
      }
      // 显示错误提示
      Get.snackbar('登录失败', response.message);
      return false;
    } finally {
      isLoading.value = false;
    }
  }
}
```

### Vue 注释示例

```vue
<script setup>
/**
 * 用户管理页面
 * 展示用户列表，支持搜索、分页、编辑、删除
 */
import { ref, onMounted } from 'vue'
import { showToast } from 'vant'
import request from '@/utils/request'

/** 用户列表数据 */
const userList = ref([])

/** 是否正在加载 */
const loading = ref(false)

/**
 * 获取用户列表
 */
async function fetchUsers() {
  loading.value = true
  try {
    const { data } = await request.get('/private/user/list')
    userList.value = data.list
  } catch (error) {
    showToast('获取用户列表失败')
  } finally {
    loading.value = false
  }
}

// 页面加载时获取数据
onMounted(() => {
  fetchUsers()
})
</script>
```

### SQL 注释示例

```sql
-- 用户表
CREATE TABLE IF NOT EXISTS user (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '用户ID',
    username VARCHAR(50) NOT NULL COMMENT '用户名，唯一',
    password VARCHAR(255) NOT NULL COMMENT '密码，BCrypt加密',
    nickname VARCHAR(50) COMMENT '昵称',
    status TINYINT DEFAULT 1 COMMENT '状态：0-禁用，1-正常',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';
```

---

## API 规范

### 路径规范

| 类型 | 路径格式 | 说明 |
|-----|---------|------|
| 公开接口 | `/public/api/{module}/{action}` | 无需认证 |
| 私有接口 | `/private/api/{module}/{action}` | 需要 Token |

### 统一响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

### 分页响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [],
    "total": 100,
    "page": 1,
    "size": 10,
    "totalPages": 10
  }
}
```

### 认证方式

- Token 放在 Header 中: `Authorization: Bearer {token}`
- Token 使用 Caffeine 缓存，30 分钟过期
- 认证过滤器自动处理 `/private/api/*` 路径

### ⚠️ 开发环境错误信息规范（重要）

**开发环境下，所有错误必须返回详细信息，方便复制给 Claude 修正。**

**后端错误响应格式（开发环境）：**

```json
{
  "code": 500,
  "message": "用户名已存在",
  "error": "完整错误信息，包含堆栈跟踪（仅开发环境）",
  "path": "/public/api/auth/register",
  "timestamp": "2024-01-01T12:00:00"
}
```

**前端错误处理规范：**

```javascript
// Vue - 请求拦截器中打印完整错误
request.interceptors.response.use(
  response => response,
  error => {
    // 开发环境打印完整错误，方便复制给 Claude
    console.error('=== API 错误（可复制给 Claude）===')
    console.error('URL:', error.config?.url)
    console.error('Method:', error.config?.method)
    console.error('Request:', error.config?.data)
    console.error('Response:', error.response?.data)
    console.error('Status:', error.response?.status)
    console.error('================================')
    return Promise.reject(error)
  }
)
```

```dart
// Flutter - API 错误处理
try {
  final response = await dio.post('/public/api/xxx', data: data);
} catch (e) {
  // 开发环境打印完整错误，方便复制给 Claude
  print('=== API 错误（可复制给 Claude）===');
  print('URL: ${e.requestOptions?.uri}');
  print('Method: ${e.requestOptions?.method}');
  print('Request: ${e.requestOptions?.data}');
  print('Response: ${e.response?.data}');
  print('Status: ${e.response?.statusCode}');
  print('================================');
  rethrow;
}
```

### 错误码规范

| 错误码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权（Token 无效或过期） |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 开发规范

### 新增 API 时必须做的事

1. ✅ **创建 API 文档**: 在 `docs/api/{module}/` 下创建对应的 JSON 文件
2. ✅ **遵循路径规范**: 公开/私有接口使用正确的路径前缀
3. ✅ **使用统一响应**: 所有接口必须使用 `Result<T>` 包装返回值
4. ✅ **添加中文注释**: 接口方法必须添加注释说明
5. ✅ **创建单元测试**: 每个 API 必须有对应的单元测试

### ⚠️ 单元测试强制规则（必须遵守）

**每个 API 必须生成对应的单元测试文件。**

测试文件位置：`server/src/test/java/org/wxs/bible dictionary/{module}/`

```java
package org.wxs.bible dictionary.todo;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.MethodOrderer;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * TodoResource 单元测试
 */
@QuarkusTest
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
public class TodoResourceTest {

    /**
     * 测试创建待办事项
     */
    @Test
    @Order(1)
    public void testCreateTodo() {
        given()
            .contentType(ContentType.JSON)
            .body("{\"title\": \"测试待办\", \"completed\": false}")
        .when()
            .post("/public/api/todo/create")
        .then()
            .statusCode(200)
            .body("code", equalTo(200))
            .body("data.title", equalTo("测试待办"));
    }

    /**
     * 测试获取待办列表
     */
    @Test
    @Order(2)
    public void testGetTodoList() {
        given()
        .when()
            .get("/public/api/todo/list")
        .then()
            .statusCode(200)
            .body("code", equalTo(200))
            .body("data", notNullValue());
    }
}
```

**测试命名规范：**
- 测试类：`{Resource名}Test.java`
- 测试方法：`test{功能描述}()`

**测试前提条件：**
- 单元测试使用真实的 MySQL 数据库
- 运行测试前必须先启动「🐳 启动基础服务」

### 新增/修改表时必须做的事

1. ✅ **创建迁移脚本**: 在 `database/migrations/` 下创建新的 SQL 文件
2. ✅ **更新 init-db.sql**: 同步更新 `database/init-db.sql`（用于新环境初始化）
3. ✅ **添加字段注释**: 使用 `COMMENT` 为每个字段添加中文说明
4. ✅ **遵循命名规范**: 表名和字段名使用小写下划线分隔
5. ✅ **更新 Entity**: 同步更新 Java 实体类，注意字段类型映射
6. ✅ **告知用户重建数据库**: 修改完成后提示用户执行重建命令

### ⚠️ 数据库开发强制规则

数据库脚本 (`database/init-db.sql`) 会在「🐳 启动基础服务」时自动执行。

**Claude 生成或修改数据库脚本后，必须提示用户：**

```
数据库结构已更新，请重建数据库：
1. 点击「⏹️ 关闭所有服务」
2. 执行: cd docker && docker-compose down -v
3. 点击「🐳 启动基础服务」
```

**或者手动执行迁移脚本（不删除数据）：**

```bash
# 通过 Docker 执行迁移脚本（推荐）
docker exec -i $(docker ps -qf "name=mysql") mysql -ubible dictionary -pbible dictionary123 bible dictionary < database/migrations/V00X__xxx.sql
```

### 数据库迁移脚本规范

**文件命名**: `V{版本号}__{描述}.sql`
- 版本号: 三位数字，递增（V001, V002, V003...）
- 描述: 使用下划线分隔的英文描述
- 示例: `V001__create_user_table.sql`, `V003__add_status_to_article.sql`

### 后端代码规范

| 组件 | 规范 |
|-----|------|
| Entity | 继承 `PanacheEntityBase`，TINYINT 字段添加 `columnDefinition` |
| DTO | 提供 `fromEntity` 静态方法，不暴露敏感字段 |
| Service | 使用 `@ApplicationScoped`，事务方法加 `@Transactional` |
| Resource | 使用 JAX-RS 注解，注入 `UserContext` 获取当前用户 |
| AuthFilter | **不使用** `@PreMatching`，确保 RequestScoped Bean 正确共享 |

### ⚠️ 后端代码强制规则（必须遵守）

生成 Java 代码时，Claude **必须**遵守以下规则：

```java
// ✅ 1. TINYINT 字段必须添加 columnDefinition
@Column(columnDefinition = "TINYINT")
private Integer status;

// ✅ 2. AuthFilter 不能使用 @PreMatching（会导致 user_id 为空）
@Provider
public class AuthFilter implements ContainerRequestFilter {
    // 正确：不加 @PreMatching
}

// ❌ 错误写法
@Provider
@PreMatching  // 禁止使用！
public class AuthFilter implements ContainerRequestFilter { }

// ✅ 3. 异常处理必须返回详细错误信息（开发环境）
@Provider
public class GlobalExceptionHandler implements ExceptionMapper<Exception> {
    @ConfigProperty(name = "quarkus.profile")
    String profile;

    @Override
    public Response toResponse(Exception e) {
        Map<String, Object> error = new HashMap<>();
        error.put("code", 500);
        error.put("message", e.getMessage());
        error.put("timestamp", LocalDateTime.now().toString());

        // 开发环境返回完整堆栈，方便复制给 Claude 修正
        if ("dev".equals(profile)) {
            StringWriter sw = new StringWriter();
            e.printStackTrace(new PrintWriter(sw));
            error.put("error", sw.toString());
        }

        return Response.status(500).entity(error).build();
    }
}
```

### 前端代码规范（Flutter - APP 项目）

| 组件 | 规范 |
|-----|------|
| 状态管理 | 使用 GetX |
| 路由 | 使用 GetX 的 GetPages，在 `app/routes/` 定义 |
| 主题 | 使用 Material 3 的 ColorScheme |
| 组件 | 通用组件放在 `widgets/` 目录 |
| API 配置 | 统一在 `core/config/app_config.dart` 管理 |

### ⚠️ Flutter 代码强制规则（必须遵守）

```dart
// ✅ 1. API 地址使用 AppConfig，不要硬编码 localhost
final response = await dio.get('${AppConfig.apiBaseUrl}/xxx/xxx');

// ❌ 错误：不要使用 localhost 或 127.0.0.1
final response = await dio.get('http://localhost:8080/xxx/xxx');

// ✅ 2. FloatingActionButton 必须设置唯一的 heroTag
FloatingActionButton(
  heroTag: 'add_todo_btn',  // 必须设置
  onPressed: () {},
  child: Icon(Icons.add),
)
```

### ⚠️ macOS 网络权限问题（常见错误）

如果 Flutter 在 macOS 上运行时报错：
```
SocketException: Connection failed (OS Error: Operation not permitted, errno = 1)
```

**原因**: macOS 沙盒缺少 `network.client` 权限

**修复方法**: 检查并修改以下两个文件：

**`application/macos/Runner/DebugProfile.entitlements`**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.app-sandbox</key>
	<true/>
	<key>com.apple.security.cs.allow-jit</key>
	<true/>
	<key>com.apple.security.network.server</key>
	<true/>
	<key>com.apple.security.network.client</key>
	<true/>
</dict>
</plist>
```

**`application/macos/Runner/Release.entitlements`**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.app-sandbox</key>
	<true/>
	<key>com.apple.security.network.client</key>
	<true/>
</dict>
</plist>
```

**注意**: 如果运行 `flutter create` 会覆盖这些文件，需要重新添加 `network.client` 权限。

### 网页前端代码规范（Vue + Vant - 网页项目）

| 组件 | 规范 |
|-----|------|
| 状态管理 | 使用 Pinia，store 文件放在 `stores/` 目录 |
| 路由 | 使用 Vue Router，在 `router/index.js` 定义 |
| UI 组件库 | 使用 Vant 4，自动按需引入 |
| 样式 | 全局样式放在 `styles/` 目录 |
| API 封装 | 统一在 `api/` 目录，使用 Axios 实例 |
| 工具函数 | 放在 `utils/` 目录 |
| 组件命名 | 使用 PascalCase，如 `UserCard.vue` |
| 页面命名 | 使用 PascalCase，如 `UserProfile.vue` |

### 后台管理代码规范（Vue + Element Plus）

| 组件 | 规范 |
|-----|------|
| 状态管理 | 使用 Pinia，store 文件放在 `stores/` 目录 |
| 路由 | 使用 Vue Router，在 `router/index.js` 定义 |
| UI 组件库 | 使用 Element Plus，按需引入 |
| 样式 | 使用 Tailwind CSS，自定义样式放在 `styles/` 目录 |
| API 封装 | 统一在 `api/` 目录，使用 Axios 实例 |
| 工具函数 | 放在 `utils/` 目录 |
| 布局 | 管理后台布局放在 `layouts/` 目录 |
| 组件命名 | 使用 PascalCase，如 `UserTable.vue` |
| 页面命名 | 使用 kebab-case，如 `user-list.vue` |

### ⚠️ 多语言支持规范（必须遵守）

**所有前端项目必须支持多语言，不允许硬编码中文文本。**

#### Flutter (APP 项目)

使用 `GetX` 的国际化方案：

```dart
// 1. 创建翻译文件: lib/core/i18n/translations.dart
class AppTranslations extends Translations {
  @override
  Map<String, Map<String, String>> get keys => {
    'zh_CN': {
      'login': '登录',
      'username': '用户名',
      'password': '密码',
      'login_success': '登录成功',
    },
    'en_US': {
      'login': 'Login',
      'username': 'Username',
      'password': 'Password',
      'login_success': 'Login successful',
    },
  };
}

// 2. 在 main.dart 配置
GetMaterialApp(
  translations: AppTranslations(),
  locale: Get.deviceLocale,
  fallbackLocale: const Locale('zh', 'CN'),
)

// 3. 使用翻译
Text('login'.tr)  // ✅ 正确
Text('登录')       // ❌ 禁止硬编码
```

#### Vue (网页项目 / 后台管理)

使用 `vue-i18n`：

```javascript
// 1. 创建翻译文件: src/i18n/index.js
import { createI18n } from 'vue-i18n'

const messages = {
  zh: {
    login: '登录',
    username: '用户名',
    password: '密码',
  },
  en: {
    login: 'Login',
    username: 'Username',
    password: 'Password',
  }
}

export const i18n = createI18n({
  locale: 'zh',
  fallbackLocale: 'zh',
  messages,
})

// 2. 在 main.js 注册
import { i18n } from './i18n'
app.use(i18n)

// 3. 在组件中使用
<template>
  <van-button>{{ $t('login') }}</van-button>  <!-- ✅ 正确 -->
  <van-button>登录</van-button>                <!-- ❌ 禁止硬编码 -->
</template>
```

#### 强制规则

| ❌ 禁止 | ✅ 必须 |
|--------|--------|
| `Text('登录')` | `Text('login'.tr)` |
| `<button>登录</button>` | `<button>{{ $t('login') }}</button>` |
| 硬编码任何用户可见的文本 | 所有文本通过 i18n 引用 |

### ⚠️ 无障碍访问规范（必须遵守）

**所有前端项目必须支持无障碍访问，确保视障用户可以通过屏幕阅读器正常使用。**

#### Flutter (APP 项目)

使用 `Semantics` widget 为控件添加语义信息：

```dart
// ✅ 输入框添加语义
Semantics(
  label: 'username'.tr,  // 结合 i18n
  hint: 'enter_username'.tr,
  textField: true,
  child: TextField(
    onChanged: (v) => controller.username.value = v,
    decoration: InputDecoration(labelText: 'username'.tr),
  ),
)

// ✅ 按钮添加语义
Semantics(
  label: 'login'.tr,
  button: true,
  enabled: !controller.isLoading.value,
  child: ElevatedButton(
    onPressed: controller.isLoading.value ? null : controller.login,
    child: Text(controller.isLoading.value ? 'logging_in'.tr : 'login'.tr),
  ),
)

// ✅ 图片必须添加语义描述
Semantics(
  label: 'user_avatar'.tr,
  image: true,
  child: Image.asset('assets/avatar.png'),
)

// ✅ 排除纯装饰性元素
ExcludeSemantics(
  child: Icon(Icons.decorative_icon),
)

// ✅ 合并相关控件的语义
MergeSemantics(
  child: ListTile(
    leading: Icon(Icons.person),
    title: Text('username'.tr),
    subtitle: Text(user.name),
  ),
)
```

**Flutter 无障碍强制规则：**

| 控件类型 | 必须设置 |
|---------|---------|
| 按钮 | `Semantics(label: ..., button: true)` |
| 输入框 | `Semantics(label: ..., hint: ..., textField: true)` |
| 图片 | `Semantics(label: ..., image: true)` |
| 开关 | `Semantics(label: ..., toggled: value)` |
| 装饰性元素 | `ExcludeSemantics()` |

#### Vue (网页项目 / 后台管理)

使用 ARIA 属性和语义化 HTML：

```vue
<template>
  <!-- ✅ 使用语义化标签 -->
  <main role="main" :aria-label="$t('login_page')">

    <!-- ✅ 表单添加 aria-label -->
    <van-form @submit="onSubmit" :aria-label="$t('login_form')">

      <!-- ✅ 输入框关联 label 和 aria 属性 -->
      <van-field
        v-model="formData.username"
        :label="$t('username')"
        :aria-label="$t('username_input')"
        aria-required="true"
        :rules="[{ required: true }]"
      />

      <van-field
        v-model="formData.password"
        type="password"
        :label="$t('password')"
        :aria-label="$t('password_input')"
        aria-required="true"
        :rules="[{ required: true }]"
      />

      <!-- ✅ 按钮状态通知 -->
      <van-button
        block
        type="primary"
        native-type="submit"
        :aria-busy="isLoading"
        :aria-disabled="isLoading"
      >
        {{ $t('login') }}
      </van-button>
    </van-form>

    <!-- ✅ 动态内容变化通知屏幕阅读器 -->
    <div aria-live="polite" class="sr-only">
      {{ statusMessage }}
    </div>
  </main>
</template>

<style scoped>
/* 屏幕阅读器专用（视觉隐藏但可读） */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
```

**Vue 无障碍强制规则：**

| 元素类型 | 必须设置 |
|---------|---------|
| 页面区域 | `<main>`, `<nav>`, `<header>`, `<footer>` 等语义标签 |
| 表单控件 | `aria-label` 或关联 `<label>` |
| 必填字段 | `aria-required="true"` |
| 图片 | `alt` 属性（装饰性图片使用 `alt=""`） |
| 加载状态 | `aria-busy="true"` |
| 禁用状态 | `aria-disabled="true"` |
| 动态内容 | `aria-live="polite"` 或 `aria-live="assertive"` |
| 可交互元素 | 确保 Tab 键可访问 |

#### 通用强制规则

| ❌ 禁止 | ✅ 必须 |
|--------|--------|
| 无语义的可交互元素 | 所有按钮、输入框必须有语义标签 |
| 无 alt 的图片 | 所有图片必须有 alt（装饰性图片 alt=""） |
| 仅靠颜色区分状态 | 颜色 + 文字/图标双重提示 |
| 无法键盘操作的交互 | 所有交互元素支持键盘访问 |

---

## 数据库规范

### 命名规范

| 类型 | 规范 | 示例 |
|-----|------|------|
| 表名 | 小写下划线 | `user`, `user_profile` |
| 字段名 | 小写下划线 | `created_at`, `user_id` |
| 索引 | `idx_` + 字段名 | `idx_user_id` |
| 唯一索引 | `uk_` + 字段名 | `uk_username` |

### 通用字段

每个表都应包含:
- `id`: 主键，BIGINT，自增
- `created_at`: 创建时间，DATETIME
- `updated_at`: 更新时间，DATETIME

### 字段类型映射

| MySQL 类型 | Java 类型 | 说明 |
|-----------|----------|------|
| BIGINT | Long | 主键、外键 |
| VARCHAR | String | 短文本 |
| TEXT | String | 长文本 |
| INT | Integer | 整数 |
| TINYINT | Integer | 状态、布尔值（需加 columnDefinition） |
| DECIMAL | BigDecimal | 金额 |
| DATE | LocalDate | 日期 |
| DATETIME | LocalDateTime | 时间戳 |

---

## 运行环境

### 开发环境要求

- JDK 21+
- Docker Desktop
- Flutter 3.x（APP 项目）
- Node.js 20+
- VSCode + 扩展

### 端口分配

| 服务 | 端口 |
|-----|------|
| 后端 API (server) | 8080 |
| 后台管理后端 (console/server) | 8081 |
| MySQL | 3306 |
| 后台管理前端 (Vite) | 5173 |
| 网页前端 (website) | 5174 |
| Flutter 开发 | 动态分配 |

### 数据库连接信息

```
Host: localhost
Port: 3306
Database: bible dictionary
Username: bible dictionary
Password: bible dictionary123
```

---

## 常用命令速查

### 后端

```bash
cd server
./mvnw quarkus:dev     # 开发模式（热重载）
./mvnw package         # 打包
./mvnw test            # 运行测试
./mvnw clean           # 清理构建
```

### Docker

```bash
cd docker
docker-compose up -d              # 启动 MySQL
docker-compose down               # 停止 MySQL
docker-compose logs -f mysql      # 查看日志
docker-compose down -v && docker-compose up -d  # 重建（重置数据）
```

### 前端（Flutter - APP 项目）

```bash
cd application
flutter pub get        # 获取依赖
flutter run            # 运行
flutter run -d macos   # 指定 macOS
flutter build apk      # 构建 Android
flutter build macos    # 构建 macOS
```

### 网页前端（Vue + Vant）

```bash
cd website
npm install            # 安装依赖
npm run dev            # 开发模式（热重载）
npm run build          # 构建生产版本
npm run preview        # 预览构建结果
```

### 后台管理后端

```bash
cd console/server
./mvnw quarkus:dev     # 开发模式（热重载）
./mvnw package         # 打包
```

### 后台管理前端（Vue）

```bash
cd console/client
npm install            # 安装依赖
npm run dev            # 开发模式（热重载）
npm run build          # 构建生产版本
```

---

## AI 对话记录规范

### 🚨🚨🚨 对话记录强制规则（必须执行！）

**⚠️ 极其重要：Claude 必须使用 Write 工具实际保存文件，不能只是说"已保存"！**

**这是强制要求，绝对不能跳过！每次回复用户后都要实际写入文件！**

### ⚠️ 如何获取当前时间（必须执行！）

**Claude 不能猜测时间！必须使用 Bash 命令获取实际时间：**

```bash
date "+%Y-%m-%d %H:%M"
```

**示例输出**: `2026-02-02 18:25`

**流程**:
1. 每天第一次保存对话前，先执行 `date "+%Y-%m-%d %H:%M"` 获取当前时间
2. 使用获取到的实际时间作为文件名中的日期和时间部分
3. 后续问答保持相同的时间前缀，只递增序号

**绝对禁止**:
- ❌ 假设或猜测时间（如随便写 15:00）
- ❌ 使用示例中的时间（如 14:30）
- ✅ 必须使用 `date` 命令获取的真实时间

### 核心规则：每次问答 = 一个独立文件

```
假设当前时间是 14:30：
用户提问 1 → Claude 回复 → 保存为 2026-02-02 14:30-1 对话.md
用户提问 2 → Claude 回复 → 保存为 2026-02-02 14:30-2 对话.md
用户提问 3 → Claude 回复 → 保存为 2026-02-02 14:30-3 对话.md
```

**⚠️ 不是把多个问答放在同一个文件，而是每次问答创建新文件！**

### 文件命名规范

**格式**: `{YYYY-MM-DD HH:mm}-{n} 对话.md`

| 部分 | 说明 |
|------|------|
| YYYY-MM-DD | **当前实际日期**（今天是几号就写几号） |
| HH:mm | **第一次问答时的实际时间**（现在几点就写几点） |
| n | 当天第几次问答（从 1 开始递增） |

**示例**（假设第一次问答时间是 14:30）:
- `2026-02-02 14:30-1 对话.md` ← 今天第 1 次问答
- `2026-02-02 14:30-2 对话.md` ← 今天第 2 次问答
- `2026-02-02 14:30-3 对话.md` ← 今天第 3 次问答

### 保存时机

| 触发条件 | 必须做 |
|---------|--------|
| 回复用户任何问题后 | ✅ 创建新文件保存 |
| 生成代码后 | ✅ 创建新文件保存 |
| 用户说"继续"后 | ✅ 创建新文件保存 |

### 🚨 必须实际执行保存操作

```
❌ 错误：只显示文字 "（💾 保存对话记录）"
✅ 正确：实际调用 Write 工具写入 docs/ai-chat/xxx.md 文件
```

### 单个文件内容格式

每个文件只记录一次问答：

```markdown
# 对话 {n}

**时间**: {YYYY-MM-DD HH:mm}

---

**用户**: {用户的问题或需求}

**Claude**: {Claude 的回答摘要}

**修改的文件**:
- `{文件路径}`: {修改说明}
```

### 示例（假设第一次问答时间是 14:30）

**文件: `2026-02-02 14:30-1 对话.md`**

```markdown
# 对话 1

**时间**: 2026-02-02 14:30

---

**用户**: 帮我实现用户登录功能

**Claude**: 创建了用户登录 API，包含注册、登录、登出接口，使用 Token + Caffeine 缓存实现认证。

**修改的文件**:
- `server/src/.../auth/AuthResource.java`: 新增登录、注册、登出接口
- `server/src/.../auth/AuthService.java`: 实现认证业务逻辑
- `database/init-db.sql`: 新增 user 表
```

**文件: `2026-02-02 14:30-2 对话.md`**

```markdown
# 对话 2

**时间**: 2026-02-02 14:45

---

**用户**: 登录时报 500 错误

**Claude**: 修复了密码验证逻辑，BCrypt 比对方法参数顺序错误。

**修改的文件**:
- `server/src/.../auth/AuthService.java`: 修复 BCrypt.checkpw 参数顺序
```

**文件: `2026-02-02 14:30-3 对话.md`**

```markdown
# 对话 3

**时间**: 2026-02-02 15:00

---

**用户**: 登录页面加一个记住密码的选项

**Claude**: 在登录页添加了记住密码复选框，勾选后 Token 有效期延长至 7 天。

**修改的文件**:
- `application/lib/modules/auth/views/login_view.dart`: 添加记住密码 UI
- `server/src/.../auth/AuthService.java`: 支持可配置的 Token 有效期
```
