/**
 * Database Schema Definitions
 *
 * SQLite schema for storing division data.
 */

/** SQLite table creation statements */
export const DATABASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS divisions (
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    level INTEGER NOT NULL,
    parent_code TEXT,
    year INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    source_type TEXT,
    confidence_score INTEGER,
    urban_rural_code TEXT,
    -- 复合主键：同一区划码可跨多个年份并存（年份版本化的真相源）
    PRIMARY KEY (code, year)
);

CREATE INDEX IF NOT EXISTS idx_parent ON divisions(parent_code);
CREATE INDEX IF NOT EXISTS idx_year ON divisions(year);
CREATE INDEX IF NOT EXISTS idx_level ON divisions(level);
CREATE INDEX IF NOT EXISTS idx_source ON divisions(source_type);

-- Metadata table for tracking data sources
CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Patch history table for audit trail
CREATE TABLE IF NOT EXISTS patch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patch_file TEXT NOT NULL,
    applied_at TEXT DEFAULT (datetime('now')),
    author TEXT NOT NULL,
    operations_count INTEGER NOT NULL
);
`;

/** Division insert statement (prepared) */
export const INSERT_DIVISION = `
INSERT OR REPLACE INTO divisions (
    code, name, level, parent_code, year,
    status, source_type, confidence_score, urban_rural_code
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/** Batch insert for migrations */
export const INSERT_DIVISIONS_BATCH = `
INSERT OR REPLACE INTO divisions (
    code, name, level, parent_code, year,
    status, source_type, confidence_score, urban_rural_code
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
