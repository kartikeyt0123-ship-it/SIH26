CREATE TABLE "climate_contexts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"city" text,
	"source" text DEFAULT 'demo' NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"project_id" text NOT NULL,
	"signals" jsonb NOT NULL,
	"profile" jsonb NOT NULL,
	"engine" text DEFAULT 'rules-v1' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_variations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"intent" text NOT NULL,
	"base_spec" jsonb NOT NULL,
	"schemes" jsonb NOT NULL,
	"engine" text DEFAULT 'rules-v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surface_analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"image_id" text,
	"engine" text NOT NULL,
	"observations" jsonb NOT NULL,
	"prep_plan" jsonb NOT NULL,
	"severity" text DEFAULT 'none' NOT NULL,
	"confidence" text DEFAULT 'low' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "climate_contexts" ADD CONSTRAINT "climate_contexts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_profiles" ADD CONSTRAINT "design_profiles_session_id_customer_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."customer_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_profiles" ADD CONSTRAINT "design_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_variations" ADD CONSTRAINT "design_variations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surface_analyses" ADD CONSTRAINT "surface_analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surface_analyses" ADD CONSTRAINT "surface_analyses_image_id_project_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."project_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "design_profiles_session" ON "design_profiles" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "surface_analyses_project_image" ON "surface_analyses" USING btree ("project_id","image_id");