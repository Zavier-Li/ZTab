import Dexie, { type Table } from "dexie";
import { newProject, type Project } from "./types";
import cudc from "../data/cudc.json";
class ZTabDB extends Dexie {
  projects!: Table<Project, string>;
  constructor() {
    super("ztab-local");
    this.version(1).stores({ projects: "id,name,updatedAt" });
  }
}
export const db = new ZTabDB();
export async function saveProject(project: Project) {
  project = { ...project, updatedAt: new Date().toISOString() };
  await db.projects.put(project);
  return project;
}
export async function initialize(preferredId?: string | null) {
  return db.transaction("rw", db.projects, async () => {
    const configured = await db.projects.get(cudc.id);
    if (!configured) {
      await db.projects.add(cudc as Project);
      return cudc.id;
    }
    if (preferredId && (await db.projects.get(preferredId))) return preferredId;
    return (await db.projects.orderBy("updatedAt").last())!.id;
  });
}
export function demoProject() {
  const p = newProject("春季英语辩论邀请赛 · 示例");
  const schools = [
    "长安大学",
    "西北大学",
    "西安电子科技大学",
    "西北工业大学",
    "陕西师范大学",
    "西安交通大学",
  ];
  p.teams = Array.from({ length: 12 }, (_, i) => ({
    id: crypto.randomUUID(),
    name: [
      "向光而行",
      "思辨之间",
      "不设限",
      "星河漫游",
      "理想主义",
      "答案在风中",
      "知行合一",
      "言之有理",
      "山海之间",
      "自由意志",
      "未完待续",
      "掷地有声",
    ][i],
    speaker1: `辩手 ${i * 2 + 1}`,
    speaker2: `辩手 ${i * 2 + 2}`,
    institution: schools[i % 6],
    secondLanguage: false,
    active: true,
  }));
  p.judges = Array.from({ length: 9 }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `示例裁判 ${i + 1}`,
    institution: "独立裁判",
    rating: 9 - (i % 5),
    active: true,
    workTask: "Round 1-5",
    workTime: "",
    conflictInstitutions: [],
    conflictTeams: [],
  }));
  p.venues = ["C107", "C110", "C128"].map((name) => ({
    id: crypto.randomUUID(),
    name,
    active: true,
  }));
  return p;
}
