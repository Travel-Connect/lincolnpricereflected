/**
 * Review Pack Generator
 *
 * ChatGPT にレビュー依頼するための証跡一式を生成する。
 *
 * Usage:
 *   npx tsx scripts/review-pack/generate.ts --latest
 *   npx tsx scripts/review-pack/generate.ts --job-id <uuid>
 *   npx tsx scripts/review-pack/generate.ts --latest --include-artifacts all
 */

import { config } from "dotenv";
import { resolve, join, relative, basename, extname } from "path";
import {
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "fs";
import { execSync } from "child_process";

// ── Constants ──────────────────────────────────────────────────
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const PROJECT_ROOT = resolve(__dirname, "..", "..");
config({ path: resolve(PROJECT_ROOT, ".env") });

const OUTPUT_BASE = resolve(PROJECT_ROOT, "data", "review-packs");

/** Files / patterns that must NEVER be included */
const FORBIDDEN_PATTERNS = [
  /\.env/i,
  /secret/i,
  /cookie/i,
  /token/i,
  /credential/i,
  /\.pem$/i,
  /\.key$/i,
  /service.role/i,
  /lincoln.session/i,
  /chrome-profile/i,
];

/** File extensions considered unsafe in "safe" mode */
const UNSAFE_EXTENSIONS = [".html", ".jsonl"]; // HTML dumps, network logs

// ── CLI Args ───────────────────────────────────────────────────
interface CliArgs {
  jobId?: string;
  latest: boolean;
  withUiScreens: boolean;
  includeArtifacts: "safe" | "all" | "none";
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    latest: false,
    withUiScreens: false,
    includeArtifacts: "safe",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--job-id":
        if (i + 1 >= args.length) { console.error("--job-id requires a value"); process.exit(1); }
        result.jobId = args[++i];
        break;
      case "--latest":
        result.latest = true;
        break;
      case "--with-ui-screens":
        result.withUiScreens = true;
        break;
      case "--include-artifacts": {
        if (i + 1 >= args.length) { console.error("--include-artifacts requires a value"); process.exit(1); }
        const val = args[++i];
        if (!["safe", "all", "none"].includes(val)) {
          console.error(`--include-artifacts must be safe|all|none (got: ${val})`);
          process.exit(1);
        }
        result.includeArtifacts = val as "safe" | "all" | "none";
        break;
      }
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
    }
  }

  if (!result.jobId && !result.latest) {
    printUsage();
    process.exit(1);
  }

  return result;
}

function printUsage(): void {
  console.log(`Usage:
  npx tsx scripts/review-pack/generate.ts --latest
  npx tsx scripts/review-pack/generate.ts --job-id <uuid>

Options:
  --job-id <uuid>           指定ジョブを対象
  --latest                  最新の成功ジョブ（なければ最新ジョブ）
  --with-ui-screens         UIスクリーンショットフォルダを準備
  --include-artifacts <mode>  safe(default)|all|none`);
}

// ── Path Safety ────────────────────────────────────────────────
function assertInsideProject(p: string): void {
  const resolved = resolve(p);
  // Windows: case-insensitive NTFS — compare lowercased paths
  const norm = resolved.toLowerCase();
  const normRoot = PROJECT_ROOT.toLowerCase();
  if (!norm.startsWith(normRoot)) {
    throw new Error(
      `[SECURITY] Path is outside project root: ${resolved}\n` +
        `  Project root: ${PROJECT_ROOT}`,
    );
  }
}

function isForbiddenPath(p: string): boolean {
  const name = basename(p).toLowerCase();
  const rel = relative(PROJECT_ROOT, p).toLowerCase();
  return FORBIDDEN_PATTERNS.some((re) => re.test(name) || re.test(rel));
}

// ── Supabase Client ────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { db: { schema: "lincoln" } });
}

// ── Redaction Tracker ──────────────────────────────────────────
class RedactionTracker {
  private entries: { path: string; reason: string }[] = [];

  add(path: string, reason: string): void {
    this.entries.push({ path, reason });
  }

  get count(): number {
    return this.entries.length;
  }

