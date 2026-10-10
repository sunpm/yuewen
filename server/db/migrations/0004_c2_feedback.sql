CREATE TABLE "console_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_id" text NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_type" text NOT NULL,
	"user_id" text,
	"guest_id" text,
	"associated_user_id" text,
	"source" text NOT NULL,
	"description" text NOT NULL,
	"steps" text NOT NULL,
	"contact" text NOT NULL,
	"environment" jsonb NOT NULL,
	"server_environment" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"category" text DEFAULT 'uncategorized' NOT NULL,
	"internal_note" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_owner_check" CHECK (("feedback"."owner_type" = 'account' and "feedback"."user_id" is not null and "feedback"."guest_id" is null) or ("feedback"."owner_type" = 'guest' and "feedback"."user_id" is null) or ("feedback"."owner_type" = 'visitor' and "feedback"."user_id" is null and "feedback"."guest_id" is null))
);
--> statement-breakpoint
CREATE TABLE "feedback_attachment" (
	"feedback_id" text PRIMARY KEY NOT NULL,
	"object_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"digest" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"state" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "feedback_attachment_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "feedback_context" (
	"id" text PRIMARY KEY NOT NULL,
	"identity_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_object_delete" (
	"object_key" text PRIMARY KEY NOT NULL,
	"bytes" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_storage_scan" (
	"id" integer PRIMARY KEY NOT NULL,
	"cursor" text,
	"next_scan_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_submission" (
	"request_id" text PRIMARY KEY NOT NULL,
	"context_id" text NOT NULL,
	"digest" text NOT NULL,
	"feedback_id" text NOT NULL,
	"state" text NOT NULL,
	"lease_id" text,
	"lease_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_guest_id_guest_connection_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guest_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_associated_user_id_app_user_id_fk" FOREIGN KEY ("associated_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_attachment" ADD CONSTRAINT "feedback_attachment_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_submission" ADD CONSTRAINT "feedback_submission_context_id_feedback_context_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."feedback_context"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "console_audit_expiry_idx" ON "console_audit" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "feedback_created_idx" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_owner_idx" ON "feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_guest_idx" ON "feedback" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "feedback_associated_user_idx" ON "feedback" USING btree ("associated_user_id");--> statement-breakpoint
CREATE INDEX "feedback_expiry_idx" ON "feedback" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "feedback_attachment_expiry_idx" ON "feedback_attachment" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "feedback_context_expiry_idx" ON "feedback_context" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "feedback_context_identity_idx" ON "feedback_context" USING btree ("identity_hash","expires_at");--> statement-breakpoint
CREATE INDEX "feedback_delete_due_idx" ON "feedback_object_delete" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "feedback_submission_expiry_idx" ON "feedback_submission" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_submission_feedback_idx" ON "feedback_submission" USING btree ("feedback_id");