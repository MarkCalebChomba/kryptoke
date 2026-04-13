-- 017_gamification.sql
-- XP events, badges, levels view, leaderboard support

-- XP event log
CREATE TABLE IF NOT EXISTS user_xp_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid          UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  xp           INT  NOT NULL CHECK (xp > 0),
  reference_id TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xp_events_uid_created ON user_xp_events (uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_events_type ON user_xp_events (event_type);

-- Badges earned
CREATE TABLE IF NOT EXISTS user_badges (
  uid        UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  badge_id   TEXT NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (uid, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_badges_uid ON user_badges (uid);

-- Level view — read live totals
CREATE OR REPLACE VIEW user_levels AS
SELECT
  uid,
  SUM(xp)::INT AS total_xp,
  CASE
    WHEN SUM(xp) >= 50000 THEN 'Diamond'
    WHEN SUM(xp) >= 10000 THEN 'Platinum'
    WHEN SUM(xp) >= 2000  THEN 'Gold'
    WHEN SUM(xp) >= 500   THEN 'Silver'
    ELSE 'Bronze'
  END AS level
FROM user_xp_events
GROUP BY uid;

-- Weekly leaderboard view (last 7 days)
CREATE OR REPLACE VIEW xp_leaderboard_weekly AS
SELECT
  u.uid,
  u.display_name,
  COALESCE(SUM(e.xp), 0)::INT AS weekly_xp,
  RANK() OVER (ORDER BY COALESCE(SUM(e.xp), 0) DESC) AS rank
FROM users u
LEFT JOIN user_xp_events e
  ON e.uid = u.uid AND e.created_at >= NOW() - INTERVAL '7 days'
GROUP BY u.uid, u.display_name;

-- Alltime leaderboard view
CREATE OR REPLACE VIEW xp_leaderboard_alltime AS
SELECT
  u.uid,
  u.display_name,
  COALESCE(SUM(e.xp), 0)::INT AS total_xp,
  RANK() OVER (ORDER BY COALESCE(SUM(e.xp), 0) DESC) AS rank
FROM users u
LEFT JOIN user_xp_events e ON e.uid = u.uid
GROUP BY u.uid, u.display_name;

-- RLS
ALTER TABLE user_xp_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "xp_read_own" ON user_xp_events;
CREATE POLICY "xp_read_own" ON user_xp_events
  FOR SELECT USING (get_app_uid() = uid);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "badges_read_own" ON user_badges;
CREATE POLICY "badges_read_own" ON user_badges
  FOR SELECT USING (get_app_uid() = uid);
