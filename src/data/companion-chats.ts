export type CompanionChat = {
  id: string;
  name: string;
  subtitle: string;
  lastMessage: string;
  time: string;
};

export const CompanionChats: CompanionChat[] = [
  {
    id: 'lumimate',
    name: 'LumiMate',
    subtitle: '长期陪伴',
    lastMessage: '我在。想聊什么都可以。',
    time: '现在',
  },
  {
    id: 'reflection',
    name: '整理想法',
    subtitle: '情绪和计划',
    lastMessage: '把卡住的事拆成一个小动作。',
    time: '今天',
  },
  {
    id: 'memory',
    name: '记忆助手',
    subtitle: '偏好与重要节点',
    lastMessage: '重要偏好以后可以进入本地记忆。',
    time: '昨天',
  },
];

export function getCompanionChat(chatId: string) {
  return CompanionChats.find((chat) => chat.id === chatId) ?? CompanionChats[0];
}
