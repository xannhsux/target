# 🚀 部署指南

## 方法1: GitHub Pages（推荐，完全免费）

### 步骤：

1. **创建 GitHub 仓库**
   ```bash
   # 在项目目录下
   cd /Users/annann/Desktop/target2
   
   # 初始化 Git（如果还没有）
   git init
   
   # 添加所有文件
   git add .
   
   # 提交
   git commit -m "Initial commit - 3D Gesture Punching Game"
   ```

2. **推送到 GitHub**
   - 在 GitHub.com 上创建新仓库（例如：`gesture-punching-game`）
   - 不要勾选 "Initialize with README"
   
   ```bash
   # 连接到你的 GitHub 仓库（替换成你的用户名）
   git remote add origin https://github.com/YOUR_USERNAME/gesture-punching-game.git
   git branch -M main
   git push -u origin main
   ```

3. **启用 GitHub Pages**
   - 访问你的仓库设置: `Settings` → `Pages`
   - Source: 选择 `main` 分支
   - 点击 `Save`
   - 等待 1-2 分钟

4. **✅ 完成！**
   - 你的游戏会发布在：
   ```
   https://YOUR_USERNAME.github.io/gesture-punching-game/
   ```

---

## 方法2: Vercel（最快，免费）

1. **安装 Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **部署**
   ```bash
   cd /Users/annann/Desktop/target2
   vercel
   ```

3. **按照提示操作**
   - 登录/注册 Vercel 账号
   - 确认项目设置
   - 等待部署完成

4. **✅ 完成！**
   - Vercel 会给你一个 URL，例如：
   ```
   https://gesture-punching-game.vercel.app
   ```

---

## 方法3: Netlify（简单拖拽）

1. **访问** [netlify.com](https://netlify.com)
2. **注册/登录**
3. **拖拽整个 `target2` 文件夹**到 Netlify Drop
4. **✅ 完成！**
   - 自动生成一个 URL，例如：
   ```
   https://random-name-12345.netlify.app
   ```

---

## 📋 部署前检查清单

- ✅ 所有文件都在同一目录
- ✅ `index.html` 是入口文件
- ✅ 相对路径正确（`./game.js`, `./style.css`）
- ✅ 浏览器需要支持 WebRTC（摄像头）和 ES6 modules
- ✅ 必须使用 HTTPS（GitHub Pages/Vercel/Netlify 都自动支持）

---

## 🌐 分享给朋友

部署后，你会得到一个 URL，例如：
```
https://yourusername.github.io/gesture-punching-game/
```

直接把这个链接发给朋友即可！

### ⚠️ 重要提示：
1. **HTTPS 必需** - 摄像头需要 HTTPS（所有推荐方案都自动支持）
2. **浏览器兼容** - 推荐 Chrome/Edge，需要允许摄像头权限
3. **网络速度** - 首次加载需要下载 3D 模型和库（~5MB）

---

## 🔄 更新游戏

### GitHub Pages:
```bash
git add .
git commit -m "Update game"
git push
# 等待 1-2 分钟自动部署
```

### Vercel:
```bash
vercel --prod
```

### Netlify:
- 重新拖拽文件，或使用 Netlify CLI

---

## 💡 高级选项：自定义域名

所有三个平台都支持免费自定义域名：
- 购买域名（例如 namecheap.com）
- 在平台设置中添加域名
- 配置 DNS 记录

例如：`punchinggame.com` → 你的游戏

---

需要帮助？查看官方文档：
- [GitHub Pages 文档](https://docs.github.com/en/pages)
- [Vercel 文档](https://vercel.com/docs)
- [Netlify 文档](https://docs.netlify.com)
