-- sql/03_add_extra_obs_to_checklist_responses.sql
-- Adds the extra_obs column to store additional checklist comments
alter table checklist_responses
  add column if not exists extra_obs text;
