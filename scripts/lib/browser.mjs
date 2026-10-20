// Безголовый браузер (Edge или Chrome, уже установленные в системе) для проверки рендера — без npm-пакетов.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const CANDIDATES = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter(Boolean);

export const findBrowser = () => CANDIDATES.find((p) => fs.existsSync(p)) || null;

export const MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js";

/**
 * Открыть страницу, дождаться скриптов и вернуть объект, который страница положила в `RESULT:{…}`.
 * null — браузера нет; {error} — страница не отдала результат (нет сети для CDN, ошибка скрипта).
 */
export function runPage(file, { width = 1280, height = 800, budgetMs = 20000, query = "" } = {}) {
  const browser = findBrowser();
  if (!browser) return null;
  const profile = path.join(os.tmpdir(), "petrovich-analytics-headless");
  const url = pathToFileURL(path.resolve(file)).href + query;
  const r = spawnSync(
    browser,
    ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`, `--virtual-time-budget=${budgetMs}`, "--dump-dom", url],
    { encoding: "utf8", timeout: budgetMs + 40000, maxBuffer: 64 * 1024 * 1024 },
  );
  const m = (r.stdout || "").match(/RESULT:(\{.*?\})<\/pre>/s);
  if (!m) return { error: "страница не вернула результат: нет сети для CDN или ошибка скрипта" };
  try {
    return JSON.parse(m[1].replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
  } catch (e) {
    return { error: `не разобрать результат: ${e.message}` };
  }
}
