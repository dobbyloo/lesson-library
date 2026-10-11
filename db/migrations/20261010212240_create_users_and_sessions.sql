-- migrate:up

-- People who can log in. Teachers only: students never have a row here. A future student
-- app keeps its own accounts and calls the API with a token.
CREATE TABLE users (
    id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    username text NOT NULL,
    password_hash text NOT NULL,
    -- no default: every insert has to say which role it grants
    role text NOT NULL CHECK (role IN ('teacher')),
    -- 3 to 30 characters: a lowercase letter, then lowercase letters, digits, dot,
    -- underscore, or hyphen. Lowercase only, so each username has one spelling and the
    -- plain unique constraint is enough.
    CONSTRAINT users_username_format CHECK (username ~ '^[a-z][a-z0-9._-]{2,29}$'),
    CONSTRAINT users_username_unique UNIQUE (username)
);

-- One row per logged-in browser. token_hash is a hash of the session token, never the
-- token itself, so a leaked backup cannot be used to log in.
CREATE TABLE user_sessions (
    id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT user_sessions_token_hash_unique UNIQUE (token_hash)
);

-- migrate:down

DROP TABLE user_sessions;
DROP TABLE users;

