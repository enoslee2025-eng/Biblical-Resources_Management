# API 服务部署说明

## 方式一：Docker 运行（推荐）

### 1. 构建镜像
```bash
docker build -t bible dictionary-api .
```

### 2. 运行容器
```bash
docker run -d \
  --name bible dictionary-api \
  -p 8080:8080 \
  -e QUARKUS_DATASOURCE_JDBC_URL=jdbc:mysql://数据库地址:3306/bible dictionary \
  -e QUARKUS_DATASOURCE_USERNAME=bible dictionary \
  -e QUARKUS_DATASOURCE_PASSWORD=生产环境密码 \
  bible dictionary-api
```

### 3. 查看日志
```bash
docker logs -f bible dictionary-api
```

---

## 方式二：直接运行 JAR

### 前置条件
- 安装 JDK 21+

### 运行命令
```bash
cd quarkus-app

# 使用默认配置运行
java -jar quarkus-run.jar

# 指定生产环境配置运行
java \
  -Dquarkus.datasource.jdbc.url=jdbc:mysql://数据库地址:3306/bible dictionary \
  -Dquarkus.datasource.username=bible dictionary \
  -Dquarkus.datasource.password=生产环境密码 \
  -jar quarkus-run.jar
```

---

## 生产环境配置

| 配置项 | 环境变量 | 说明 |
|-------|---------|------|
| 数据库地址 | `QUARKUS_DATASOURCE_JDBC_URL` | `jdbc:mysql://IP:3306/bible dictionary` |
| 数据库用户 | `QUARKUS_DATASOURCE_USERNAME` | 数据库用户名 |
| 数据库密码 | `QUARKUS_DATASOURCE_PASSWORD` | **必须修改为生产环境密码** |
| HTTP 端口 | `QUARKUS_HTTP_PORT` | 默认 8080 |

### 配置方式优先级（从高到低）
1. 环境变量（推荐用于 Docker/K8s）
2. JVM 参数（-D）
3. config/application.properties（外部配置文件）
4. 打包内的 application.properties

---

## 健康检查

```bash
curl http://localhost:8080/q/health
```
