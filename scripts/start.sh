#!/bin/bash

# ============================================
# 启动脚本
# 自动获取本机 IP 并配置服务
# ============================================

set -e

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 获取本机 IP 地址（macOS）
get_local_ip() {
    # 优先获取 en0 (Wi-Fi) 的 IP
    local ip=$(ipconfig getifaddr en0 2>/dev/null)
    if [ -z "$ip" ]; then
        # 尝试 en1
        ip=$(ipconfig getifaddr en1 2>/dev/null)
    fi
    if [ -z "$ip" ]; then
        # 尝试获取任意活动网络接口的 IP
        ip=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
    fi
    if [ -z "$ip" ]; then
        ip="localhost"
    fi
    echo "$ip"
}

LOCAL_IP=$(get_local_ip)

echo "=========================================="
echo "       启动服务"
echo "=========================================="
echo ""
echo "本机 IP: $LOCAL_IP"
echo ""

# 更新 Flutter 配置
FLUTTER_CONFIG="$PROJECT_DIR/application/lib/core/config/app_config.dart"
if [ -f "$FLUTTER_CONFIG" ]; then
    echo "更新 Flutter API 配置..."
    sed -i '' "s/static const String apiHost = '[^']*'/static const String apiHost = '$LOCAL_IP'/" "$FLUTTER_CONFIG"
fi

# 更新 Vue 配置
VUE_REQUEST="$PROJECT_DIR/console/client/src/utils/request.js"
if [ -f "$VUE_REQUEST" ]; then
    echo "更新 Vue API 配置..."
    sed -i '' "s|baseURL: 'http://[^']*'|baseURL: 'http://$LOCAL_IP:8081'|" "$VUE_REQUEST"
fi

echo ""
echo "配置已更新，使用 IP: $LOCAL_IP"
echo ""
echo "=========================================="
echo "启动 Docker MySQL..."
echo "=========================================="

cd "$PROJECT_DIR/docker"
docker-compose up -d

echo ""
echo "等待 MySQL 启动..."
sleep 5

echo ""
echo "=========================================="
echo "MySQL 已启动"
echo "=========================================="
echo ""
echo "现在可以用 VSCode 启动其他服务："
echo "  🚀 启动 API        - 主后端 (端口 8080)"
echo "  📱 启动 APP        - Flutter 应用"
echo "  🔧 启动后台 API    - 后台管理后端 (端口 8081)"
echo "  🖥️ 启动后台管理     - Vue 前端 (端口 5173)"
echo ""
echo "API 地址: http://$LOCAL_IP:8080"
echo "后台管理 API: http://$LOCAL_IP:8081"
echo ""
