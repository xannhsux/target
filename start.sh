#!/bin/bash

# 3D手势打靶游戏启动脚本

echo "🎮 正在启动3D手势打靶游戏..."
echo ""

# 检查Python是否安装
if command -v python3 &> /dev/null; then
    echo "✅ 使用Python启动本地服务器..."
    echo "📱 请在浏览器中访问: http://localhost:8000"
    echo "⚠️  按 Ctrl+C 停止服务器"
    echo ""
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    echo "✅ 使用Python启动本地服务器..."
    echo "📱 请在浏览器中访问: http://localhost:8000"
    echo "⚠️  按 Ctrl+C 停止服务器"
    echo ""
    python -m http.server 8000
else
    echo "❌ 未找到Python，请使用其他方法启动"
    echo ""
    echo "方法1: 安装Python后运行此脚本"
    echo "方法2: 使用Node.js运行: npx http-server"
    echo "方法3: 直接在浏览器中打开 index.html (可能无法正常工作)"
fi

