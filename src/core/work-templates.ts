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
    id: "content-polish",
    name: "内容润色",
    description: "强化专业表达并保留事实边界",
    prompt: "请润色引用内容，保持事实、数据和核心观点不变，优化表达准确性、逻辑层级、可读性和专业性；不得虚构信息或改变原意。"
  },
  {
    id: "report-outline",
    name: "汇报提纲",
    description: "生成适合现场汇报的结构化提纲",
    prompt: "请根据引用资料生成汇报提纲，按“背景与目标、现状与问题、核心分析、解决方案、实施计划、风险应对、结论与下一步”组织，并标注每部分建议讲述时间。"
  },
  {
    id: "case-summary",
    name: "案例总结",
    description: "沉淀背景、动作、成果和可复用经验",
    prompt: "请将引用资料整理为案例总结，包含“项目背景、主要问题、关键动作、量化成果、经验复盘、可复用条件”；没有证据的数据请标注待核实。"
  },
  {
    id: "action-plan",
    name: "执行方案",
    description: "形成目标明确且可落地的执行方案",
    prompt: "请根据引用资料形成执行方案，包含“背景与目标、范围与原则、关键任务、职责分工、资源需求、进度计划、风险与应对、验收标准”；缺失信息单独列为待补充项。"
  }
];

export function filterWorkTemplates(query: string): WorkTemplate[] {
  const normalized = query.trim().replace(/^\//, "").toLowerCase();
  if (!normalized) return WORK_TEMPLATES;
  return WORK_TEMPLATES.filter((template) =>
    `${template.name} ${template.description} ${template.id}`.toLowerCase().includes(normalized)
  );
}
