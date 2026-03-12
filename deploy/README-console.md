# 后台管理服务部署说明

## 后台 API (console/server)

### 方式一：Docker 运行（推荐）

#### 1. 构建镜像
```bash
cd server
docker build -t bible dictionary-console .
```

#### 2. 运行容器
```bash
docker run -d \
  --name bible dictionary-console \
  -p 8081:8081 \
  -e QUARKUS_DATASOURCE_JDBC_URL=jdbc:mysql://数据库地址:3306/bible dictionary \
  -e QUARKUS_DATASOURCE_USERNAME=bible dictionary \
  -e QUARKUS_DATASOURCE_PASSWORD=生产环境密码 \
  bible dictionary-console
```

### 方式二：直接运行 JAR

```bash
cd server/quarkus-app

java \
  -Dquarkus.datasource.jdbc.url=jdbc:mysql://数据库地址:3306/bible dictionary \
  -Dquarkus.datasource.username=bible dictionary \
  -Dquarkus.datasource.password=生产环境密码 \
  -Dquarkus.http.port=8081 \
  -jar quarkus-run.jar
```

---

## 后台前端 (console/client)

### Nginx 部署

#### 1. 复制静态文件
```bash
cp -r client/* /usr/share/nginx/html/console/
```

#### 2. Nginx 配置
```nginx
server {
    listen 80;
    server_name console.example.com;

    root /usr/share/nginx/html/console;
    index index.html;

    # Vue Router history 模式
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:8081/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Docker + Nginx 部署

创建 `Dockerfile.nginx`:
```dockerfile
FROM nginx:alpine
COPY client/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

---

## 生产环境配置

| 配置项 | 环境变量 | 说明 |
|-------|---------|------|
| 数据库地址 | `QUARKUS_DATASOURCE_JDBC_URL` | `jdbc:mysql://IP:3306/bible dictionary` |
| 数据库用户 | `QUARKUS_DATASOURCE_USERNAME` | 数据库用户名 |
| 数据库密码 | `QUARKUS_DATASOURCE_PASSWORD` | **必须修改为生产环境密码** |
| HTTP 端口 | `QUARKUS_HTTP_PORT` | 默认 8081 |

---

## 健康检查

```bash
# 后台 API
curl http://localhost:8081/q/health

# 后台前端
curl http://localhost/console/
```
