import { AppScreen } from '@/components/app-screen';

export default function HomeScreen() {
  return (
    <AppScreen
      eyebrow="LumiMate"
      title="最后的净土"
      description="给 LumiMate 留出入口：今日状态、最近对话、重要提醒都会放在这里。"
      primary="今日首页"
      secondary="下一步可以接入欢迎语、用户昵称、最近一次陪伴会话。"
    />
  );
}
