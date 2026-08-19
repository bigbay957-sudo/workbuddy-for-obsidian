export interface WorkTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export const WORK_TEMPLATES: WorkTemplate[] = [
  {
    id: "meeting-notes",
    name: "会议纪要",
    description: "整理议题、结论、责任人和截止时间",
    prompt: "请根据引用资料整理会议纪要，按“会议主题、核心讨论、明确结论、待办事项（责任人/截止时间）、待确认问题”输出；不要虚构缺失信息。"
  },
  {
    id: "bid-polish",
    name: "标书润色",
    description: "强化专业表达并保留事实边界",
    prompt: "请润色引用的投标文件内容，保持事实、数据和承诺不变，强化物业管理专业性、逻辑层级和可执行性；不得虚构案例、资质或数据。"
  },
  {
    id: "presentation-outline",
    name: "述标提纲",
    description: "生成适合现场汇报的结构化提纲",
    prompt: "请根据引用资料生成述标汇报提纲，按“项目理解、核心痛点、解决方案、服务亮点、实施保障、风险应对、总结承诺”组织，并标注每部分建议讲述时间。"
  },
  {
    id: "case-summary",
    name: "案例总结",
    description: "沉淀背景、动作、成果和可复用经验",
    prompt: "请将引用资料整理为案例总结，包含“项目背景、主要问题、关键动作、量化成果、经验复盘、可复用条件”；没有证据的数据请标注待核实。"
  },
  {
    id: "property-plan",
    name: "物业方案",
    description: "形成可执行的物业服务方案框架",
    prompt: "请根据引用资料形成物业服务方案，包含“项目研判、服务目标、组织配置、客服/秩序/环境/工程方案、品质管控、应急机制、实施计划和考核指标”；缺失信息单独列为待补充项。"
  }
];

export function filterWorkTemplates(query: string): WorkTemplate[] {
  const normalized = query.trim().replace(/^\//, "").toLowerCase();
  if (!normalized) return WORK_TEMPLATES;
  return WORK_TEMPLATES.filter((template) =>
    `${template.name} ${template.description} ${template.id}`.toLowerCase().includes(normalized)
  );
}
