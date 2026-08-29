-- Date of birth — collected at onboarding, never shown to other users
-- directly (only used for the account's own age-gating/verification
-- purposes down the line); RLS on profiles already restricts UPDATE
-- to the row's own owner via existing policies, so this doesn't need
-- a new one, just the column.
alter table public.profiles
    add column if not exists date_of_birth date;
