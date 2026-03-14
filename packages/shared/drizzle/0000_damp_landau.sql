CREATE TYPE "public"."typescript_support" AS ENUM('native', 'definitely-typed', 'none');--> statement-breakpoint
CREATE TABLE "package_metadata" (
	"package_name" text PRIMARY KEY NOT NULL,
	"weekly_downloads" integer,
	"github_stars" integer,
	"github_open_issues" integer,
	"last_commit_date" timestamp with time zone,
	"has_typescript_support" "typescript_support" DEFAULT 'none' NOT NULL,
	"readme_length" integer,
	"dependency_count" integer
);
--> statement-breakpoint
CREATE TABLE "package_scores" (
	"package_name" text PRIMARY KEY NOT NULL,
	"overall_score" real NOT NULL,
	"popularity_score" real NOT NULL,
	"maintenance_score" real NOT NULL,
	"quality_score" real NOT NULL,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"name" text PRIMARY KEY NOT NULL,
	"description" text,
	"latest_version" text,
	"license" text,
	"homepage_url" text,
	"repository_url" text,
	"keywords" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "package_metadata" ADD CONSTRAINT "package_metadata_package_name_packages_name_fk" FOREIGN KEY ("package_name") REFERENCES "public"."packages"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_scores" ADD CONSTRAINT "package_scores_package_name_packages_name_fk" FOREIGN KEY ("package_name") REFERENCES "public"."packages"("name") ON DELETE no action ON UPDATE no action;