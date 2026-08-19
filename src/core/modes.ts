import type { WorkMode } from "../types";

export interface WorkModeConfig {
  label: string;
  help: string;
  instruction: string;
}

export const WORK_MODE_CONFIG: Record<WorkMode, WorkModeConfig> = {
  search: {
    label: "搜索",
    help: "查库内或联网资料，整理来源；只读，不修改文件。",
    instruction: "你处于搜索模式。请结合库内资料和联网搜索给出有来源链接的答案，不要修改任何文件。"
  },
  ask: {
    label: "问答",
    help: "基于选区或笔记解释、总结、润色；只返回答案。",
    instruction: "你处于问答模式。请基于提供的上下文回答，不要修改文件或执行有副作用的操作。"
  },
  work: {
    label: "工作",
    help: "执行多步骤任务；写文件或运行命令前会请求批准。",
    instruction: "你处于工作模式。可以完成多步骤任务；任何写入、删除或命令执行都必须先请求用户批准。"
  },
  plan: {
    label: "计划",
    help: "先研究并拆解步骤；只给可审阅计划，暂不执行。",
    instruction: "你处于计划模式。只做研究、分析和方案设计，先给出可审阅计划，不要修改文件。"
  }
};
