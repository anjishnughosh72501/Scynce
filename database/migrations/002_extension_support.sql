-- SceneSync Database Migration 002: Browser Extension & Device Linking Support

CREATE TABLE IF NOT EXISTS extension_linkings (
    id VARCHAR(64) PRIMARY KEY,
    installation_id VARCHAR(128) NOT NULL UNIQUE,
    owner_id VARCHAR(128) NOT NULL,
    session_id VARCHAR(64) REFERENCES sessions(id) ON DELETE SET NULL,
    provider_id VARCHAR(64),
    detected_content_context JSONB,
    confirmed_content_context JSONB,
    connection_status VARCHAR(32) NOT NULL DEFAULT 'connected',
    display_destination VARCHAR(32) NOT NULL DEFAULT 'all',
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_extension_linkings_session ON extension_linkings (session_id);
CREATE INDEX IF NOT EXISTS idx_extension_linkings_installation ON extension_linkings (installation_id);

-- Add destination and source_client to questions_and_answers if not exists
ALTER TABLE questions_and_answers 
ADD COLUMN IF NOT EXISTS destination VARCHAR(32) DEFAULT 'all',
ADD COLUMN IF NOT EXISTS source_client VARCHAR(32) DEFAULT 'phone';
