CREATE TABLE "console_auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "console_auth_rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "console_auth_rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "console_auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "console_auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "console_auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "console_auth_user_email_unique" UNIQUE("email"),
	CONSTRAINT "console_auth_user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "console_auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "console_auth_account" ADD CONSTRAINT "console_auth_account_user_id_console_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."console_auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "console_auth_session" ADD CONSTRAINT "console_auth_session_user_id_console_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."console_auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "console_account_user_idx" ON "console_auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "console_session_user_idx" ON "console_auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "console_single_admin_idx" ON "console_auth_user" USING btree ((true));--> statement-breakpoint
CREATE INDEX "console_verification_identifier_idx" ON "console_auth_verification" USING btree ("identifier");