  toMarkdown(): string {
    const lines = [
      "# Redactions Report",
      "",
      `生成日時: ${new Date().toISOString()}`,
      `除外件数: ${this.entries.length}`,
      "",
      "## 除外一覧",
      "",
      "| パス | 理由 |",
      "|------|------|",
    ];
    for (const e of this.entries) {
      lines.push(`| \`${e.path}\` | ${e.reason} |`);
    }
    if (this.entries.length === 0) {
      lines.push("| (なし) | — |");
    }
    return lines.join("\n") + "\n";
  }
}

// ── Git Info ───────────────────────────────────────────────────
function getGitInfo(): { branch: string; commit: string; dirty: boolean } {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
    }).trim();
    const commit = execSync("git rev-parse --short HEAD", {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
    }).trim();
    const status = execSync("git status --porcelain", {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
    }).trim();
    return { branch, commit, dirty: status.length > 0 };
  } catch (e) {
    console.warn(`[review-pack] Git info unavailable: ${e instanceof Error ? e.message : e}`);
    return { branch: "unknown", commit: "unknown", dirty: false };
  }
}

function getVersions(): { os: string; node: string; npm: string } {
  const os = `${process.platform} ${process.arch}`;
  const node = process.version;
  let npm = "unknown";
  try {
    npm = execSync("npm --version", { encoding: "utf-8" }).trim();
  } catch {}
  return { os, node, npm };
}

// ── Manifest ───────────────────────────────────────────────────
function writeManifest(
  outDir: string,
  args: CliArgs,
  jobId: string | null,
): void {
  const git = getGitInfo();
  const versions = getVersions();
  const manifest = {
    schema_version: "1",
    generated_at: new Date().toISOString(),
    generator: "scripts/review-pack/generate.ts",
    git,
    versions,
    options: {
      job_id: jobId,
      latest: args.latest,
      with_ui_screens: args.withUiScreens,
      include_artifacts: args.includeArtifacts,
    },
    machine: process.env.COMPUTERNAME || "unknown",
  };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("[review-pack] manifest.json 生成");
}

