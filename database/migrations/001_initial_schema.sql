-- SceneSync Database Schema Migration 001

CREATE TABLE IF NOT EXISTS shows (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    poster_url TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS episodes (
    id VARCHAR(64) PRIMARY KEY,
    show_id VARCHAR(64) NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    season_number INTEGER NOT NULL,
    episode_number INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    canonical_order INTEGER NOT NULL,
    content_status VARCHAR(32) NOT NULL DEFAULT 'ready',
    UNIQUE (show_id, canonical_order)
);

CREATE INDEX IF NOT EXISTS idx_episodes_show_order ON episodes (show_id, canonical_order);

CREATE TABLE IF NOT EXISTS characters (
    id VARCHAR(64) PRIMARY KEY,
    show_id VARCHAR(64) NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    image_url TEXT,
    first_appearance_episode_id VARCHAR(64) REFERENCES episodes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS facts (
    id VARCHAR(64) PRIMARY KEY,
    show_id VARCHAR(64) NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    episode_id VARCHAR(64) NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    character_id VARCHAR(64) REFERENCES characters(id) ON DELETE SET NULL,
    fact_text TEXT NOT NULL,
    source_id VARCHAR(128) NOT NULL,
    verification_status VARCHAR(32) NOT NULL DEFAULT 'verified'
);

CREATE INDEX IF NOT EXISTS idx_facts_show_episode ON facts (show_id, episode_id);

CREATE TABLE IF NOT EXISTS relationships (
    id VARCHAR(64) PRIMARY KEY,
    character_id VARCHAR(64) NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    related_character_id VARCHAR(64) NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    relationship_type VARCHAR(128) NOT NULL,
    established_episode_id VARCHAR(64) NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(64) PRIMARY KEY,
    room_code VARCHAR(16) NOT NULL UNIQUE,
    show_id VARCHAR(64) NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    host_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'lobby',
    boundary_episode_id VARCHAR(64) REFERENCES episodes(id) ON DELETE SET NULL,
    boundary_version INTEGER NOT NULL DEFAULT 1,
    invitation_token_hash VARCHAR(128) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_room_code ON sessions (room_code);

CREATE TABLE IF NOT EXISTS session_members (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    anonymous_identity VARCHAR(128) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    last_watched_episode_id VARCHAR(64) REFERENCES episodes(id) ON DELETE SET NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'guest',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (session_id, anonymous_identity)
);

CREATE INDEX IF NOT EXISTS idx_session_members_session ON session_members (session_id);

CREATE TABLE IF NOT EXISTS recaps (
    id VARCHAR(64) PRIMARY KEY,
    show_id VARCHAR(64) NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    boundary_episode_id VARCHAR(64) REFERENCES episodes(id) ON DELETE SET NULL,
    boundary_version INTEGER NOT NULL,
    content_version VARCHAR(32) NOT NULL DEFAULT 'v1',
    body TEXT NOT NULL,
    key_events JSONB NOT NULL DEFAULT '[]'::jsonb,
    suggested_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions_and_answers (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    member_id VARCHAR(64) NOT NULL REFERENCES session_members(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    boundary_snapshot JSONB NOT NULL,
    answer_status VARCHAR(64) NOT NULL,
    answer_body TEXT NOT NULL,
    claims JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_qa_session ON questions_and_answers (session_id);
