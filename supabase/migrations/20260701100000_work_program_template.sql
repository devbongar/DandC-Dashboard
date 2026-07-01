CREATE TABLE IF NOT EXISTS work_program_template_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order     integer NOT NULL,
  phase          text NOT NULL CHECK (phase IN ('initiation','planning','execution_monitoring','closeout')),
  milestone_name text NOT NULL,
  parent_id      uuid REFERENCES work_program_template_tasks(id) ON DELETE CASCADE,
  duration       integer CHECK (duration IS NULL OR duration > 0),
  predecessor_text text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE work_program_template_tasks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed when copying to baseline)
CREATE POLICY "template_tasks_read" ON work_program_template_tasks
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only admins can write
CREATE POLICY "template_tasks_admin_write" ON work_program_template_tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
