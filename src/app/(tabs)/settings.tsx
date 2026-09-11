import { AppScreen } from '@/components/app-screen';

export default function SettingsScreen() {
  return (
    <AppScreen
      eyebrow="Settings"
      title="设置"
      description="管理隐私、权限、模型、通知和账号。HealthKit、相册、推送都可以从这里进入。"
      primary="应用设置"
      secondary="下一步可以放权限检查、模型选择、数据清理、隐私开关。"
    />
  );
}