// ── Docs Snapshot ──────────────────────────────────────────────
function copyDocs(outDir: string, redactions: RedactionTracker): void {
  const docsDir = join(outDir, "docs");
  mkdirSync(docsDir, { recursive: true });

  const docFiles = [
    "docs/requirements.md",
    "docs/design.md",
    "docs/selectors_catalog.md",
    "docs/wbs.md",
    "docs/runbook.md",
  ];

  for (const rel of docFiles) {
    const src = resolve(PROJECT_ROOT, rel);
    if (existsSync(src)) {
      if (isForbiddenPath(src)) {
        redactions.add(rel, "機密パターンに一致");
        continue;
      }
      try {
        copyFileSync(src, join(docsDir, basename(rel)));
        console.log(`[review-pack] docs/${basename(rel)} コピー`);
      } catch (e) {
        redactions.add(rel, `コピー失敗: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // CLAUDE.md — check for secrets before including
  const claudeMdPath = resolve(PROJECT_ROOT, ".claude", "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, "utf-8");
    if (/\bservice[_-]?role|\bpassword\b|\bsecret[_-]?key|\bapi[_-]?key/i.test(content)) {
      redactions.add("CLAUDE.md", "機密キーワードを検出");
    } else {
      copyFileSync(claudeMdPath, join(docsDir, "CLAUDE.md"));
      console.log("[review-pack] docs/CLAUDE.md コピー");
    }
  }
}

// ── Config Snapshot ────────────────────────────────────────────
function copyConfig(outDir: string, redactions: RedactionTracker): void {
  const configDir = join(outDir, "config");
  mkdirSync(configDir, { recursive: true });

  const configPath = resolve(PROJECT_ROOT, "config");
  if (!existsSync(configPath)) return;

  const files = readdirSync(configPath).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const src = join(configPath, f);
    if (isForbiddenPath(src)) {
      redactions.add(`config/${f}`, "機密パターンに一致");
      continue;
    }
    copyFileSync(src, join(configDir, f));
    console.log(`[review-pack] config/${f} コピー`);
  }
}

// ── System Snapshot ────────────────────────────────────────────
function generateSystemSnapshot(outDir: string): void {
  const sysDir = join(outDir, "system_snapshot");
  mkdirSync(sysDir, { recursive: true });

  // 1. routes.txt — App Router route enumeration
  generateRoutes(sysDir);

  // 2. api_endpoints.md
  generateApiEndpoints(sysDir);

  // 3. db_schema_summary.md
  generateDbSchema(sysDir);

  console.log("[review-pack] system_snapshot/ 生成");
}

function generateRoutes(sysDir: string): void {
  const appDir = resolve(PROJECT_ROOT, "apps", "web", "src", "app");
  if (!existsSync(appDir)) {
    writeFileSync(join(sysDir, "routes.txt"), "# apps/web not found\n");
    return;
  }

  const routes: string[] = [];

  function walk(dir: string, routePrefix: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        let segment = entry.name;
        // Route groups: (dashboard) → skip from URL
        if (segment.startsWith("(") && segment.endsWith(")")) {
          walk(full, routePrefix);
          continue;
        }
        walk(full, `${routePrefix}/${segment}`);
      } else if (
        entry.name === "page.tsx" ||
        entry.name === "page.ts"
      ) {
        routes.push(`PAGE  ${routePrefix || "/"}`);
      } else if (
        entry.name === "route.ts" ||
        entry.name === "route.tsx"
      ) {
        routes.push(`API   ${routePrefix || "/"}`);
      } else if (entry.name === "layout.tsx" || entry.name === "layout.ts") {
        routes.push(`LAYOUT ${routePrefix || "/"}`);
      }
    }
  }

  walk(appDir, "");
  routes.sort();
  writeFileSync(
    join(sysDir, "routes.txt"),
    "# Next.js App Router Routes\n# Generated by review-pack\n\n" +
      routes.join("\n") +
      "\n",
  );
}

function generateApiEndpoints(sysDir: string): void {
  const appDir = resolve(PROJECT_ROOT, "apps", "web", "src", "app");
  const lines = [
    "# API Endpoints",
    "",
    "Next.js App Router の route.ts からの一覧:",
    "",
  ];

  if (!existsSync(appDir)) {
    lines.push("(apps/web not found)");
    writeFileSync(join(sysDir, "api_endpoints.md"), lines.join("\n") + "\n");
    return;
  }

  // Also scan server actions
  const actionFiles: string[] = [];
  function findActions(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        findActions(full);
      } else if (entry.name === "actions.ts" || entry.name === "actions.tsx") {
        const rel = relative(
          resolve(PROJECT_ROOT, "apps", "web", "src"),
          full,
        );
        actionFiles.push(rel);
      }
    }
  }
  findActions(appDir);

  if (actionFiles.length > 0) {
    lines.push("## Server Actions");
    lines.push("");
    for (const f of actionFiles) {
      lines.push(`- \`${f}\``);
      // Read and extract exported function names (named async exports only)
      try {
        const content = readFileSync(
          resolve(PROJECT_ROOT, "apps", "web", "src", f),
          "utf-8",
        );
        const matches = content.matchAll(
          /export\s+async\s+function\s+(\w+)/g,
        );
        for (const m of matches) {
          lines.push(`  - \`${m[1]}()\``);
        }
      } catch {}
    }
    lines.push("");
  }

  lines.push("## Route Handlers");
  lines.push("");
  lines.push("- `POST /auth/callback` — Supabase OAuth コールバック");
  lines.push("");

  writeFileSync(join(sysDir, "api_endpoints.md"), lines.join("\n") + "\n");
}

function generateDbSchema(sysDir: string): void {
  const migrationsDir = resolve(PROJECT_ROOT, "supabase", "migrations");
  const lines = [
    "# Database Schema Summary",
    "",
    `スキーマ: \`lincoln\` (Supabase 共有プロジェクト)`,
    "",
    "## マイグレーション一覧",
    "",
    "| ファイル | 説明 |",
    "|---------|------|",
  ];

  if (!existsSync(migrationsDir)) {
    lines.push("| (not found) | — |");
    writeFileSync(join(sysDir, "db_schema_summary.md"), lines.join("\n") + "\n");
    return;
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const f of files) {
    // Extract a summary from filename
    const namePart = f.replace(/^\d+_/, "").replace(/\.sql$/, "");
    const humanName = namePart.replace(/_/g, " ");

    // Peek first few lines for CREATE TABLE
    try {
      const content = readFileSync(join(migrationsDir, f), "utf-8");
      const tables = content.match(/CREATE TABLE[^(]+/gi);
      const tableList = tables
        ? tables.map((t) => t.replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?/i, "").trim()).join(", ")
        : "";
      lines.push(`| \`${f}\` | ${humanName}${tableList ? ` — tables: ${tableList}` : ""} |`);
    } catch {
      lines.push(`| \`${f}\` | ${humanName} |`);
    }
  }

  // Also extract current table list from all migrations
  lines.push("");
  lines.push("## 主要テーブル");
  lines.push("");

  const allTables = new Set<string>();
  for (const f of files) {
    try {
      const content = readFileSync(join(migrationsDir, f), "utf-8");
      const matches = content.matchAll(
        /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\S+)/gi,
      );
      for (const m of matches) {
        allTables.add(m[1]);
      }
    } catch {}
  }

  for (const t of [...allTables].sort()) {
    lines.push(`- \`${t}\``);
  }

  writeFileSync(join(sysDir, "db_schema_summary.md"), lines.join("\n") + "\n");
}

