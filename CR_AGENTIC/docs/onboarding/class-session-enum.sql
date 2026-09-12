-- Add class_session to study_plan_events.type enum (Postgres).
-- Run against the main Course Rep database when deploying timetable sync.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'study_plan_events_type_enum'
      AND e.enumlabel = 'class_session'
  ) THEN
    ALTER TYPE study_plan_events_type_enum ADD VALUE 'class_session';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- Enum name may differ by TypeORM naming; try common alternate.
    BEGIN
      ALTER TYPE study_plan_event_type_enum ADD VALUE IF NOT EXISTS 'class_session';
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'Could not alter study plan event enum automatically; add class_session manually.';
    END;
END $$;
