-- Session IP and user-agent fingerprints are not used for authentication or authorization.
-- Purge values written by previous releases and keep future sessions free of them.
UPDATE sessions SET user_agent = NULL, ip_prefix = NULL;
