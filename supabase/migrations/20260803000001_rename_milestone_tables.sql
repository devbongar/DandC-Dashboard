-- Rename milestone tables to workprogram naming convention
ALTER TABLE project_milestones    RENAME TO workprogram_activities;
ALTER TABLE milestone_dependencies RENAME TO workprogram_dependencies;