// ── Job Snapshot ───────────────────────────────────────────────
async function fetchJobSnapshot(
  outDir: string,
  jobId: string | null,
  args: CliArgs,
  redactions: RedactionTracker,
): Promise<string | null> {
  if (!jobId && !args.latest) return null;

  const sb = getSupabase();
  const jobDir = join(outDir, "job_snapshot");
  mkdirSync(jobDir, { recursive: true });

  // Resolve job
  let job: Record<string, unknown> | null = null;

  if (jobId) {
    const { data, error } = await sb.from("jobs").select("*").eq("id", jobId).single();
    if (error) console.warn(`[review-pack] ジョブ取得エラー: ${error.message}`);
    job = data;
  } else {
    // Latest: prefer SUCCESS, fallback to any
    const { data: successJobs, error: e1 } = await sb
      .from("jobs")
      .select("*")
      .eq("status", "SUCCESS")
      .order("created_at", { ascending: false })
      .limit(1);
    if (e1) console.warn(`[review-pack] ジョブ検索エラー: ${e1.message}`);

    if (successJobs && successJobs.length > 0) {
      job = successJobs[0];
    } else {
      const { data: anyJobs, error: e2 } = await sb
        .from("jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      if (e2) console.warn(`[review-pack] ジョブ検索エラー: ${e2.message}`);
      if (anyJobs && anyJobs.length > 0) {
        job = anyJobs[0];
      }
    }
  }

  if (!job) {
    console.log("[review-pack] ジョブが見つかりません");
    writeFileSync(join(jobDir, "job.json"), JSON.stringify({ error: "ジョブが見つかりません" }, null, 2));
    return null;
  }

  const resolvedJobId = job.id as string;
  console.log(`[review-pack] 対象ジョブ: ${resolvedJobId} (status: ${job.status})`);

  // Redact sensitive fields from job
  const safeJob = { ...job };
  const sensitiveJobFields = ["config_json"];
  // config_json may contain plan data (safe) but review for safety
  if (safeJob.config_json && typeof safeJob.config_json === "object") {
    const cfg = safeJob.config_json as Record<string, unknown>;
    // Remove any fields that look like credentials
    for (const key of Object.keys(cfg)) {
      if (/password|secret|token|credential/i.test(key)) {
        (cfg as Record<string, unknown>)[key] = "[REDACTED]";
        redactions.add(`job.config_json.${key}`, "機密フィールド");
      }
    }
  }
  // Remove user_id (PII)
  delete safeJob.user_id;
  redactions.add("job.user_id", "PII");

  writeFileSync(join(jobDir, "job.json"), JSON.stringify(safeJob, null, 2));

  // Job steps
  const { data: steps } = await sb
    .from("job_steps")
    .select("id,job_id,step,status,attempt,started_at,completed_at,error_message")
    .eq("job_id", resolvedJobId)
    .order("started_at", { ascending: true });

  writeFileSync(join(jobDir, "job_steps.json"), JSON.stringify(steps || [], null, 2));

  // Facility settings (patterns, mappings — UI config, not secrets)
  const facilityId = job.facility_id as string;
  if (facilityId) {
    const settings: Record<string, unknown> = {};

    const { data: calPatterns, error: e3 } = await sb
      .from("calendar_patterns")
      .select("id,facility_id,calendar_name,excel_calendar,created_at")
      .eq("facility_id", facilityId);
    if (e3) console.warn(`[review-pack] calendar_patterns 取得エラー: ${e3.message}`);
    settings.calendar_patterns = calPatterns || [];

    const { data: bPatterns, error: e4 } = await sb
      .from("process_b_patterns")
      .select("id,facility_id,copy_source,plan_group_set,created_at")
      .eq("facility_id", facilityId);
    if (e4) console.warn(`[review-pack] process_b_patterns 取得エラー: ${e4.message}`);
    settings.process_b_patterns = bPatterns || [];

    const { data: facility, error: e5 } = await sb
      .from("facilities")
      .select("id,lincoln_id,name,active")
      .eq("id", facilityId)
      .single();
    if (e5) console.warn(`[review-pack] facility 取得エラー: ${e5.message}`);
    settings.facility = facility;

    writeFileSync(
      join(jobDir, "selected_settings.json"),
      JSON.stringify(settings, null, 2),
    );
  }

  // Artifacts
  if (args.includeArtifacts !== "none") {
    const artifactSrc = resolve(PROJECT_ROOT, "data", "artifacts", `job-${resolvedJobId}`);
    if (existsSync(artifactSrc)) {
      const artifactDst = join(jobDir, "artifacts");
      mkdirSync(artifactDst, { recursive: true });

      const files = readdirSync(artifactSrc);
      for (const f of files) {
        const ext = extname(f).toLowerCase();
        const srcPath = join(artifactSrc, f);
        assertInsideProject(srcPath);

        if (isForbiddenPath(srcPath)) {
          redactions.add(`artifacts/${f}`, "機密パターンに一致");
          continue;
        }

        if (args.includeArtifacts === "safe" && UNSAFE_EXTENSIONS.includes(ext)) {
          redactions.add(`artifacts/${f}`, "safe モードで除外 (HTML/Network)");
          continue;
        }

        // Size check: skip files > 10MB
        const st = statSync(srcPath);
        if (st.size > 10 * 1024 * 1024) {
          redactions.add(`artifacts/${f}`, `ファイルサイズ超過 (${(st.size / 1024 / 1024).toFixed(1)}MB)`);
          continue;
        }

        copyFileSync(srcPath, join(artifactDst, f));
        console.log(`[review-pack] artifact: ${f}`);
      }

      if (args.includeArtifacts === "all") {
        // Add warning file
        writeFileSync(
          join(artifactDst, "_WARNING_CONTAINS_SENSITIVE_DATA.txt"),
          "このフォルダには HTML ダンプや Network ログが含まれています。\n" +
            "機密情報（Cookie、Token等）が含まれる可能性があります。\n" +
            "共有前に内容を確認してください。\n",
        );
      }
    } else {
      console.log(`[review-pack] artifact ディレクトリなし: ${artifactSrc}`);
    }
  }

  return resolvedJobId;
}

// ── Review Context ─────────────────────────────────────────────
function generateReviewContext(
  outDir: string,
  resolvedJobId: string | null,
  args: CliArgs,
): void {
  const git = getGitInfo();
  const lines = [
    "# Review Context",
    "",
    "## 概要",
    "",
    "本 Review Pack は Lincoln Price Reflected（リンカーン料金ランク自動反映ツール）の",
    "UI / システムレビュー用に自動生成された証跡一式です。",
    "",
    "## 対象",
    "",
    `- **ジョブID**: ${resolvedJobId || "(指定なし)"}`,
    `- **ブランチ**: ${git.branch} (${git.commit}${git.dirty ? ", uncommitted changes" : ""})`,
    `- **生成日時**: ${new Date().toISOString()}`,
    `- **マシン**: ${process.env.COMPUTERNAME || "unknown"}`,
    `- **Artifacts モード**: ${args.includeArtifacts}`,
    "",
    "## レビュー観点",
    "",
    "### UI レビュー",
    "",
    "- [ ] 誤操作防止: 破壊的操作（送信・実行）に確認ダイアログがあるか",
    "- [ ] 情報の優先順位: 重要情報（施設名・期間・ステータス）が目立つか",
    "- [ ] エラー表示: エラー発生時にユーザーが次に何をすべきか明確か",
    "- [ ] 再開 (resume) の分かりやすさ: 中断したジョブの再開導線は明確か",
    "- [ ] 2FA 導線: 二段階認証が必要な場合の案内は適切か",
    "- [ ] 設定パターン UX: カレンダーマッピング・処理B設定の入力は直感的か",
    "- [ ] レスポンシブ: 最小限の画面サイズでも使えるか",
    "",
    "### システムレビュー",
    "",
    "- [ ] 安全弁: 施設ID チェックの位置は適切か（意図しない施設への操作を防止）",
    "- [ ] ログ/証跡の十分性: 障害発生時に原因特定できる情報があるか",
    "- [ ] 設定の永続化: パターン設定が正しく保存・再利用されるか",
    "- [ ] 失敗時の復旧: ジョブ失敗後の状態（DB, ブラウザ, セッション）は安全か",
    "- [ ] スキーマ/バケット整合: migration と実装の型定義は一致しているか",
    "- [ ] 排他制御: target_machine による実行マシン制限は適切か",
    "- [ ] セッション管理: Cookie の有効期限、2FA トークンの扱い",
    "",
    "## 同梱ファイル一覧",
    "",
    "```",
  ];

  // List files in outDir (depth-limited to prevent infinite recursion)
  function listDir(dir: string, prefix: string, depth = 0): void {
    if (depth > 20) return;
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      if (entry.isDirectory()) {
        lines.push(`${prefix}${entry.name}/`);
        listDir(join(dir, entry.name), prefix + "  ", depth + 1);
      } else {
        lines.push(`${prefix}${entry.name}`);
      }
    }
  }

  listDir(outDir, "  ");
  lines.push("```");
  lines.push("");

  writeFileSync(join(outDir, "review_context.md"), lines.join("\n") + "\n");
  console.log("[review-pack] review_context.md 生成");
}

