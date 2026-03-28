-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS TABLE
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'user')), -- admin or user
  seniority_date DATE NOT NULL, -- for seniority calculation
  team_id UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- TEAMS TABLE
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  weekly_meeting_day VARCHAR(10), -- 'monday', 'tuesday', etc.
  color VARCHAR(7) NOT NULL DEFAULT '#6366f1', -- hex color
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- USER_TEAMS join table (many-to-many: a user can belong to multiple teams)
CREATE TABLE user_teams (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, team_id)
);

-- Add foreign key for teams
ALTER TABLE users ADD CONSTRAINT fk_users_team
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- SHIFTS TABLE (individual day assignments)
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  shift_date DATE NOT NULL,
  shift_type VARCHAR(20) NOT NULL CHECK (shift_type IN ('office', 'smartwork', 'sick', 'vacation', 'permission')),
  locked BOOLEAN DEFAULT false, -- cannot be changed if true
  locked_by UUID, -- admin who locked it
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, shift_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- SHIFT SWAP REQUESTS TABLE
CREATE TABLE shift_swap_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL,
  responder_id UUID NOT NULL,
  requester_shift_id UUID NOT NULL,
  responder_shift_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (responder_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (requester_shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
  FOREIGN KEY (responder_shift_id) REFERENCES shifts(id) ON DELETE CASCADE
);

-- ON-CALL ASSIGNMENTS TABLE
CREATE TABLE on_call_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, week_start_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- SETTINGS TABLE (company configuration)
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(255) UNIQUE NOT NULL,
  value VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- GOOGLE CALENDAR SYNC TABLE
CREATE TABLE google_calendar_syncs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  google_calendar_id VARCHAR(255),
  google_access_token TEXT,
  google_refresh_token TEXT,
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- AUDIT LOG TABLE
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  action VARCHAR(255) NOT NULL,
  description TEXT,
  resource_type VARCHAR(100),
  resource_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX idx_shifts_user_date ON shifts(user_id, shift_date);
CREATE INDEX idx_shifts_date ON shifts(shift_date);
CREATE INDEX idx_on_call_week ON on_call_assignments(week_start_date);
CREATE INDEX idx_users_team ON users(team_id);
CREATE INDEX idx_swap_requester ON shift_swap_requests(requester_id);
CREATE INDEX idx_swap_responder ON shift_swap_requests(responder_id);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('max_office_capacity', '30'),
  ('on_call_count', '1'),
  ('timezone', 'Europe/Rome');
