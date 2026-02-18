# 既存スキーマ一覧

現在のマイグレーションファイルで定義されているテーブル・バケットの一覧。
**全テーブルは `lincoln` スキーマに格納**（OTAlogin の `public` スキーマと分離）。

## スキーマ

- `lincoln` — Lincoln Price Reflected 専用スキーマ
- `public` — OTAlogin 用（既存、触らない）

## マイグレーションファイル

| ファイル | 内容 |
|---------|------|
| `20260218000001_facilities.sql` | lincoln スキーマ作成, facilities, facility_aliases, update_updated_at_column() |
| `20260218000002_jobs.sql` | jobs, job_steps, artifacts |
| `20260218000003_plans.sql` | plan_groups, plans, job_expected_ranks |
| `20260218000004_storage.sql` | Storage バケット (lincoln-excel-uploads, lincoln-artifacts) |

## テーブル構造

### facilities

| カラム | 型 | 制約 |
|--------|-----|------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| lincoln_id | VARCHAR(10) | UNIQUE NOT NULL |
| name | TEXT | NOT NULL |
| active | BOOLEAN | NOT NULL DEFAULT TRUE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() (トリガー) |

### facility_aliases

| カラム | 型 | 制約 |
|--------|-----|------|
| id | UUID | PK |
| facility_id | UUID | FK → facilities(id) ON DELETE CASCADE |
| alias | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

UNIQUE(facility_id, alias)

### jobs

| カラム | 型 | 制約 |
|--------|-----|------|
| id | UUID | PK |
| facility_id | UUID | FK → facilities(id) NOT NULL |
| status | TEXT | NOT NULL DEFAULT 'PENDING', CHECK (PENDING\|RUNNING\|SUCCESS\|FAILED\|CANCELLED) |
| last_completed_step | TEXT | CHECK (NULL\|PARSE\|STEPA\|STEP0\|STEPB\|STEPC\|DONE) |
| excel_file_path | TEXT | |
| excel_original_name | TEXT | |
| stay_type | TEXT | CHECK (NULL\|A\|B) |
| target_period_from | DATE | |
| target_period_to | DATE | |
| summary_json | JSONB | |
| result_json | JSONB | |
| retry_count | INTEGER | NOT NULL DEFAULT 3 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() (トリガー) |

### job_steps

| カラム | 型 | 制約 |
|--------|-----|------|
| id | UUID | PK |
| job_id | UUID | FK → jobs(id) ON DELETE CASCADE NOT NULL |
| step | TEXT | NOT NULL, CHECK (PARSE\|STEPA\|STEP0\|STEPB\|STEPC) |
| status | TEXT | NOT NULL DEFAULT 'PENDING', CHECK (PENDING\|RUNNING\|SUCCESS\|FAILED) |
| attempt | INTEGER | NOT NULL DEFAULT 1 |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| error_message | TEXT | |
| metadata_json | JSONB | |

### artifacts

| カラム | 型 | 制約 |
|--------|-----|------|
| id | UUID | PK |
| job_id | UUID | FK → jobs(id) ON DELETE CASCADE NOT NULL |
| step | TEXT | NOT NULL |
| type | TEXT | NOT NULL, CHECK (screenshot\|html\|network_log\|verification_csv) |
| storage_path | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### plan_groups

| カラム | 型 | 制約 |
|--------|-----|------|
| id | UUID | PK |
| facility_id | UUID | FK → facilities(id) ON DELETE CASCADE NOT NULL |
| name | TEXT | NOT NULL |
| lincoln_id | TEXT | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### plans

| カラム | 型 | 制約 |
|--------|-----|------|
| id | UUID | PK |
| plan_group_id | UUID | FK → plan_groups(id) ON DELETE CASCADE NOT NULL |
| name | TEXT | NOT NULL |
| lincoln_id | TEXT | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

### job_expected_ranks

| カラム | 型 | 制約 |
|--------|-----|------|
| id | UUID | PK |
| job_id | UUID | FK → jobs(id) ON DELETE CASCADE NOT NULL |
| date | DATE | NOT NULL |
| room_type | TEXT | NOT NULL |
| rank_code | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

## Storage バケット

| バケット | public | 用途 |
|---------|--------|------|
| lincoln-excel-uploads | false | Excel アップロード |
| lincoln-artifacts | false | スクショ・ログ等の成果物 |

## RLS パターン

全テーブル共通:

```sql
-- authenticated ユーザーは SELECT のみ
CREATE POLICY "authenticated read <table>"
  ON lincoln.<table> FOR SELECT TO authenticated USING (true);

-- service_role は全操作可能
CREATE POLICY "service_role all <table>"
  ON lincoln.<table> FOR ALL TO service_role USING (true) WITH CHECK (true);
```

## インデックス

| テーブル | インデックス | カラム |
|---------|------------|--------|
| facilities | idx_facilities_lincoln_id | lincoln_id |
| facility_aliases | idx_facility_aliases_alias | alias |
| jobs | idx_jobs_facility_id | facility_id |
| jobs | idx_jobs_status | status |
| jobs | idx_jobs_created_at | created_at DESC |
| job_steps | idx_job_steps_job_id | job_id |
| artifacts | idx_artifacts_job_id | job_id |
| plan_groups | idx_plan_groups_facility_id | facility_id |
| plans | idx_plans_plan_group_id | plan_group_id |
| job_expected_ranks | idx_job_expected_ranks_job_id | job_id |

## 共通トリガー関数

```sql
CREATE OR REPLACE FUNCTION lincoln.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

使用テーブル: facilities, jobs
