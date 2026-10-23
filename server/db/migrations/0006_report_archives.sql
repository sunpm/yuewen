CREATE TABLE "report_archive" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_report_id" text NOT NULL,
	"source_version" integer NOT NULL,
	"source_status" text NOT NULL,
	"include_notes" boolean NOT NULL,
	"bytes" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "archive_bytes_check" CHECK ("report_archive"."bytes" > 0 and "report_archive"."bytes" <= 2097152),
	CONSTRAINT "archive_version_check" CHECK ("report_archive"."source_version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "report_archive" ADD CONSTRAINT "report_archive_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "archive_user_created_idx" ON "report_archive" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "archive_source_idx" ON "report_archive" USING btree ("user_id","source_report_id","source_version","include_notes");