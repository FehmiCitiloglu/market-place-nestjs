-- Integration-test database. Init scripts only run when the data directory
-- is empty, so a plain statement is safe here. The application uses separate
-- credentials in deployed environments
-- (see docs/operations/database-migrations.md).
CREATE DATABASE mercato_test;