// ── Review Request (ChatGPT 貼り付け用) ────────────────────────
function generateReviewRequest(
  outDir: string,
  resolvedJobId: string | null,
): void {
  const templatePath = resolve(
    PROJECT_ROOT,
    "docs",
    "review",
    "chatgpt_review_prompt_template.md",
  );
  let template: string;
  if (existsSync(templatePath)) {
    template = readFileSync(templatePath, "utf-8");
  } else {
    template = getDefaultReviewTemplate();
  }

  // Replace placeholders
  const git = getGitInfo();
  const content = template
    .replace(/\{\{JOB_ID\}\}/g, resolvedJobId || "(なし)")
    .replace(/\{\{BRANCH\}\}/g, git.branch)
    .replace(/\{\{COMMIT\}\}/g, git.commit)
    .replace(/\{\{DATE\}\}/g, new Date().toISOString().split("T")[0])
    .replace(/\{\{MACHINE\}\}/g, process.env.COMPUTERNAME || "unknown");

  writeFileSync(join(outDir, "review_request.md"), content);
  console.log("[review-pack] review_request.md 生成");
}

function getDefaultReviewTemplate(): string {
  return `# Lincoln Price Reflected — レビュー依頼

## 対象
- **ジョブID**: {{JOB_ID}}
- **ブランチ**: {{BRANCH}} ({{COMMIT}})
- **日付**: {{DATE}}
- **マシン**: {{MACHINE}}

## 依頼内容

添付の Review Pack（ZIP）を確認し、以下の観点でレビューをお願いします。

### UI レビュー観点
1. **誤操作防止**: 破壊的操作（リンカーンへの送信・カレンダー更新）に確認ダイアログがあるか。undo が効かない操作に警告があるか。
2. **情報の優先順位**: 施設名・対象期間・ステータスなどの重要情報が目立つ位置にあるか。
3. **エラー表示**: エラー発生時に「次に何をすべきか」がユーザーに伝わるか。
4. **再開の分かりやすさ**: ジョブが途中で中断した場合の再開導線は明確か。
5. **2FA 導線**: 二段階認証が必要になった場合の案内は適切か。
6. **設定パターン UX**: カレンダーマッピング・処理B設定の入力は直感的で間違えにくいか。

### システムレビュー観点
1. **安全弁**: 施設IDの検証位置は適切か。意図しない施設への操作を防止できるか。
2. **ログ/証跡の十分性**: 障害発生時に原因を特定するための情報は十分か。
3. **設定の永続化**: パターン設定（カレンダーマッピング等）が正しく保存・再利用されるか。
4. **失敗時の復旧**: ジョブ失敗後のDB状態・ブラウザセッション・ファイルの整合性は保たれるか。
5. **スキーマ/バケット整合**: DBマイグレーションと TypeScript 型定義の一致。
6. **排他制御**: target_machine による実行マシン制限は適切に機能するか。

## Review Pack 構成

\`\`\`
manifest.json          — 生成メタ情報（git, バージョン, オプション）
review_context.md      — レビュー観点とファイル一覧
review_request.md      — この文書（ChatGPT貼り付け用）
docs/                  — 仕様書スナップショット
config/                — セレクタ等の設定ファイル
system_snapshot/       — ルート一覧, API一覧, DBスキーマ
job_snapshot/          — 対象ジョブの実行結果と設定
  job.json             — ジョブレコード（機密除外済み）
  job_steps.json       — ステップ実行結果
  selected_settings.json — 施設パターン設定
  artifacts/           — スクリーンショット等
redactions_report.md   — 除外/マスクした理由と件数
\`\`\`

## 注意事項
- 機密情報（.env, パスワード, API キー）は除外済みです。
- \`redactions_report.md\` で除外内容を確認できます。
`;
}

