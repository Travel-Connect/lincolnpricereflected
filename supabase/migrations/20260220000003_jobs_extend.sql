-- Migration: jobs テーブル拡張
-- exec_mode, environment, config_json カラム追加 + status に AWAITING_2FA 追加

-- execution_mode: A_only (カレンダーのみ), B_only (一括のみ), A_and_B (両方)
ALTER TABLE lincoln.jobs
  ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'A_and_B'
    CHECK (execution_mode IN ('A_only', 'B_only', 'A_and_B'));

-- environment: 本番 or 検証
ALTER TABLE lincoln.jobs
  ADD COLUMN environment TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'staging'));

-- config_json: ジョブ実行時の設定スナップショット
-- (カレンダー名, プラングループセット, 出力プラン, 部屋タイプマッピング等)
ALTER TABLE lincoln.jobs
  ADD COLUMN config_json JSONB;

-- status に AWAITING_2FA を追加
ALTER TABLE lincoln.jobs DROP CONSTRAINT jobs_status_check;
ALTER TABLE lincoln.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED', 'AWAITING_2FA'));
