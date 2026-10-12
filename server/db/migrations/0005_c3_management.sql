ALTER TABLE "report_replacement" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "report_replacement" ALTER COLUMN "session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "console_audit" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "report_replacement" ADD COLUMN "guest_id" text;--> statement-breakpoint
ALTER TABLE "report_replacement" ADD CONSTRAINT "report_replacement_guest_id_guest_connection_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guest_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "replacement_guest_request_idx" ON "report_replacement" USING btree ("guest_id","request_id");--> statement-breakpoint
ALTER TABLE "report_replacement" ADD CONSTRAINT "replacement_owner_check" CHECK (("report_replacement"."guest_id" is not null and "report_replacement"."user_id" is null and "report_replacement"."session_id" is null) or ("report_replacement"."guest_id" is null and "report_replacement"."user_id" is not null and "report_replacement"."session_id" is not null));