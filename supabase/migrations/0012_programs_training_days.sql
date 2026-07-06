-- Add training_days to programs so custom-created routines remember their schedule.
alter table programs add column if not exists training_days text default '[]';
