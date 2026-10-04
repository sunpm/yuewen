CREATE TABLE "report_replacement" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"request_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_replacement" ADD CONSTRAINT "report_replacement_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_replacement" ADD CONSTRAINT "report_replacement_session_id_auth_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "replacement_expiry_idx" ON "report_replacement" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "replacement_request_idx" ON "report_replacement" USING btree ("user_id","request_id");