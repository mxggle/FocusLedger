-- Removes the showcase "My Day" seed (2026-05-29). Reverses seed-demo-day.mjs.
-- Apply with:
--   sqlite3 "$HOME/Library/Application Support/com.yolo.desktop/yolo.db" < scripts/clean-demo-day.sql
BEGIN;
DELETE FROM time_entries WHERE id LIKE 'demo-%';
DELETE FROM tasks WHERE id LIKE 'demo-%';
DELETE FROM daily_debriefs WHERE date = '2026-05-29';
COMMIT;
