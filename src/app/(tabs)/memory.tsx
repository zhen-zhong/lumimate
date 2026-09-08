import { AppScreen } from '@/components/app-screen';

export default function MemoryScreen() {
  return (
    <AppScreen
      eyebrow="Memory"
      title="记忆"
      description="保存用户偏好、共同经历、重要节点和本地数据，让陪伴不是一次性聊天。"
      primary="本地记忆库"
      secondary="后续可接 SQLite、本地向量库、照片索引、健康摘要和加密存储。"
    />
  );
}