// ── UI Screens ─────────────────────────────────────────────────
function prepareUiScreensDir(outDir: string, withUiScreens: boolean): void {
  const screensDir = join(outDir, "ui_screens");
  mkdirSync(screensDir, { recursive: true });

  if (withUiScreens) {
    writeFileSync(
      join(screensDir, "README.md"),
      "# UI Screenshots\n\n" +
        "このフォルダには Web UI の画面スクリーンショットが格納されます。\n\n" +
        "## 自動取得方法\n\n" +
        "```bash\n" +
        "# apps/web を起動した状態で:\n" +
        "npx tsx scripts/review-pack/capture-ui.ts --output <このフォルダのパス>\n" +
        "```\n\n" +
        "## 手動格納\n\n" +
        "Playwright による自動取得が難しい場合は、\n" +
        "手動でスクリーンショットをこのフォルダに保存してください。\n\n" +
        "### 推奨画面\n" +
        "- `01_login.png` — ログイン画面\n" +
        "- `02_job_new_step1.png` — 新規ジョブ: ファイルアップロード\n" +
        "- `03_job_new_step2.png` — 新規ジョブ: 処理B設定\n" +
        "- `04_job_new_step3.png` — 新規ジョブ: 最終確認\n" +
        "- `05_job_detail_running.png` — ジョブ詳細: 実行中\n" +
        "- `06_job_detail_success.png` — ジョブ詳細: 成功\n" +
        "- `07_history.png` — 実行履歴\n" +
        "- `08_settings.png` — 設定\n",
    );
    console.log("[review-pack] ui_screens/ 準備 (手動格納用 README 付き)");
  }
}

