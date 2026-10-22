import { generateRandomDraw,type DrawOptions } from "./random-draw";
self.onmessage = (
  e: MessageEvent<{
    seed: number;
    names: string[];
    mode: "random-new" | "adjusted";
    options:DrawOptions;
    institutions:string[];
  }>,
) => {
  try {
    const { seed, names, mode,options,institutions } = e.data;
    self.postMessage({
      type: "result",
      data: generateRandomDraw(seed, names, mode, (progress) =>self.postMessage({ type: "progress", progress }),options,institutions),
    });
  } catch (e) {
    self.postMessage({
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  }
};
