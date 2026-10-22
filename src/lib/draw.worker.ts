import { generateJointRandomDraw } from './joint-random-draw';
import type { Project } from './types';
import { type DrawOptions } from "./random-draw";
self.onmessage = (
  e: MessageEvent<{
    seed: number;
    names: string[];
    mode: "random-new";
    options:DrawOptions;
    institutions:string[];
    project:Project;
  }>,
) => {
  try {
    const { seed, names, mode,options,institutions,project } = e.data;
    self.postMessage({
      type: "result",
      data: generateJointRandomDraw(seed, names, mode, (progress) =>self.postMessage({ type: "progress", progress }),options,institutions,project),
    });
  } catch (e) {
    self.postMessage({
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  }
};
