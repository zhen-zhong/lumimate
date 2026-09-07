# LumiMate

LumiMate 是一个基于 Expo / React Native 的 AI 陪伴应用。当前定位：虚拟朋友、虚拟恋人、长期记忆、本地数据存储，以及后续本地模型 / agent 能力接入。

## 技术栈

- Expo SDK 57
- React Native 0.86
- React 19
- TypeScript
- expo-router
- EAS Build / Submit

## 当前功能

- `expo-router` 文件路由
- 4 个底部导航：
  - 首页
  - 陪伴
  - 记忆
  - 设置
- iOS Bundle ID：`com.zhenzhong.lumimate`
- Expo / EAS 项目配置已写入 `app.json`

## 本地启动

安装依赖：

```bash
npm install
```

启动 Expo：

```bash
npx expo start
```

在 iPhone 上打开 Expo Go，点击本地 development server，或扫描终端二维码。

如果局域网连接失败，可用 tunnel：

```bash
npx expo start --tunnel
```

## 常用命令

```bash
npm run start
npm run ios
npm run android
npm run web
npm run lint
npx tsc --noEmit
```

## 项目结构

```text
src/
  app/
    _layout.tsx
    index.tsx
    companion.tsx
    memory.tsx
    settings.tsx
  components/
    app-tabs.tsx
    app-tabs.web.tsx
    app-screen.tsx
  constants/
  hooks/
assets/
```

## 分支规范

本项目使用 `master/dev` 模式：

- `master`：稳定分支，只放可发布、可构建版本
- `dev`：日常开发分支，新功能先合入这里
- feature 分支：从 `dev` 切出，完成后合回 `dev`
- 发布流程：`dev` 验证通过后合并到 `master`

推荐流程：

```bash
git checkout dev
git pull
git checkout -b feature/your-feature

# 开发完成后
git checkout dev
git merge feature/your-feature
git push origin dev
```

发布到稳定分支：

```bash
git checkout master
git merge dev
git push origin master
```

## iOS 凭证

iOS 凭证只保存在本地，不提交到 Git：

- `.p8`
- `.p12`
- `.key`
- `.mobileprovision`
- `.pem`
- `.certSigningRequest`

`.gitignore` 已屏蔽这些敏感文件。不要把 Apple Developer / App Store Connect / Expo credentials 上传到仓库。

## 后续方向

- 聊天 UI
- 用户画像与长期记忆
- SQLite / 本地加密存储
- HealthKit 权限与健康摘要
- 相册 / iCloud Photos 相关能力调研
- 推送通知
- development build
- 本地模型或 agent runtime 接入
