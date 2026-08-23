CREATE TABLE "otp_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"channel" text DEFAULT 'console' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shade_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"dealer_id" text NOT NULL,
	"project_id" text,
	"session_id" text,
	"shade_code" text NOT NULL,
	"shade_name" text NOT NULL,
	"shade_hex" text NOT NULL,
	"substitute_code" text,
	"substitute_name" text,
	"customer_name" text,
	"customer_phone" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "lon" double precision;--> statement-breakpoint
ALTER TABLE "shade_requests" ADD CONSTRAINT "shade_requests_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shade_requests" ADD CONSTRAINT "shade_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shade_requests" ADD CONSTRAINT "shade_requests_session_id_customer_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."customer_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dealers_phone" ON "dealers" USING btree ("phone");