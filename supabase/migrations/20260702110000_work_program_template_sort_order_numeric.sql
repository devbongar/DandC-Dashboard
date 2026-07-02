-- Allow fractional sort_order values so new tasks can be inserted between
-- existing ones without resequencing (e.g. inserting at 13.5 between 13 and 14).
ALTER TABLE work_program_template_tasks ALTER COLUMN sort_order TYPE NUMERIC;
