-- Seed: 9 施設 + エイリアス (lincoln スキーマ)
-- Reference: docs/requirements.md §5
-- ON CONFLICT DO NOTHING で冪等に実行可能

-- ============================================================
-- 施設マスタ
-- ============================================================
INSERT INTO lincoln.facilities (lincoln_id, name) VALUES
  ('I38347', 'アクアパレス北谷'),
  ('D88689', 'プライベートコンド古宇利島'),
  ('G49445', 'プールヴィラ古宇利島'),
  ('F02223', 'ミュージックホテルコザ'),
  ('O85848', 'ジョイントホーム 那覇'),
  ('P05894', 'プールヴィラ 今泊'),
  ('Y77131', '畳の宿 那覇壺屋'),
  ('F63659', 'プールヴィラ 屋我地島'),
  ('F25555', 'プライベートコンド北谷 ジャーガル')
ON CONFLICT (lincoln_id) DO NOTHING;

-- ============================================================
-- エイリアス（施設名そのもの = 正式名称）
-- ============================================================
INSERT INTO lincoln.facility_aliases (facility_id, alias)
SELECT id, name FROM lincoln.facilities
ON CONFLICT (facility_id, alias) DO NOTHING;

-- ============================================================
-- エイリアス（スペースなし変形 — Excel ファイル名揺れ吸収用）
-- ============================================================
INSERT INTO lincoln.facility_aliases (facility_id, alias)
SELECT id, 'ジョイントホーム那覇'
FROM lincoln.facilities WHERE lincoln_id = 'O85848'
ON CONFLICT (facility_id, alias) DO NOTHING;

INSERT INTO lincoln.facility_aliases (facility_id, alias)
SELECT id, 'プールヴィラ今泊'
FROM lincoln.facilities WHERE lincoln_id = 'P05894'
ON CONFLICT (facility_id, alias) DO NOTHING;

INSERT INTO lincoln.facility_aliases (facility_id, alias)
SELECT id, '畳の宿那覇壺屋'
FROM lincoln.facilities WHERE lincoln_id = 'Y77131'
ON CONFLICT (facility_id, alias) DO NOTHING;

INSERT INTO lincoln.facility_aliases (facility_id, alias)
SELECT id, '畳の宿'
FROM lincoln.facilities WHERE lincoln_id = 'Y77131'
ON CONFLICT (facility_id, alias) DO NOTHING;

INSERT INTO lincoln.facility_aliases (facility_id, alias)
SELECT id, 'プールヴィラ屋我地島'
FROM lincoln.facilities WHERE lincoln_id = 'F63659'
ON CONFLICT (facility_id, alias) DO NOTHING;

INSERT INTO lincoln.facility_aliases (facility_id, alias)
SELECT id, 'プライベートコンド北谷ジャーガル'
FROM lincoln.facilities WHERE lincoln_id = 'F25555'
ON CONFLICT (facility_id, alias) DO NOTHING;
