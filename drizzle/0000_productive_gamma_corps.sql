CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"customer_label" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "customer_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"dealer_id" text NOT NULL,
	"token" text NOT NULL,
	"customer_name" text NOT NULL,
	"phone" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"permissions" jsonb NOT NULL,
	"opens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "customer_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"dealer_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"locality" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dealer_shades" (
	"dealer_id" text NOT NULL,
	"shade_code" text NOT NULL,
	"producible" boolean DEFAULT true NOT NULL,
	"blocked_reason" text,
	CONSTRAINT "dealer_shades_dealer_id_shade_code_pk" PRIMARY KEY("dealer_id","shade_code")
);
--> statement-breakpoint
CREATE TABLE "dealers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner" text NOT NULL,
	"city" text NOT NULL,
	"pincode" text,
	"phone" text,
	"tier" text DEFAULT 'Pro' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"dealer_id" text NOT NULL,
	"kind" text NOT NULL,
	"headline" text NOT NULL,
	"reason" text NOT NULL,
	"action" text NOT NULL,
	"categories" jsonb NOT NULL,
	"confidence" text NOT NULL,
	"source" text DEFAULT 'demo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"dealer_id" text NOT NULL,
	"product_id" text NOT NULL,
	"litres" double precision DEFAULT 0 NOT NULL,
	"reorder_level" double precision DEFAULT 0 NOT NULL,
	"weekly_offtake" double precision DEFAULT 0 NOT NULL,
	"lead_time_days" integer DEFAULT 7 NOT NULL,
	"selling_per_litre" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"finish" text NOT NULL,
	"budget_band" text NOT NULL,
	"mrp_per_litre" integer NOT NULL,
	"coverage" integer NOT NULL,
	"pack_sizes" jsonb NOT NULL,
	"features" jsonb NOT NULL,
	"blurb" text
);
--> statement-breakpoint
CREATE TABLE "project_images" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"dealer_id" text NOT NULL,
	"session_id" text NOT NULL,
	"customer_id" text,
	"title" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"step" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"quoted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" text PRIMARY KEY NOT NULL,
	"dealer_id" text NOT NULL,
	"project_id" text NOT NULL,
	"session_id" text NOT NULL,
	"lines" jsonb NOT NULL,
	"areas" jsonb NOT NULL,
	"subtotal" integer NOT NULL,
	"discount_pct" real DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"overrode_availability" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"schemes" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"raw_text" text,
	"parsed_spec" jsonb NOT NULL,
	"measurements" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" text PRIMARY KEY NOT NULL,
	"dealer_id" text NOT NULL,
	"quotation_id" text,
	"product_id" text,
	"litres" double precision NOT NULL,
	"amount" integer NOT NULL,
	"sold_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_designs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"scheme_id" text NOT NULL,
	"label" text,
	"scheme" jsonb NOT NULL,
	"is_chosen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shades" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hex" text NOT NULL,
	"family" text NOT NULL,
	"lab_l" real NOT NULL,
	"lab_a" real NOT NULL,
	"lab_b" real NOT NULL,
	"wall_safe" boolean DEFAULT true NOT NULL,
	"exterior_suitable" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"dealer_id" text,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"role" text DEFAULT 'DEALER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visualizations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"room_model" jsonb NOT NULL,
	"engine" text NOT NULL,
	"confidence" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_shades" ADD CONSTRAINT "dealer_shades_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_shades" ADD CONSTRAINT "dealer_shades_shade_code_shades_code_fk" FOREIGN KEY ("shade_code") REFERENCES "public"."shades"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_signals" ADD CONSTRAINT "demand_signals_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_images" ADD CONSTRAINT "project_images_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_session_id_customer_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."customer_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_session_id_customer_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."customer_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_designs" ADD CONSTRAINT "saved_designs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visualizations" ADD CONSTRAINT "visualizations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_dealer_product" ON "inventory" USING btree ("dealer_id","product_id");