-- sql/00_reset_all.sql
-- ⚠️ Executar apenas em ambiente de desenvolvimento/teste.
-- Remove objetos se existirem (ordem cuidadosa).
drop table if exists checklist_responses cascade;
drop table if exists checklist_templates cascade;
drop table if exists models cascade;
drop table if exists audit_log cascade;
drop table if exists sigadaer cascade;
drop table if exists notifications cascade;
drop table if exists internal_opinions cascade;
drop table if exists processes cascade;
drop table if exists profiles cascade;

drop type if exists user_role cascade;
drop type if exists process_type cascade;
drop type if exists process_status cascade;
drop type if exists opinion_type cascade;
drop type if exists opinion_status cascade;
drop type if exists notification_type cascade;
drop type if exists notification_status cascade;
drop type if exists sigadaer_type cascade;
drop type if exists sigadaer_status cascade;
