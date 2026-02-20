import {
  HelpCircle,
  Upload,
  Building2,
  Calendar,
  ListChecks,
  ShieldCheck,
  Play,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";

const workflowSteps = [
  { icon: Upload, title: "Excel アップロード", desc: "料金ランク変動案の Excel ファイルをアップロード" },
  { icon: Building2, title: "施設 ID 確認", desc: "リンカーンの施設 ID が正しいか検証" },
  { icon: Calendar, title: "カレンダーマッピング", desc: "Excel のカレンダー名とリンカーンのカレンダーを紐付け" },
  { icon: ListChecks, title: "プラン選択", desc: "処理 B で使用するプラングループセットを選択" },
  { icon: ShieldCheck, title: "実行前確認", desc: "設定内容の最終確認とリトライ回数の指定" },
  { icon: Play, title: "ジョブ実行", desc: "自動処理を開始し、完了まで監視" },
];

const faqItems = [
  {
    q: "2FA（二段階認証）が求められたらどうすればいいですか？",
    a: "Runner のブラウザウィンドウに 2FA のコード入力画面が表示されます。ブラウザ上で直接コードを入力してください。Web UI には「2FA 待ち」の通知バナーが表示され、認証完了後に自動的に処理が再開されます。",
  },
  {
    q: "検証（STEPC）で不一致が出た場合はどうすればいいですか？",
    a: "ジョブ詳細画面でどの日付・部屋タイプに差異があるか確認できます。入力 Excel の内容が正しいか確認し、必要に応じて Excel を修正してからジョブを再実行してください。",
  },
  {
    q: "失敗したジョブを途中から再開できますか？",
    a: "はい。ジョブ詳細画面の「再開」ボタンを押すと、最後に成功したステップの次から再開できます。例えば STEP0 まで成功して STEPB で失敗した場合、STEPB から再開されます。",
  },
  {
    q: "単泊（A）と連泊（B）のカレンダーはどう判定されますか？",
    a: "Excel ファイル名またはシート名に含まれるキーワード（「単泊」「連泊」等）で自動判定されます。判定できない場合はジョブ作成時に手動で選択します。",
  },
  {
    q: "本番と検証の違いは何ですか？",
    a: "検証モードではテスト用のプラングループセット（「カレンダーテスト」等）のみを対象とします。本番モードでは実際のプラングループセットに反映されます。本番実行時は十分にご確認ください。",
  },
];

export default function HelpPage() {
  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <HelpCircle className="size-5 text-slate-600" />
        <h1 className="text-lg font-semibold">ヘルプ</h1>
      </div>

      {/* Workflow */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">ワークフロー</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workflowSteps.map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              className="rounded-lg border bg-white p-4 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                  {i + 1}
                </span>
                <Icon className="size-4 text-slate-500" />
                <span className="text-sm font-medium">{title}</span>
              </div>
              <p className="text-xs text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Important Notes */}
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
          <AlertTriangle className="size-4" />
          重要な注意事項
        </div>
        <ul className="space-y-1 text-xs text-amber-700">
          <li>
            ・検証（STEPC）は厳密な突合を行います。1 セルでも不一致があるとジョブは失敗として扱われます。
          </li>
          <li>
            ・本番モードで実行する前に、必ず検証モードでテスト実行を行ってください。
          </li>
          <li>
            ・2FA 認証中は Runner のブラウザウィンドウを閉じないでください。
          </li>
        </ul>
      </section>

      {/* FAQ */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          よくある質問
        </h2>
        <div className="space-y-2">
          {faqItems.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-lg border bg-white"
            >
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-slate-800">
                {q}
                <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t px-4 py-3 text-xs text-slate-600 leading-relaxed">
                {a}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