// ── ZIP Script ─────────────────────────────────────────────────
function generateZipScript(outDir: string): void {
  const packName = basename(outDir);
  const psContent = `# Review Pack ZIP 生成スクリプト
# 実行: powershell -ExecutionPolicy Bypass -File create-zip.ps1

$packDir = $PSScriptRoot
$zipName = "${packName}.zip"
$zipPath = Join-Path (Split-Path $packDir -Parent) $zipName

if (Test-Path $zipPath) { Remove-Item $zipPath }

Add-Type -AssemblyName System.IO.Compression.FileSystem

# Exclude this script itself and any existing zips
$tempDir = Join-Path $env:TEMP "review-pack-temp-$(Get-Random)"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

Get-ChildItem $packDir -Recurse |
  Where-Object { $_.Name -ne "create-zip.ps1" -and $_.Extension -ne ".zip" } |
  ForEach-Object {
    $rel = $_.FullName.Substring($packDir.Length + 1)
    $dest = Join-Path $tempDir $rel
    $destDir = Split-Path $dest -Parent
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    if (-not $_.PSIsContainer) { Copy-Item $_.FullName $dest }
  }

[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)
Remove-Item $tempDir -Recurse -Force

Write-Host "ZIP created: $zipPath" -ForegroundColor Green
`;

  writeFileSync(join(outDir, "create-zip.ps1"), psContent);
  console.log("[review-pack] create-zip.ps1 生成");
}

