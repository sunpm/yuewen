CREATE TABLE "connection_save" (
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"session_id" text NOT NULL,
	"guest_id" text NOT NULL,
	"report_id" text NOT NULL,
	"key_version" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"encryption_version" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'valid' NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_connection_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "reading_report" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_report" ALTER COLUMN "session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_report" ADD COLUMN "guest_id" text;--> statement-breakpoint
ALTER TABLE "connection_save" ADD CONSTRAINT "connection_save_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_save" ADD CONSTRAINT "connection_save_session_id_auth_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connection_save_request_idx" ON "connection_save" USING btree ("user_id","request_id");--> statement-breakpoint
ALTER TABLE "reading_report" ADD CONSTRAINT "reading_report_guest_id_guest_connection_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guest_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_guest_idx" ON "reading_report" USING btree ("guest_id");--> statement-breakpoint
ALTER TABLE "reading_report" ADD CONSTRAINT "report_owner_check" CHECK (("reading_report"."guest_id" is not null and "reading_report"."user_id" is null and "reading_report"."session_id" is null) or ("reading_report"."guest_id" is null and "reading_report"."user_id" is not null and "reading_report"."session_id" is not null));