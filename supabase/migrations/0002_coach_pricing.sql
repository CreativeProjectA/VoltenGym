-- Adds pricing/availability fields so coaches can be listed with a price
-- in the "elige tu entrenador" screen, and lets a member hire one.

alter table coach_profiles
  add column if not exists monthly_price numeric,
  add column if not exists available_hours text;

-- Member can update their own coach_id (hire/replace their trainer).
-- (member_profiles_write_own policy from 0001_init.sql already covers this
-- since it allows ALL on rows where profile_id = auth.uid().)
