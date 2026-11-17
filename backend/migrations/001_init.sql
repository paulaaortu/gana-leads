CREATE TABLE agents (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  role  TEXT NOT NULL CHECK (role IN ('agent', 'admin'))
);

CREATE TABLE leads (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'nuevo'
                  CHECK (status IN ('nuevo', 'en_gestion', 'contactado', 'cerrado')),
  agent_id        INT REFERENCES agents(id) ON DELETE SET NULL,
  is_new_customer BOOLEAN,
  interest        TEXT CHECK (interest IN ('low', 'medium', 'high')),
  source          TEXT CHECK (source IN ('referral', 'web', 'event', 'cold')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  version         INT NOT NULL DEFAULT 1
);

CREATE INDEX leads_status_idx     ON leads (status);
CREATE INDEX leads_agent_idx      ON leads (agent_id);
CREATE INDEX leads_created_at_idx ON leads (created_at);

CREATE TABLE weight_configs (
  id          SERIAL PRIMARY KEY,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_by  INT REFERENCES agents(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX weight_configs_single_active
  ON weight_configs (is_active) WHERE is_active;

CREATE TABLE weight_config_items (
  config_id  INT NOT NULL REFERENCES weight_configs(id) ON DELETE CASCADE,
  criterion  TEXT NOT NULL CHECK (criterion IN
             ('new_customer', 'commercial_interest', 'lead_source', 'seniority')),
  weight     INT NOT NULL CHECK (weight BETWEEN 0 AND 100),
  PRIMARY KEY (config_id, criterion)
);

INSERT INTO weight_configs (is_active) VALUES (true);
INSERT INTO weight_config_items (config_id, criterion, weight) VALUES
  (1, 'new_customer', 40), (1, 'commercial_interest', 30),
  (1, 'lead_source', 20),  (1, 'seniority', 10);