// ── Main ───────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs();
  const redactions = new RedactionTracker();

  // Generate output directory
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const outDir = resolve(OUTPUT_BASE, timestamp);

  // Safety: verify output is inside project
  assertInsideProject(outDir);

  mkdirSync(outDir, { recursive: true });
  console.log(`\n[review-pack] 出力先: ${outDir}\n`);

  // 1. Manifest
  writeManifest(outDir, args, args.jobId || null);

  // 2. Docs snapshot
  copyDocs(outDir, redactions);

  // 3. Config snapshot
  copyConfig(outDir, redactions);

  // 4. System snapshot
  generateSystemSnapshot(outDir);

  // 5. Job snapshot (async — DB access)
  const resolvedJobId = await fetchJobSnapshot(
    outDir,
    args.jobId || null,
    args,
    redactions,
  );

  // 6. Review context (after job data is available)
  generateReviewContext(outDir, resolvedJobId, args);

  // 7. Review request (ChatGPT 貼り付け用)
  generateReviewRequest(outDir, resolvedJobId);

  // 8. UI screens directory
  prepareUiScreensDir(outDir, args.withUiScreens);

  // 9. Redactions report
  writeFileSync(join(outDir, "redactions_report.md"), redactions.toMarkdown());
  console.log(`[review-pack] redactions_report.md 生成 (${redactions.count} 件除外)`);

  // 10. ZIP script
  generateZipScript(outDir);

  // Final security check: scan output for forbidden patterns
  console.log("\n[review-pack] 機密チェック実行中...");
  let securityIssues = 0;
  function scanForSecrets(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        scanForSecrets(full);
        continue;
      }
      // Check filename
      if (isForbiddenPath(full)) {
        console.error(`  [WARN] 禁止パターンのファイル: ${relative(outDir, full)}`);
        securityIssues++;
      }
      // Check content of text files for common secrets
      if (
        entry.name.endsWith(".json") ||
        entry.name.endsWith(".md") ||
        entry.name.endsWith(".txt")
      ) {
        try {
          const content = readFileSync(full, "utf-8");
          // JWT pattern: three base64url segments separated by dots
          if (/ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(content)) {
            console.error(`  [WARN] JWT トークン検出: ${relative(outDir, full)}`);
            securityIssues++;
          }
          // Supabase key patterns
          if (/SUPABASE_SERVICE_ROLE_KEY\s*[:=]/.test(content) || /\bsbp_[a-zA-Z0-9]{20,}/.test(content)) {
            console.error(
              `  [WARN] Service Role Key / Supabase Key 検出: ${relative(outDir, full)}`,
            );
            securityIssues++;
          }
        } catch {}
      }
    }
  }
  scanForSecrets(outDir);

  if (securityIssues > 0) {
    console.error(
      `\n[review-pack] ⚠ ${securityIssues} 件のセキュリティ警告があります。確認してください。`,
    );
  } else {
    console.log("[review-pack] ✓ 機密チェック OK");
  }

  console.log(`\n[review-pack] ✓ Review Pack 生成完了`);
  console.log(`  出力先: ${outDir}`);
  console.log(
    `  ZIP化:  cd "${outDir}" && powershell -ExecutionPolicy Bypass -File create-zip.ps1`,
  );
  console.log("");
}

main().catch((err) => {
  console.error("[review-pack] エラー:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
