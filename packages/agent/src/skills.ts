import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AgentSkill = {
  name: string;
  description: string;
  body: string;
  disableModelInvocation: boolean;
  dirName: string;
};

const GRILL_ME_RE =
  /(?:^|[^\w])(?:\/)?grill[-_ ]?me\b|拷问|追问我|把方案问清楚|压测(?:一下)?(?:这个)?(?:想法|方案|设计)/i;
const GRILL_ANY_RE = /(?:^|[^\w])grill(?:ing)?\b/i;
const MARKITDOWN_RE =
  /\bmarkitdown\b|转成?\s*markdown|转成?\s*md\b|convert(?:ing)?\s+to\s+markdown|\.(?:pdf|docx?|pptx?|xlsx?)\b|\bPDF\b|\bExcel\b|PowerPoint|Word\s*文档|幻灯片/i;

export function bundledSkillsDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "skills");
}

export function parseSkillMarkdown(raw: string, dirName: string): AgentSkill {
  const text = raw.replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const front = match ? match[1] : "";
  const body = (match ? match[2] : text).trim();
  const fields = parseFrontmatter(front);
  const name = (fields.name || dirName).trim();
  if (!name) {
    throw new Error(`Skill in ${dirName} is missing a name`);
  }
  return {
    name,
    description: (fields.description || "").replace(/\s+/g, " ").trim(),
    body,
    disableModelInvocation: /^(true|yes|1)$/i.test(fields["disable-model-invocation"] || ""),
    dirName,
  };
}

export function loadBundledSkills(dir = bundledSkillsDir()): AgentSkill[] {
  if (!existsSync(dir)) return [];
  const skills: AgentSkill[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(dir, entry.name, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    skills.push(parseSkillMarkdown(readFileSync(skillFile, "utf8"), entry.name));
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function selectSkillsForMessage(message: string, skills: AgentSkill[]): AgentSkill[] {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const selected = new Map<string, AgentSkill>();
  const text = message.normalize("NFKC");

  const grillMe = GRILL_ME_RE.test(text);
  const grillAny = GRILL_ANY_RE.test(text);
  if (grillMe) {
    addSkill(selected, byName, "grill-me");
    addSkill(selected, byName, "grilling");
  } else if (grillAny) {
    addSkill(selected, byName, "grilling");
  }

  if (MARKITDOWN_RE.test(text)) {
    addSkill(selected, byName, "markitdown");
  }

  return [...selected.values()];
}

export function formatSkillsForPrompt(all: AgentSkill[], active: AgentSkill[]): string {
  if (all.length === 0) return "";
  const catalog = all
    .map((skill) => {
      const gate = skill.disableModelInvocation ? "（仅用户点名时启用）" : "";
      return `- ${skill.name}${gate}：${skill.description || skill.name}`;
    })
    .join("\n");
  let block = `## 技能目录\n\n${catalog}`;
  if (active.length > 0) {
    const bodies = active
      .map((skill) => `### ${skill.name}\n\n${skill.body}`)
      .join("\n\n");
    block += `\n\n## 本轮启用的技能\n\n按这些说明执行；未启用的技能不要假装已经打开。\n\n${bodies}`;
  }
  return block;
}

function addSkill(
  selected: Map<string, AgentSkill>,
  byName: Map<string, AgentSkill>,
  name: string,
): void {
  const skill = byName.get(name);
  if (skill) selected.set(skill.name, skill);
}

function parseFrontmatter(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let key = "";
  let folded = false;
  for (const line of block.split("\n")) {
    const cont = line.match(/^  (.+)$/);
    if (folded && cont && key) {
      fields[key] = `${fields[key]} ${cont[1].trim()}`.trim();
      continue;
    }
    folded = false;
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    key = pair[1];
    const raw = pair[2].trim();
    if (/^[>|][-+]?$/.test(raw)) {
      fields[key] = "";
      folded = true;
      continue;
    }
    fields[key] = raw.replace(/^['"]|['"]$/g, "");
  }
  return fields;
}
