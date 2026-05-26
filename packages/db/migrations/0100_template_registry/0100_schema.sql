create schema if not exists template_registry;
create type template_registry.package_status as enum ('registered','published','active','retired','revoked');
create type template_registry.upgrade_state as enum ('announced','staged','dual_published','cutover','retired','paused','rolled_back');
create type template_registry.compatibility_status as enum ('missing','uploaded','vetted','compatible','stale','incompatible','side_channel_detected');
-- verify: select 1 from information_schema.schemata where schema_name='template_registry';
